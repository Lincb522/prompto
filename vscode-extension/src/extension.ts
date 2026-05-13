import * as vscode from "vscode";
import { execFile, spawn } from "child_process";
import { promisify } from "util";
import { readFileSync, existsSync, writeFileSync, mkdirSync } from "fs";
import { join } from "path";
import { homedir } from "os";

const execFileAsync = promisify(execFile);

// ============================================================
// 类型定义
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

interface CustomApiConfig {
  base_url: string;
  api_key: string;
  model: string;
  stream: boolean;
  temperature: number;
}

interface RuleConfig {
  trim_whitespace: boolean;
  collapse_blank_lines: boolean;
  protect_code_blocks: boolean;
  remove_filler_words: boolean;
  structure_template: boolean;
  normalize_punctuation: boolean;
  require_action_verb: boolean;
  compress_if_too_long: boolean;
  compress_threshold: number;
}

interface AppConfig {
  engine: string;
  target_cli: string;
  custom_api: CustomApiConfig;
  cli_templates: Record<string, CliTemplate>;
  rules: RuleConfig;
  clipboard_watch: boolean;
  shortcut: string;
  system_prompt: string;
  theme: string;
}

interface HistoryItem {
  id: string;
  created_at: number;
  engine: string;
  target_cli: string | null;
  original: string;
  optimized: string;
  pinned: boolean;
}

interface CliStatus {
  cli: string;
  installed: boolean;
  version: string | null;
  command: string;
}

interface ModelInfo {
  slug: string;
  display_name: string;
  description: string | null;
  reasoning_levels: string[];
  default_reasoning: string | null;
}

interface McpStatus {
  ide: string;
  installed: boolean;
}

// ============================================================
// 配置和数据路径
// ============================================================

const CONFIG_DIR = join(homedir(), "Library", "Application Support", "prompto");
const CONFIG_PATH = join(CONFIG_DIR, "config.json");
const HISTORY_PATH = join(CONFIG_DIR, "history.json");

const DEFAULT_SYSTEM_PROMPT = `你是 Prompto，一个专业的提示词工程师。你的工作是接收开发者写给 AI 编程助手（如 Claude Code、Codex、Kiro、Cursor 等）的原始提示词，将其改写为更清晰、更完整、更容易被正确执行的版本。

改写方法论：
第一步：识别意图类型（新功能、Bug修复、重构、解释、配置、调研）
第二步：补全关键信息（具体做什么、技术上下文、输入输出、边界情况、验收标准）
第三步：组织表达（目标→背景→细节，多要求用编号）
第四步：检查是否过度改写（简单任务保持简短）

输出格式：纯文本，不要 Markdown。用数字编号列举。直接输出改写结果。
语言风格：跟随用户语言，保持专业但不死板。`;

const DEFAULT_CONFIG: AppConfig = {
  engine: "cli-passthrough",
  target_cli: "claude",
  custom_api: { base_url: "", api_key: "", model: "gpt-4o-mini", stream: false, temperature: 0.3 },
  cli_templates: {
    codex: { command: "codex", args: ["-q", "{prompt}"], stdin_mode: false, model: "", model_flag: "--model", reasoning_effort: "", strip_patterns: [], supports_passthrough: true },
    claude: { command: "claude", args: ["-p", "{prompt}"], stdin_mode: false, model: "", model_flag: "--model", reasoning_effort: "", strip_patterns: [], supports_passthrough: true },
    kiro: { command: "kiro-cli", args: ["-p", "{prompt}"], stdin_mode: false, model: "", model_flag: "--model", reasoning_effort: "", strip_patterns: [], supports_passthrough: true },
  },
  rules: { trim_whitespace: true, collapse_blank_lines: true, protect_code_blocks: true, remove_filler_words: true, structure_template: true, normalize_punctuation: true, require_action_verb: true, compress_if_too_long: true, compress_threshold: 500 },
  clipboard_watch: false,
  shortcut: "CmdOrCtrl+Shift+P",
  system_prompt: "",
  theme: "system",
};

// ============================================================
// 配置读写
// ============================================================

/**
 * 从 VSCode 设置中读取配置，非空值会覆盖文件配置
 */
