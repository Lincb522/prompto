#!/usr/bin/env node
/**
 * Prompto MCP Server
 *
 * 提供两个工具：
 * - optimize_prompt: 优化/改写提示词
 * - list_engines: 列出可用引擎配置
 *
 * 优化逻辑：直接调用本地已安装的 CLI（claude/codex/kiro-cli）或自定义 API。
 * 读取 ~/Library/Application Support/prompto/config.json 获取用户配置。
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import {
  getProjectContext,
  analyzeProject,
  formatContextForPrompt,
  formatContextFull,
  cleanup,
  type ProjectContext,
} from "./project-context.js";

function execCommand(
  command: string,
  args: string[],
  options: { timeout: number; env: Record<string, string>; input?: string }
): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      env: options.env,
      timeout: options.timeout,
      stdio: ["pipe", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (d: Buffer) => { stdout += d.toString(); });
    child.stderr.on("data", (d: Buffer) => { stderr += d.toString(); });

    child.on("error", (err) => reject(err));
    child.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(`退出码 ${code}: ${stderr}`));
      } else {
        resolve({ stdout, stderr });
      }
    });

    if (options.input) {
      child.stdin.write(options.input);
      child.stdin.end();
    } else {
      child.stdin.end();
    }
  });
}

// ============================================================
// 配置读取
// ============================================================

interface CliTemplate {
  command: string;
  args: string[];
  stdin_mode: boolean;
  model: string;
  model_flag: string;
  reasoning_effort: string;
  strip_patterns: string[];
  supports_passthrough: boolean;
}

interface AppConfig {
  engine: string;
  target_cli: string;
  custom_api: {
    base_url: string;
    api_key: string;
    model: string;
    stream: boolean;
    temperature: number;
  };
  cli_templates: Record<string, CliTemplate>;
  system_prompt: string;
}

const DEFAULT_SYSTEM_PROMPT = `你是 Prompto，一个专业的提示词工程师。你的工作是接收开发者写给 AI 编程助手（如 Claude Code、Codex、Kiro、Cursor 等）的原始提示词，将其改写为更清晰、更完整、更容易被正确执行的版本。

你的身份定位：
你不是执行任务的人，你是"翻译官"——把开发者脑子里模糊的想法翻译成 AI 编程助手能精确理解的指令。你熟悉各种编程场景，知道 AI 助手需要哪些信息才能一次做对。

改写方法论：

第一步：识别意图类型
判断这是哪种任务：新功能开发、Bug 修复、重构、代码解释、配置/部署、调研/对比。

第二步：补全关键信息
检查原文是否缺少：具体要做什么、技术上下文、输入输出、边界情况、验收标准。缺的就补上。

第三步：组织表达
先说目标，再说背景，再说细节。多个要求用编号列出。

第四步：检查是否过度改写
简单任务保持简短，不要画蛇添足。不要加原文没提到的新功能。

处理信息不足：能推断的补上，不能推断的标注"待确认"。不要编造文件路径、变量名、API 地址。

输出格式：纯文本，不要 Markdown（不要 # ** - * \`\`\`）。用数字编号列举。直接输出改写结果，不要前缀。

语言风格：跟随用户语言，保持专业但不死板。`;

async function loadConfig(): Promise<AppConfig | null> {
  const configPath = join(
    homedir(),
    "Library",
    "Application Support",
    "prompto",
    "config.json"
  );
  try {
    const data = await readFile(configPath, "utf-8");
    return JSON.parse(data);
  } catch {
    return null;
  }
}

// ============================================================
// 历史记录
// ============================================================

interface HistoryItem {
  id: string;
  created_at: number;
  engine: string;
  target_cli: string | null;
  original: string;
  optimized: string;
  pinned: boolean;
}

function historyPath(): string {
  return join(homedir(), "Library", "Application Support", "prompto", "history.json");
}

async function appendHistory(original: string, optimized: string): Promise<void> {
  const path = historyPath();
  let items: HistoryItem[] = [];
  try {
    const data = await readFile(path, "utf-8");
    items = JSON.parse(data);
  } catch {
    // 文件不存在或解析失败
  }

  const config = await loadConfig();
  const engine = config?.engine ?? "mcp";
  const targetCli = config?.engine === "cli-passthrough" ? config.target_cli : null;

  const newItem: HistoryItem = {
    id: crypto.randomUUID(),
    created_at: Date.now(),
    engine: `mcp:${engine}`,
    target_cli: targetCli,
    original,
    optimized,
    pinned: false,
  };

  items.unshift(newItem);

  // 非置顶最多保留 100 条
  const pinned = items.filter((i) => i.pinned);
  const unpinned = items.filter((i) => !i.pinned).slice(0, 100);
  items = [...pinned, ...unpinned].sort((a, b) => b.created_at - a.created_at);

  // 确保目录存在
  const { mkdir, writeFile } = await import("node:fs/promises");
  const { dirname } = await import("node:path");
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(items, null, 2), "utf-8");
}

// ============================================================
// 优化逻辑
// ============================================================

function buildModelArgs(flag: string, model: string): string[] {
  if (!flag || !model) return [];
  const parts = flag.split(/\s+/);
  const last = parts[parts.length - 1];
  if (last.endsWith("=")) {
    return [...parts.slice(0, -1), `${last}${model}`];
  }
  if (parts.length === 1) return [parts[0], model];
  return [...parts, model];
}

function buildReasoningArgs(command: string, effort: string): string[] {
  if (!effort) return [];
  if (command === "codex") return ["-c", `model_reasoning_effort="${effort}"`];
  return [];
}

async function optimizeViaCli(
  input: string,
  config: AppConfig
): Promise<string> {
  const tpl = config.cli_templates[config.target_cli];
  if (!tpl || !tpl.supports_passthrough) {
    throw new Error(`CLI ${config.target_cli} 不支持透传`);
  }

  const systemPrompt = config.system_prompt?.trim() || DEFAULT_SYSTEM_PROMPT;
  const fullPrompt = `${systemPrompt}\n\n---\n原始内容：\n${input}`;

  const args: string[] = [];

  // 展开模板参数
  let hasPromptPlaceholder = false;
  for (const raw of tpl.args) {
    const replaced = raw
      .replace("{prompt}", fullPrompt)
      .replace("{model}", tpl.model || "");
    if (raw.includes("{prompt}")) hasPromptPlaceholder = true;
    args.push(replaced);
  }

  // 追加模型参数
  args.push(...buildModelArgs(tpl.model_flag, tpl.model));
  args.push(...buildReasoningArgs(tpl.command, tpl.reasoning_effort));

  const options: { timeout: number; env: Record<string, string>; input?: string } = {
    timeout: 180_000,
    env: {
      ...process.env,
      NO_COLOR: "1",
      CLICOLOR: "0",
      FORCE_COLOR: "0",
      TERM: "dumb",
    } as Record<string, string>,
  };

  // stdin 模式：当模板声明 stdin_mode 且没有 {prompt} 占位时
  // 或者当 prompt 太长（超过 4000 字符）时强制走 stdin 避免 ARG_MAX
  const forceStdin = fullPrompt.length > 4000 && hasPromptPlaceholder;
  if (forceStdin) {
    // 把 args 里的 {prompt} 替换回空，改用 stdin
    const filteredArgs = args.map((a) =>
      a === fullPrompt ? "-" : a
    );
    options.input = fullPrompt;
    const { stdout, stderr } = await execCommand(tpl.command, filteredArgs, options);
    if (!stdout.trim()) {
      throw new Error(`CLI 没有返回内容。${stderr ? `stderr: ${stderr}` : ""}`);
    }
    return cleanOutput(stdout, tpl);
  }

  if (tpl.stdin_mode && !hasPromptPlaceholder) {
    options.input = fullPrompt;
  }

  const { stdout, stderr } = await execCommand(tpl.command, args, options);

  if (!stdout.trim()) {
    throw new Error(`CLI 没有返回内容。${stderr ? `stderr: ${stderr}` : ""}`);
  }

  return cleanOutput(stdout, tpl);
}

function cleanOutput(raw: string, tpl: CliTemplate): string {
  // 清洗 ANSI
  let result = raw.replace(/\x1b\[[0-9;?]*[A-Za-z]/g, "");

  // Codex 块提取
  if (result.includes("OpenAI Codex") && result.includes("\ncodex\n")) {
    const lines = result.split("\n");
    const start = lines.lastIndexOf("codex") + 1;
    const end = lines.indexOf("tokens used", start);
    if (start > 0) {
      result = lines
        .slice(start, end > start ? end : undefined)
        .map((l) => l.replace(/^> /, "").replace(/^  /, ""))
        .join("\n")
        .trim();
    }
  }

  // 行级 strip
  if (tpl.strip_patterns.length > 0) {
    const regexes = tpl.strip_patterns
      .map((p) => { try { return new RegExp(p); } catch { return null; } })
      .filter(Boolean) as RegExp[];
    result = result
      .split("\n")
      .map((line) => {
        for (const re of regexes) {
          if (re.test(line)) {
            const stripped = line.replace(re, "");
            return stripped.trim() ? stripped : null;
          }
        }
        return line;
      })
      .filter((l) => l !== null)
      .join("\n")
      .trim();
  }

  return result;
}

async function optimizeViaApi(
  input: string,
  config: AppConfig
): Promise<string> {
  const { base_url, api_key, model, temperature } = config.custom_api;
  if (!base_url) throw new Error("未配置 API Base URL");

  const systemPrompt = config.system_prompt?.trim() || DEFAULT_SYSTEM_PROMPT;

  const resp = await fetch(`${base_url.replace(/\/$/, "")}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(api_key ? { Authorization: `Bearer ${api_key}` } : {}),
    },
    body: JSON.stringify({
      model: model || "gpt-4o-mini",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: input },
      ],
      temperature: temperature ?? 0.3,
      stream: false,
    }),
  });

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`API 错误 ${resp.status}: ${text}`);
  }

  const data = (await resp.json()) as { choices: { message: { content: string } }[] };
  return data.choices?.[0]?.message?.content?.trim() || "";
}

async function optimizeViaRules(input: string): Promise<string> {
  // 简单规则：trim + 结构化
  const trimmed = input.trim().replace(/\n{3,}/g, "\n\n");
  return `任务：\n${trimmed}\n\n约束：\n1. 保持现有代码风格\n2. 不引入未经许可的新依赖\n\n交付：\n1. 给出完整可运行的代码\n2. 说明修改了哪些文件`;
}

async function optimize(input: string, projectDir?: string): Promise<string> {
  const config = await loadConfig();

  // 获取项目上下文（如果有工作目录）
  let projectContextText = "";
  if (projectDir) {
    try {
      const ctx = await getProjectContext(projectDir);
      projectContextText = formatContextForPrompt(ctx);
    } catch { /* ignore */ }
  } else {
    // 尝试用 cwd
    try {
      const ctx = await getProjectContext(process.cwd());
      projectContextText = formatContextForPrompt(ctx);
    } catch { /* ignore */ }
  }

  // 把项目上下文注入到 config 的 system_prompt 前面（精简版，控制 token）
  if (projectContextText && config) {
    // 截取前 300 字符避免 prompt 过长导致 CLI 超时
    const shortContext = projectContextText.length > 300
      ? projectContextText.slice(0, 300) + "..."
      : projectContextText;
    const originalPrompt = config.system_prompt?.trim() || DEFAULT_SYSTEM_PROMPT;
    config.system_prompt = `${originalPrompt}\n\n[项目信息] ${shortContext}`;
  }

  if (!config) {
    return optimizeViaRules(input);
  }

  switch (config.engine) {
    case "cli-passthrough":
      return optimizeViaCli(input, config);
    case "custom-api":
      return optimizeViaApi(input, config);
    case "rule-based":
      return optimizeViaRules(input);
    default:
      return optimizeViaRules(input);
  }
}