function getVscodeSettingsOverrides(): Partial<AppConfig> {
  const cfg = vscode.workspace.getConfiguration("prompto");
  const overrides: Partial<AppConfig> = {};

  // 引擎
  const engine = cfg.get<string>("engine");
  if (engine) overrides.engine = engine;

  // 目标 CLI
  const targetCli = cfg.get<string>("targetCli");
  if (targetCli) overrides.target_cli = targetCli;

  // 主题
  const theme = cfg.get<string>("theme");
  if (theme && theme !== "system") overrides.theme = theme;

  // 快捷键
  const shortcut = cfg.get<string>("shortcut");
  if (shortcut && shortcut !== "CmdOrCtrl+Shift+P") overrides.shortcut = shortcut;

  // 剪贴板监听
  const clipboardWatch = cfg.get<boolean>("clipboardWatch");
  if (clipboardWatch !== undefined && clipboardWatch !== false) overrides.clipboard_watch = clipboardWatch;

  // 系统提示词
  const systemPrompt = cfg.get<string>("systemPrompt");
  if (systemPrompt) overrides.system_prompt = systemPrompt;

  // 自定义 API
  const apiBaseUrl = cfg.get<string>("customApi.baseUrl");
  const apiKey = cfg.get<string>("customApi.apiKey");
  const apiModel = cfg.get<string>("customApi.model");
  const apiTemperature = cfg.get<number>("customApi.temperature");
  const apiStream = cfg.get<boolean>("customApi.stream");
  if (apiBaseUrl || apiKey || apiModel || apiTemperature !== undefined || apiStream !== undefined) {
    overrides.custom_api = {} as any;
    if (apiBaseUrl) (overrides.custom_api as any).base_url = apiBaseUrl;
    if (apiKey) (overrides.custom_api as any).api_key = apiKey;
    if (apiModel && apiModel !== "gpt-4o-mini") (overrides.custom_api as any).model = apiModel;
    if (apiTemperature !== undefined && apiTemperature !== 0.3) (overrides.custom_api as any).temperature = apiTemperature;
    if (apiStream !== undefined && apiStream !== false) (overrides.custom_api as any).stream = apiStream;
  }

  // 规则
  const ruleKeys: { setting: string; configKey: keyof RuleConfig; defaultVal: boolean | number }[] = [
    { setting: "rules.trimWhitespace", configKey: "trim_whitespace", defaultVal: true },
    { setting: "rules.collapseBlankLines", configKey: "collapse_blank_lines", defaultVal: true },
    { setting: "rules.protectCodeBlocks", configKey: "protect_code_blocks", defaultVal: true },
    { setting: "rules.removeFillerWords", configKey: "remove_filler_words", defaultVal: true },
    { setting: "rules.structureTemplate", configKey: "structure_template", defaultVal: true },
    { setting: "rules.normalizePunctuation", configKey: "normalize_punctuation", defaultVal: true },
    { setting: "rules.requireActionVerb", configKey: "require_action_verb", defaultVal: true },
    { setting: "rules.compressIfTooLong", configKey: "compress_if_too_long", defaultVal: true },
    { setting: "rules.compressThreshold", configKey: "compress_threshold", defaultVal: 500 },
  ];
  const rulesOverride: Partial<RuleConfig> = {};
  let hasRuleOverride = false;
  for (const { setting, configKey, defaultVal } of ruleKeys) {
    const val = cfg.get(setting);
    if (val !== undefined && val !== defaultVal) {
      (rulesOverride as any)[configKey] = val;
      hasRuleOverride = true;
    }
  }
  if (hasRuleOverride) overrides.rules = rulesOverride as any;

  // CLI 模板
  const cliNames = ["codex", "claude", "kiro"] as const;
  const cliOverrides: Record<string, Partial<CliTemplate>> = {};
  let hasCliOverride = false;
  for (const cli of cliNames) {
    const command = cfg.get<string>(`cliTemplates.${cli}.command`);
    const model = cfg.get<string>(`cliTemplates.${cli}.model`);
    const modelFlag = cfg.get<string>(`cliTemplates.${cli}.modelFlag`);
    const reasoningEffort = cfg.get<string>(`cliTemplates.${cli}.reasoningEffort`);
    const defaults = DEFAULT_CONFIG.cli_templates[cli];
    const tplOverride: Partial<CliTemplate> = {};
    let hasTplOverride = false;
    if (command && command !== defaults.command) { tplOverride.command = command; hasTplOverride = true; }
    if (model && model !== defaults.model) { tplOverride.model = model; hasTplOverride = true; }
    if (modelFlag && modelFlag !== defaults.model_flag) { tplOverride.model_flag = modelFlag; hasTplOverride = true; }
    if (reasoningEffort && reasoningEffort !== defaults.reasoning_effort) { tplOverride.reasoning_effort = reasoningEffort; hasTplOverride = true; }
    if (hasTplOverride) { cliOverrides[cli] = tplOverride; hasCliOverride = true; }
  }
  if (hasCliOverride) overrides.cli_templates = cliOverrides as any;

  return overrides;
}

function loadConfig(): AppConfig {
  // 1. 从文件加载基础配置
  let fileConfig: AppConfig;
  if (!existsSync(CONFIG_PATH)) {
    fileConfig = { ...DEFAULT_CONFIG };
  } else {
    try {
      const data = JSON.parse(readFileSync(CONFIG_PATH, "utf-8"));
      fileConfig = { ...DEFAULT_CONFIG, ...data };
    } catch {
      fileConfig = { ...DEFAULT_CONFIG };
    }
  }

  // 2. 从 VSCode 设置读取覆盖项
  const overrides = getVscodeSettingsOverrides();

  // 3. 合并（VSCode 设置覆盖文件配置）
  const merged = { ...fileConfig };
  if (overrides.engine) merged.engine = overrides.engine;
  if (overrides.target_cli) merged.target_cli = overrides.target_cli;
  if (overrides.theme) merged.theme = overrides.theme;
  if (overrides.shortcut) merged.shortcut = overrides.shortcut;
  if (overrides.clipboard_watch !== undefined) merged.clipboard_watch = overrides.clipboard_watch;
  if (overrides.system_prompt) merged.system_prompt = overrides.system_prompt;

  // 合并 custom_api（部分覆盖）
  if (overrides.custom_api) {
    merged.custom_api = { ...merged.custom_api, ...overrides.custom_api };
  }

  // 合并 rules（部分覆盖）
  if (overrides.rules) {
    merged.rules = { ...merged.rules, ...overrides.rules };
  }

  // 合并 cli_templates（部分覆盖）
  if (overrides.cli_templates) {
    for (const [cli, tplOverride] of Object.entries(overrides.cli_templates)) {
      if (merged.cli_templates[cli]) {
        merged.cli_templates[cli] = { ...merged.cli_templates[cli], ...tplOverride };
      }
    }
  }

  return merged;
}

function saveConfig(config: AppConfig): void {
  mkdirSync(CONFIG_DIR, { recursive: true });
  writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2), "utf-8");
}

// ============================================================
// 历史记录
// ============================================================

function loadHistory(): HistoryItem[] {
  if (!existsSync(HISTORY_PATH)) return [];
  try {
    return JSON.parse(readFileSync(HISTORY_PATH, "utf-8"));
  } catch {
    return [];
  }
}

function saveHistory(items: HistoryItem[]): void {
  mkdirSync(CONFIG_DIR, { recursive: true });
  writeFileSync(HISTORY_PATH, JSON.stringify(items, null, 2), "utf-8");
}

function appendHistory(original: string, optimized: string, config: AppConfig): HistoryItem {
  const items = loadHistory();
  const newItem: HistoryItem = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    created_at: Date.now(),
    engine: config.engine,
    target_cli: config.engine === "cli-passthrough" ? config.target_cli : null,
    original,
    optimized,
    pinned: false,
  };
  items.unshift(newItem);
  const pinned = items.filter(i => i.pinned);
  const unpinned = items.filter(i => !i.pinned).slice(0, 200);
  const sorted = [...pinned, ...unpinned].sort((a, b) => b.created_at - a.created_at);
  saveHistory(sorted);
  return newItem;
}

// ============================================================
// CLI 检测 & 模型
// ============================================================

async function detectClis(): Promise<CliStatus[]> {
  const clis = [
    { cli: "codex", command: "codex" },
    { cli: "claude", command: "claude" },
    { cli: "kiro", command: "kiro-cli" },
  ];
  const results: CliStatus[] = [];
  for (const { cli, command } of clis) {
    try {
      const { stdout } = await execFileAsync(command, ["--version"], { timeout: 5000 });
      results.push({ cli, installed: true, version: stdout.trim().split("\n")[0], command });
    } catch {
      results.push({ cli, installed: false, version: null, command });
    }
  }
  return results;
}

async function listModels(cli: string): Promise<ModelInfo[]> {
  // 和 Tauri 客户端对齐的模型获取逻辑
  switch (cli) {
    case "claude":
      return claudeDefaultModels();
    case "codex":
      return listCodexModels();
    case "kiro":
      return listKiroModels();
    default:
      return [];
  }
}