// ============================================================
// MCP Server
// ============================================================

const server = new Server(
  { name: "prompto", version: "0.2.0" },
  { capabilities: { tools: {} } }
);

// ============================================================
// 消息队列（多路通信桥）
// ============================================================

const QUEUE_DIR = join(homedir(), "Library", "Application Support", "prompto", "mcp-queue");

interface QueueMessage {
  id: string;
  timestamp: number;
  type: "optimization_result";
  original: string;
  optimized: string;
  engine: string;
  consumed: boolean;
}

async function ensureQueueDir() {
  const { mkdir } = await import("node:fs/promises");
  await mkdir(QUEUE_DIR, { recursive: true });
}

async function readQueue(channel?: string): Promise<QueueMessage[]> {
  await ensureQueueDir();
  const { readdir, readFile: rf } = await import("node:fs/promises");
  const { existsSync } = await import("node:fs");
  try {
    // 如果指定了通道，只读该通道目录
    const dirs: string[] = [];
    if (channel) {
      // channel 可能是 ID 或项目路径
      const channelDir = join(QUEUE_DIR, channel);
      if (existsSync(channelDir)) {
        dirs.push(channelDir);
      } else {
        // 尝试按项目路径匹配：遍历所有通道目录找匹配的
        const allDirs = await readdir(QUEUE_DIR).catch(() => [] as string[]);
        for (const d of allDirs) {
          const dirPath = join(QUEUE_DIR, d);
          const files = await readdir(dirPath).catch(() => [] as string[]);
          for (const f of files.filter(f => f.endsWith(".json")).slice(0, 1)) {
            try {
              const data = JSON.parse(await rf(join(dirPath, f), "utf-8"));
              if (data.project_dir === channel || data.channel === channel) {
                dirs.push(dirPath);
                break;
              }
            } catch {}
          }
        }
      }
    } else {
      // 读取所有通道
      const allDirs = await readdir(QUEUE_DIR).catch(() => [] as string[]);
      for (const d of allDirs) {
        dirs.push(join(QUEUE_DIR, d));
      }
    }

    const messages: QueueMessage[] = [];
    for (const dir of dirs) {
      try {
        const files = await readdir(dir);
        for (const file of files.filter(f => f.endsWith(".json")).sort()) {
          try {
            const data = await rf(join(dir, file), "utf-8");
            messages.push(JSON.parse(data));
          } catch {}
        }
      } catch {}
    }
    return messages;
  } catch {
    return [];
  }
}