function claudeDefaultModels(): ModelInfo[] {
  // 读取 ~/.claude/cache/gateway-models.json（和 codex 类似的缓存机制）
  const cachePath = join(homedir(), ".claude", "cache", "gateway-models.json");
  if (existsSync(cachePath)) {
    try {
      const data = JSON.parse(readFileSync(cachePath, "utf-8"));
      const arr = data.models || [];
      if (arr.length > 0) {
        return arr.map((m: any) => ({
          slug: m.id || m.slug || "",
          display_name: m.display_name || m.id || "",
          description: null,
          reasoning_levels: [],
          default_reasoning: null,
        })).filter((m: ModelInfo) => m.slug);
      }
    } catch {}
  }
  // 回退
  return [
    { slug: "sonnet", display_name: "Claude Sonnet", description: "平衡速度与效果（推荐）", reasoning_levels: [], default_reasoning: null },
    { slug: "opus", display_name: "Claude Opus", description: "旗舰能力，适合复杂任务", reasoning_levels: [], default_reasoning: null },
    { slug: "haiku", display_name: "Claude Haiku", description: "最快、最经济", reasoning_levels: [], default_reasoning: null },
  ];
}

async function listCodexModels(): Promise<ModelInfo[]> {
  // 读取 ~/.codex/models_cache.json（和客户端一致）
  const cachePath = join(homedir(), ".codex", "models_cache.json");
  if (!existsSync(cachePath)) {
    // 回退默认
    return [
      { slug: "o3", display_name: "o3", description: null, reasoning_levels: ["low", "medium", "high"], default_reasoning: "medium" },
      { slug: "o4-mini", display_name: "o4-mini", description: null, reasoning_levels: ["low", "medium", "high"], default_reasoning: "medium" },
    ];
  }
  try {
    const data = JSON.parse(readFileSync(cachePath, "utf-8"));
    const arr = data.models || [];
    const models: ModelInfo[] = [];
    for (const m of arr) {
      if (m.visibility && m.visibility !== "list") continue;
      const slug = m.slug || "";
      if (!slug) continue;
      const levels = (m.supported_reasoning_levels || [])
        .map((l: any) => l.effort || l)
        .filter(Boolean);
      models.push({
        slug,
        display_name: m.display_name || slug,
        description: m.description || null,
        reasoning_levels: levels,
        default_reasoning: m.default_reasoning_level || null,
      });
    }
    return models.length > 0 ? models : [
      { slug: "o3", display_name: "o3", description: null, reasoning_levels: ["low", "medium", "high"], default_reasoning: "medium" },
      { slug: "o4-mini", display_name: "o4-mini", description: null, reasoning_levels: ["low", "medium", "high"], default_reasoning: "medium" },
    ];
  } catch {
    return [
      { slug: "o3", display_name: "o3", description: null, reasoning_levels: ["low", "medium", "high"], default_reasoning: "medium" },
      { slug: "o4-mini", display_name: "o4-mini", description: null, reasoning_levels: ["low", "medium", "high"], default_reasoning: "medium" },
    ];
  }
}

async function listKiroModels(): Promise<ModelInfo[]> {
  // 通过 kiro-cli chat --list-models 获取（和客户端一致）
  const config = loadConfig();
  const tpl = config.cli_templates["kiro"];
  const command = tpl?.command || "kiro-cli";
  try {
    const { stdout } = await execFileAsync(command, ["chat", "--list-models"], { timeout: 10_000 });
    const models: ModelInfo[] = [];
    for (const line of stdout.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("Available models")) continue;
      const raw = trimmed.replace(/^\*/, "").trim();
      const parts = raw.split(/\s+/);
      const slug = parts[0];
      if (!slug) continue;
      // 跳过 credits 列（如 "1.30x credits"）
      let descParts: string[] = [];
      let i = 1;
      // 跳过数字+x和credits
      if (parts[i] && /^\d/.test(parts[i])) i += 2;
      descParts = parts.slice(i);
      const desc = descParts.join(" ");
      models.push({
        slug,
        display_name: slug,
        description: desc || null,
        reasoning_levels: [],
        default_reasoning: null,
      });
    }
    return models.length > 0 ? models : [{ slug: "default", display_name: "默认模型", description: null, reasoning_levels: [], default_reasoning: null }];
  } catch {
    return [{ slug: "default", display_name: "默认模型", description: null, reasoning_levels: [], default_reasoning: null }];
  }
}

// ============================================================
// MCP 状态
// ============================================================

function checkMcpStatus(): McpStatus[] {
  const home = homedir();
  const paths: Record<string, string> = {
    "Kiro": join(home, ".kiro", "settings", "mcp.json"),
    "Cursor": join(home, ".cursor", "mcp.json"),
    "Windsurf": join(home, ".windsurf", "mcp.json"),
    "VS Code": join(home, ".vscode", "mcp.json"),
    "Claude Desktop": join(home, "Library", "Application Support", "Claude", "claude_desktop_config.json"),
  };
  const results: McpStatus[] = [];
  for (const [ide, path] of Object.entries(paths)) {
    let installed = false;
    if (existsSync(path)) {
      try { installed = readFileSync(path, "utf-8").includes("prompto"); } catch {}
    }
    results.push({ ide, installed });
  }
  return results;
}