async function getPendingMessages(channel?: string): Promise<QueueMessage[]> {
  const all = await readQueue(channel);
  return all.filter(m => !m.consumed);
}

async function markConsumed(ids: string[]) {
  const { readFile: rf, writeFile: wf, readdir } = await import("node:fs/promises");
  await ensureQueueDir();
  // 遍历所有通道子目录
  const channelDirs = await readdir(QUEUE_DIR).catch(() => [] as string[]);
  for (const dir of channelDirs) {
    const dirPath = join(QUEUE_DIR, dir);
    try {
      const files = await readdir(dirPath);
      for (const file of files.filter(f => f.endsWith(".json"))) {
        try {
          const path = join(dirPath, file);
          const data = JSON.parse(await rf(path, "utf-8")) as QueueMessage;
          if (ids.includes(data.id)) {
            data.consumed = true;
            await wf(path, JSON.stringify(data, null, 2), "utf-8");
          }
        } catch {}
      }
    } catch {}
  }
}

async function cleanOldMessages() {
  const { readdir, unlink, readFile: rf } = await import("node:fs/promises");
  await ensureQueueDir();
  try {
    const channelDirs = await readdir(QUEUE_DIR);
    const now = Date.now();
    for (const dir of channelDirs) {
      const dirPath = join(QUEUE_DIR, dir);
      try {
        const files = await readdir(dirPath);
        for (const file of files.filter(f => f.endsWith(".json"))) {
          try {
            const path = join(dirPath, file);
            const data = JSON.parse(await rf(path, "utf-8")) as QueueMessage;
            if ((data.consumed && now - data.timestamp > 3600_000) || now - data.timestamp > 86400_000) {
              await unlink(path);
            }
          } catch {}
        }
      } catch {}
    }
  } catch {}
}