// ============================================================
// 改写逻辑
// ============================================================

function buildModelArgs(flag: string, model: string): string[] {
  if (!flag || !model) return [];
  const parts = flag.split(/\s+/);
  const last = parts[parts.length - 1];
  if (last.endsWith("=")) return [...parts.slice(0, -1), `${last}${model}`];
  if (parts.length === 1) return [parts[0], model];
  return [...parts, model];
}

async function optimizeViaCli(input: string, config: AppConfig): Promise<string> {
  const tpl = config.cli_templates[config.target_cli];
  if (!tpl || !tpl.supports_passthrough) throw new Error(`CLI ${config.target_cli} 不支持透传`);

  const systemPrompt = config.system_prompt?.trim() || DEFAULT_SYSTEM_PROMPT;
  const fullPrompt = `${systemPrompt}\n\n---\n原始内容：\n${input}`;

  const args: string[] = [];
  let hasPromptPlaceholder = false;
  for (const raw of tpl.args) {
    const replaced = raw.replace("{prompt}", fullPrompt).replace("{model}", tpl.model || "");
    if (raw.includes("{prompt}")) hasPromptPlaceholder = true;
    args.push(replaced);
  }
  args.push(...buildModelArgs(tpl.model_flag, tpl.model));
  if (tpl.reasoning_effort && tpl.command === "codex") {
    args.push("-c", `model_reasoning_effort="${tpl.reasoning_effort}"`);
  }

  const env = { ...process.env, NO_COLOR: "1", CLICOLOR: "0", FORCE_COLOR: "0", TERM: "dumb" };

  let stdout: string;
  if (tpl.stdin_mode && !hasPromptPlaceholder) {
    stdout = await new Promise<string>((resolve, reject) => {
      const child = spawn(tpl.command, args, { env, timeout: 180_000 });
      let out = "", err = "";
      child.stdout.on("data", (d: Buffer) => { out += d.toString(); });
      child.stderr.on("data", (d: Buffer) => { err += d.toString(); });
      child.on("error", reject);
      child.on("close", (code) => { code !== 0 ? reject(new Error(`退出码 ${code}: ${err}`)) : resolve(out); });
      child.stdin.write(fullPrompt);
      child.stdin.end();
    });
  } else {
    const result = await execFileAsync(tpl.command, args, { timeout: 180_000, env });
    stdout = result.stdout;
  }

  let result = stdout.replace(/\x1b\[[0-9;?]*[A-Za-z]/g, "");
  if (result.includes("OpenAI Codex") && result.includes("\ncodex\n")) {
    const lines = result.split("\n");
    const start = lines.lastIndexOf("codex") + 1;
    const end = lines.indexOf("tokens used", start);
    if (start > 0) {
      result = lines.slice(start, end > start ? end : undefined)
        .map(l => l.replace(/^> /, "").replace(/^  /, "")).join("\n").trim();
    }
  }
  if (tpl.strip_patterns?.length > 0) {
    const regexes = tpl.strip_patterns.map(p => { try { return new RegExp(p); } catch { return null; } }).filter(Boolean) as RegExp[];
    result = result.split("\n").map(line => {
      for (const re of regexes) { if (re.test(line)) { const s = line.replace(re, ""); return s.trim() ? s : null; } }
      return line;
    }).filter(l => l !== null).join("\n").trim();
  }
  return result.trim();
}

async function optimizeViaApi(input: string, config: AppConfig): Promise<string> {
  const { base_url, api_key, model, temperature } = config.custom_api;
  if (!base_url) throw new Error("未配置 API Base URL");
  const systemPrompt = config.system_prompt?.trim() || DEFAULT_SYSTEM_PROMPT;
  const resp = await fetch(`${base_url.replace(/\/$/, "")}/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(api_key ? { Authorization: `Bearer ${api_key}` } : {}) },
    body: JSON.stringify({ model: model || "gpt-4o-mini", messages: [{ role: "system", content: systemPrompt }, { role: "user", content: input }], temperature: temperature ?? 0.3, stream: false }),
  });
  if (!resp.ok) throw new Error(`API 错误 ${resp.status}: ${await resp.text()}`);
  const data = await resp.json() as { choices: { message: { content: string } }[] };
  return data.choices?.[0]?.message?.content?.trim() || "";
}

function optimizeViaRules(input: string, config: AppConfig): string {
  let result = input;
  if (config.rules.trim_whitespace) result = result.trim();
  if (config.rules.collapse_blank_lines) result = result.replace(/\n{3,}/g, "\n\n");
  if (config.rules.structure_template) {
    result = `任务：\n${result}\n\n约束：\n1. 保持现有代码风格\n2. 不引入未经许可的新依赖\n\n交付：\n1. 给出完整可运行的代码\n2. 说明修改了哪些文件`;
  }
  return result;
}

async function optimize(input: string, config: AppConfig): Promise<string> {
  switch (config.engine) {
    case "cli-passthrough": return optimizeViaCli(input, config);
    case "custom-api": return optimizeViaApi(input, config);
    default: return optimizeViaRules(input, config);
  }
}

// ============================================================
// 通用消息处理器（配置面板和聊天窗口共用）
// ============================================================

async function handleMessage(msg: { type: string; payload?: any }, post: (type: string, payload: unknown) => void, context: vscode.ExtensionContext) {
  const { type, payload } = msg;
  switch (type) {
    case "getConfig": post("configLoaded", loadConfig()); break;
    case "updateConfig": { saveConfig(payload); post("configLoaded", payload); break; }
    case "getHistory": post("historyLoaded", loadHistory()); break;
    case "deleteHistoryItem": {
      const items = loadHistory().filter(i => i.id !== payload.id);
      saveHistory(items); post("historyLoaded", items); break;
    }
    case "togglePin": {
      const items = loadHistory();
      const item = items.find(i => i.id === payload.id);
      if (item) item.pinned = !item.pinned;
      saveHistory(items); post("historyLoaded", items); break;
    }
    case "clearAllHistory": { saveHistory([]); post("historyLoaded", []); break; }
    case "detectClis": { post("clisDetected", await detectClis()); break; }
    case "listModels": { post("modelsLoaded", await listModels(payload.cli)); break; }
    case "optimize": {
      const config = loadConfig();
      post("optimizeStart", { requestId: payload.requestId });
      try {
        const result = await optimize(payload.input, config);
        const historyItem = appendHistory(payload.input, result, config);
        post("optimizeResult", { requestId: payload.requestId, optimized: result, item: historyItem });
      } catch (e: any) {
        post("optimizeError", { requestId: payload.requestId, error: e?.message ?? String(e) });
      }
      break;
    }
    case "checkMcpStatus": post("mcpStatusLoaded", checkMcpStatus()); break;
    case "getDefaultSystemPrompt": post("defaultSystemPrompt", DEFAULT_SYSTEM_PROMPT); break;
    case "openConfigDir": vscode.commands.executeCommand("revealFileInOS", vscode.Uri.file(CONFIG_DIR)); break;
    case "copyToClipboard": { await vscode.env.clipboard.writeText(payload.text); post("clipboardCopied", null); break; }
    case "readClipboard": { post("clipboardContent", await vscode.env.clipboard.readText()); break; }
    case "installCli": {
      // 安装 CLI 工具
      const cli = payload.cli as string;
      const installCommands: Record<string, { cmd: string; args: string[] }> = {
        claude: { cmd: "npm", args: ["install", "-g", "@anthropic-ai/claude-code"] },
        codex: { cmd: "npm", args: ["install", "-g", "@openai/codex"] },
      };
      const installInfo = installCommands[cli];
      if (!installInfo) {
        post("cliInstallResult", { cli, success: false, error: `不支持自动安装 ${cli}` });
        break;
      }
      try {
        await execFileAsync(installInfo.cmd, installInfo.args, { timeout: 120_000 });
        // 重新检测
        const updatedClis = await detectClis();
        post("cliInstallResult", { cli, success: true });
        post("clisDetected", updatedClis);
      } catch (e: any) {
        post("cliInstallResult", { cli, success: false, error: e?.message ?? String(e) });
      }
      break;
    }
    case "installMcp": {
      // 安装 MCP 配置到指定 IDE
      const ide = payload.ide as string;
      const home = homedir();
      const mcpPaths: Record<string, string> = {
        "Kiro": join(home, ".kiro", "settings", "mcp.json"),
        "Cursor": join(home, ".cursor", "mcp.json"),
        "Windsurf": join(home, ".windsurf", "mcp.json"),
        "VS Code": join(home, ".vscode", "mcp.json"),
        "Claude Desktop": join(home, "Library", "Application Support", "Claude", "claude_desktop_config.json"),
      };
      const mcpPath = mcpPaths[ide];
      if (!mcpPath) {
        post("mcpInstallResult", { ide, success: false, error: `不支持 ${ide}` });
        break;
      }
      try {
        // 获取 mcp-server 路径
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
        const extensionPath = context.extensionUri.fsPath;
        // 尝试找到 mcp-server/dist/index.js
        let mcpServerPath = "";
        const candidates = [
          workspaceFolder ? join(workspaceFolder, "mcp-server", "dist", "index.js") : "",
          join(extensionPath, "..", "mcp-server", "dist", "index.js"),
          join(CONFIG_DIR, "mcp-server", "dist", "index.js"),
        ].filter(Boolean);
        for (const p of candidates) {
          if (existsSync(p)) { mcpServerPath = p; break; }
        }
        if (!mcpServerPath) {
          // 使用默认路径提示
          mcpServerPath = join(CONFIG_DIR, "mcp-server", "dist", "index.js");
        }

        const mcpConfig = { command: "node", args: [mcpServerPath] };
        let existing: any = {};
        if (existsSync(mcpPath)) {
          try { existing = JSON.parse(readFileSync(mcpPath, "utf-8")); } catch {}
        }
        // Claude Desktop 使用不同的结构
        if (ide === "Claude Desktop") {
          if (!existing.mcpServers) existing.mcpServers = {};
          existing.mcpServers.prompto = mcpConfig;
        } else {
          if (!existing.mcpServers) existing.mcpServers = {};
          existing.mcpServers.prompto = mcpConfig;
        }
        mkdirSync(join(mcpPath, ".."), { recursive: true });
        writeFileSync(mcpPath, JSON.stringify(existing, null, 2), "utf-8");
        post("mcpInstallResult", { ide, success: true });
        post("mcpStatusLoaded", checkMcpStatus());
      } catch (e: any) {
        post("mcpInstallResult", { ide, success: false, error: e?.message ?? String(e) });
      }
      break;
    }
    case "getSetupStatus": {
      // 检查是否需要显示引导
      const setupConfig = loadConfig();
      const setupClis = await detectClis();
      const setupMcp = checkMcpStatus();
      const hasAnyCli = setupClis.some(c => c.installed);
      const hasAnyMcp = setupMcp.some(s => s.installed);
      const setupDone = existsSync(join(CONFIG_DIR, ".setup-done"));
      post("setupStatus", { clis: setupClis, mcp: setupMcp, hasAnyCli, hasAnyMcp, setupDone, config: setupConfig });
      break;
    }
    case "markSetupDone": {
      mkdirSync(CONFIG_DIR, { recursive: true });
      writeFileSync(join(CONFIG_DIR, ".setup-done"), "1", "utf-8");
      post("setupMarked", null);
      break;
    }
  }
}

// ============================================================
// 配置面板 WebviewViewProvider（侧边栏上半部分）
// ============================================================

class ConfigViewProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = "prompto.configView";
  private _view?: vscode.WebviewView;

  constructor(private readonly _extensionUri: vscode.Uri, private readonly _context: vscode.ExtensionContext) {}

  resolveWebviewView(webviewView: vscode.WebviewView) {
    this._view = webviewView;
    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [vscode.Uri.joinPath(this._extensionUri, "webview", "dist")],
    };
    webviewView.webview.html = this._getHtml(webviewView.webview, "config");
    webviewView.webview.onDidReceiveMessage((msg) => {
      handleMessage(msg, (type, payload) => webviewView.webview.postMessage({ type, payload }), this._context);
    });
  }

  private _getHtml(webview: vscode.Webview, mode: string): string {
    return getWebviewHtml(webview, this._extensionUri, mode);
  }
}

// ============================================================
// 聊天窗口 WebviewViewProvider（侧边栏下半部分）
// ============================================================

class ChatViewProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = "prompto.chatView";
  private _view?: vscode.WebviewView;

  constructor(private readonly _extensionUri: vscode.Uri, private readonly _context: vscode.ExtensionContext) {}

  resolveWebviewView(webviewView: vscode.WebviewView) {
    this._view = webviewView;
    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [vscode.Uri.joinPath(this._extensionUri, "webview", "dist")],
    };
    webviewView.webview.html = this._getHtml(webviewView.webview, "chat");
    webviewView.webview.onDidReceiveMessage((msg) => {
      handleMessage(msg, (type, payload) => webviewView.webview.postMessage({ type, payload }), this._context);
    });
  }

  public sendText(text: string) {
    this._view?.webview.postMessage({ type: "setInput", payload: text });
  }

  public reveal() {
    this._view?.show(true);
  }

  private _getHtml(webview: vscode.Webview, mode: string): string {
    return getWebviewHtml(webview, this._extensionUri, mode);
  }
}

// ============================================================
// 生成 WebView HTML
// ============================================================

function getWebviewHtml(webview: vscode.Webview, extensionUri: vscode.Uri, mode: string): string {
  const distPath = vscode.Uri.joinPath(extensionUri, "webview", "dist");
  const indexHtmlPath = join(distPath.fsPath, "index.html");

  if (existsSync(indexHtmlPath)) {
    let html = readFileSync(indexHtmlPath, "utf-8");
    const baseUri = webview.asWebviewUri(distPath);
    // 替换资源路径
    html = html.replace(/(href|src)="\.\/([^"]+)"/g, `$1="${baseUri}/$2"`);
    // 注入模式变量，让前端知道当前是 config 还是 chat
    html = html.replace("</head>", `<script>window.__PROMPTO_MODE__="${mode}";</script></head>`);
    return html;
  }

  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>
    body { font-family: var(--vscode-font-family); padding: 16px; color: var(--vscode-foreground); }
    code { background: var(--vscode-textBlockQuote-background); padding: 2px 6px; border-radius: 3px; }
  </style></head><body>
    <h3>Prompto</h3>
    <p>请先构建 WebView：</p>
    <code>cd vscode-extension/webview && npm i && npm run build</code>
  </body></html>`;
}

// ============================================================
// 扩展入口
// ============================================================

export function activate(context: vscode.ExtensionContext) {
  // 注册侧边栏配置面板
  const configProvider = new ConfigViewProvider(context.extensionUri, context);
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(ConfigViewProvider.viewType, configProvider, {
      webviewOptions: { retainContextWhenHidden: true },
    })
  );

  // 注册侧边栏聊天窗口
  const chatProvider = new ChatViewProvider(context.extensionUri, context);
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(ChatViewProvider.viewType, chatProvider, {
      webviewOptions: { retainContextWhenHidden: true },
    })
  );

  // 状态栏
  const statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  statusBar.text = "$(sparkle) Prompto";
  statusBar.tooltip = "点击聚焦 Prompto 聊天";
  statusBar.command = "prompto.focusChat";
  statusBar.show();
  context.subscriptions.push(statusBar);

  // 命令：聚焦聊天
  context.subscriptions.push(
    vscode.commands.registerCommand("prompto.focusChat", () => {
      vscode.commands.executeCommand("prompto.chatView.focus");
    })
  );

  // 命令：打开面板（聚焦侧边栏）
  context.subscriptions.push(
    vscode.commands.registerCommand("prompto.openPanel", () => {
      vscode.commands.executeCommand("prompto.configView.focus");
    })
  );

  // 命令：改写选中内容
  context.subscriptions.push(
    vscode.commands.registerCommand("prompto.rewrite", async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) return;
      const text = editor.document.getText(editor.selection);
      if (!text.trim()) { vscode.window.showWarningMessage("请先选中要改写的文本"); return; }

      statusBar.text = "$(loading~spin) 改写中...";
      try {
        const config = loadConfig();
        const result = await optimize(text, config);
        appendHistory(text, result, config);
        const replaceSelection = vscode.workspace.getConfiguration("prompto").get<boolean>("replaceSelection");
        if (replaceSelection) {
          await editor.edit(eb => { eb.replace(editor.selection, result); });
          vscode.window.showInformationMessage("已替换选中内容");
        } else {
          const doc = await vscode.workspace.openTextDocument({ content: result, language: "markdown" });
          await vscode.window.showTextDocument(doc, { viewColumn: vscode.ViewColumn.Beside, preview: true });
        }
      } catch (e: any) {
        vscode.window.showErrorMessage(`改写失败: ${e?.message ?? e}`);
      } finally {
        statusBar.text = "$(sparkle) Prompto";
      }
    })
  );

  // 命令：改写到聊天窗口
  context.subscriptions.push(
    vscode.commands.registerCommand("prompto.rewriteToPanel", async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) return;
      const text = editor.document.getText(editor.selection);
      if (!text.trim()) { vscode.window.showWarningMessage("请先选中要改写的文本"); return; }
      chatProvider.reveal();
      setTimeout(() => chatProvider.sendText(text), 300);
    })
  );

  // 命令：分析项目
  context.subscriptions.push(
    vscode.commands.registerCommand("prompto.analyzeProject", () => {
      const folder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
      if (!folder) { vscode.window.showWarningMessage("未打开项目"); return; }
      const parts = [`项目: ${folder}`];
      const pkgPath = join(folder, "package.json");
      if (existsSync(pkgPath)) {
        try {
          const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"));
          parts.push(`名称: ${pkg.name}`);
          const deps = Object.keys(pkg.dependencies || {}).slice(0, 10);
          if (deps.length) parts.push(`依赖: ${deps.join(", ")}`);
        } catch {}
      }
      vscode.window.showInformationMessage(parts.join(" | "));
    })
  );
}

export function deactivate() {}