// 列出工具
server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "optimize_prompt",
      description:
        "优化/改写提示词。将粗糙的提示词改写为结构清晰、对 AI 编程助手更友好的版本。会自动结合当前项目上下文（技术栈、依赖、目录结构）来生成贴合项目的改写。",
      inputSchema: {
        type: "object" as const,
        properties: {
          prompt: {
            type: "string",
            description: "需要优化的原始提示词",
          },
          project_dir: {
            type: "string",
            description: "项目根目录路径（可选，默认使用当前工作目录）",
          },
        },
        required: ["prompt"],
      },
    },
    {
      name: "analyze_project",
      description: "分析当前项目的技术栈、依赖、目录结构等信息，生成项目摘要。后续的 optimize_prompt 调用会自动使用这些信息。",
      inputSchema: {
        type: "object" as const,
        properties: {
          project_dir: {
            type: "string",
            description: "项目根目录路径（可选，默认使用当前工作目录）",
          },
        },
      },
    },
    {
      name: "get_project_context",
      description: "查看当前已分析的项目上下文摘要。",
      inputSchema: {
        type: "object" as const,
        properties: {
          project_dir: {
            type: "string",
            description: "项目根目录路径（可选，默认使用当前工作目录）",
          },
        },
      },
    },
    {
      name: "list_engines",
      description: "列出 Prompto 当前可用的引擎配置和 CLI 状态。",
      inputSchema: {
        type: "object" as const,
        properties: {},
      },
    },
    {
      name: "get_pending_results",
      description: "获取插件端最新的优化结果。当用户在 Prompto 插件中完成提示词改写后，结果会自动推送到这里。可按通道/项目过滤。",
      inputSchema: {
        type: "object" as const,
        properties: {
          channel: {
            type: "string",
            description: "通道 ID 或项目目录路径（可选，不传则获取所有通道）",
          },
          mark_consumed: {
            type: "boolean",
            description: "是否标记为已消费（默认 true）",
          },
        },
      },
    },
    {
      name: "get_latest_optimization",
      description: "获取最近一次的优化结果。如果插件刚完成了一次改写，这里会返回最新的结果。适合在对话中直接使用优化后的提示词。",
      inputSchema: {
        type: "object" as const,
        properties: {
          channel: {
            type: "string",
            description: "通道 ID 或项目目录路径（可选）",
          },
        },
      },
    },
  ],
}));

// 调用工具
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  if (name === "optimize_prompt") {
    const { prompt, project_dir } = args as { prompt?: string; project_dir?: string };
    if (!prompt) {
      return {
        content: [{ type: "text" as const, text: "错误：缺少 prompt 参数" }],
        isError: true,
      };
    }
    try {
      const result = await optimize(prompt, project_dir);
      // 写入历史记录（不影响主流程）
      try { await appendHistory(prompt, result); } catch (histErr) { console.error("写入历史失败:", histErr); }
      return { content: [{ type: "text" as const, text: result }] };
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      return {
        content: [{ type: "text" as const, text: `优化失败：${msg}` }],
        isError: true,
      };
    }
  }

  if (name === "analyze_project") {
    const { project_dir } = args as { project_dir?: string };
    const dir = project_dir || process.cwd();
    try {
      const ctx = await analyzeProject(dir);
      const summary = formatContextFull(ctx);
      return { content: [{ type: "text" as const, text: `项目分析完成：\n\n${summary}` }] };
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      return {
        content: [{ type: "text" as const, text: `分析失败：${msg}` }],
        isError: true,
      };
    }
  }

  if (name === "get_project_context") {
    const { project_dir } = args as { project_dir?: string };
    const dir = project_dir || process.cwd();
    try {
      const ctx = await getProjectContext(dir);
      const summary = formatContextFull(ctx);
      return { content: [{ type: "text" as const, text: summary }] };
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      return {
        content: [{ type: "text" as const, text: `获取上下文失败：${msg}` }],
        isError: true,
      };
    }
  }

  if (name === "list_engines") {
    const config = await loadConfig();
    if (!config) {
      return {
        content: [{ type: "text" as const, text: "未找到 Prompto 配置文件" }],
      };
    }
    const info = {
      current_engine: config.engine,
      target_cli: config.target_cli,
      cli_templates: Object.keys(config.cli_templates),
      custom_api_configured: !!config.custom_api.base_url,
    };
    return {
      content: [{ type: "text" as const, text: JSON.stringify(info, null, 2) }],
    };
  }

  if (name === "get_pending_results") {
    const { channel, mark_consumed = true } = (args || {}) as { channel?: string; mark_consumed?: boolean };
    await cleanOldMessages();
    const pending = await getPendingMessages(channel);
    if (pending.length === 0) {
      return {
        content: [{ type: "text" as const, text: "暂无待处理的优化结果。" }],
      };
    }
    if (mark_consumed) {
      await markConsumed(pending.map(m => m.id));
    }
    const formatted = pending.map(m =>
      `[${new Date(m.timestamp).toLocaleTimeString("zh-CN")}] (${m.engine})\n原文: ${m.original.slice(0, 100)}${m.original.length > 100 ? "..." : ""}\n优化: ${m.optimized}`
    ).join("\n\n---\n\n");
    return {
      content: [{ type: "text" as const, text: `共 ${pending.length} 条待处理结果：\n\n${formatted}` }],
    };
  }

  if (name === "get_latest_optimization") {
    const { channel } = (args || {}) as { channel?: string };
    await cleanOldMessages();
    const all = await readQueue(channel);
    const latest = all.filter(m => !m.consumed).sort((a, b) => b.timestamp - a.timestamp)[0];
    if (!latest) {
      return {
        content: [{ type: "text" as const, text: "暂无新的优化结果。请先在 Prompto 插件中改写提示词。" }],
      };
    }
    // 标记为已消费
    await markConsumed([latest.id]);
    return {
      content: [{ type: "text" as const, text: latest.optimized }],
    };
  }

  return {
    content: [{ type: "text" as const, text: `未知工具: ${name}` }],
    isError: true,
  };
});

// 启动
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Prompto MCP Server 已启动（支持项目上下文分析）");

  // 退出时清理
  process.on("SIGINT", () => { cleanup(); process.exit(0); });
  process.on("SIGTERM", () => { cleanup(); process.exit(0); });
}

main().catch((e) => {
  console.error("启动失败:", e);
  process.exit(1);
});
