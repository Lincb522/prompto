import { useState, useEffect, useCallback } from "react";
import { X, FolderOpen, RotateCcw } from "lucide-react";
import { cn } from "@/lib/cn";
import { useAppStore, type AppConfig, type TargetCli, type McpStatus } from "@/store/app-store";
import { api } from "@/lib/vscode-api";

interface SettingsModalProps {
  open: boolean;
  onClose: () => void;
}

type Tab = "general" | "cli" | "api" | "rules" | "prompt" | "mcp";

const TABS: { key: Tab; label: string }[] = [
  { key: "general", label: "通用" },
  { key: "cli", label: "CLI" },
  { key: "api", label: "API" },
  { key: "rules", label: "规则" },
  { key: "prompt", label: "系统提示" },
  { key: "mcp", label: "MCP" },
];

export function SettingsModal({ open, onClose }: SettingsModalProps) {
  const [tab, setTab] = useState<Tab>("general");
  const config = useAppStore((s) => s.config);
  const replaceConfig = useAppStore((s) => s.replaceConfig);
  const clis = useAppStore((s) => s.clis);
  const refreshClis = useAppStore((s) => s.refreshClis);

  const [draft, setDraft] = useState<AppConfig | null>(null);

  useEffect(() => {
    if (open && config) {
      setDraft({ ...config });
      refreshClis();
    }
  }, [open, config, refreshClis]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape" && open) onClose();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open, onClose]);

  const handleSave = useCallback(async () => {
    if (draft) {
      await replaceConfig(draft);
      onClose();
    }
  }, [draft, replaceConfig, onClose]);

  const updateDraft = useCallback(
    (patch: Partial<AppConfig>) => {
      if (draft) setDraft({ ...draft, ...patch });
    },
    [draft]
  );

  if (!open || !draft) return null;

  return (
    <>
      <div className="fixed inset-0 bg-black/20 dark:bg-black/40 z-40 animate-fade-in" onClick={onClose} />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="glass-card w-full max-w-[560px] max-h-[80vh] flex flex-col animate-scale-in">
          {/* 头部 */}
          <div className="flex items-center justify-between px-5 h-12 border-b border-white/20 dark:border-white/10 shrink-0">
            <span className="text-sm font-semibold">设置</span>
            <button type="button" onClick={onClose} className="btn-icon">
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Tab 栏 */}
          <div className="flex items-center gap-1 px-5 pt-3 shrink-0">
            {TABS.map((t) => (
              <button
                key={t.key}
                type="button"
                onClick={() => setTab(t.key)}
                className={cn(
                  "px-3 py-1.5 text-xs font-medium rounded-md cursor-pointer",
                  "transition-colors duration-150",
                  tab === t.key
                    ? "bg-primary/10 text-primary dark:text-primary-light"
                    : "text-fg-muted dark:text-fg-dark-muted hover:text-fg dark:hover:text-fg-dark"
                )}
              >
                {t.label}
              </button>
            ))}
          </div>

          {/* 内容 */}
          <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
            {tab === "general" && <GeneralTab draft={draft} updateDraft={updateDraft} />}
            {tab === "cli" && <CliTab draft={draft} setDraft={setDraft} clis={clis} />}
            {tab === "api" && <ApiTab draft={draft} setDraft={setDraft} />}
            {tab === "rules" && <RulesTab draft={draft} setDraft={setDraft} />}
            {tab === "prompt" && <PromptTab draft={draft} setDraft={setDraft} />}
            {tab === "mcp" && <McpTab />}
          </div>

          {/* 底部 */}
          <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-white/20 dark:border-white/10 shrink-0">
            <button type="button" onClick={onClose} className="btn-ghost">取消</button>
            <button type="button" onClick={() => void handleSave()} className="btn-primary">保存</button>
          </div>
        </div>
      </div>
    </>
  );
}

/* ========== 子 Tab 组件 ========== */

function GeneralTab({ draft, updateDraft }: { draft: AppConfig; updateDraft: (p: Partial<AppConfig>) => void }) {
  return (
    <div className="space-y-4">
      <Field label="引擎">
        <select
          className="glass-input"
          value={draft.engine}
          onChange={(e) => updateDraft({ engine: e.target.value as any })}
        >
          <option value="cli-passthrough">CLI 透传</option>
          <option value="custom-api">自定义 API</option>
          <option value="rule-based">本地规则</option>
        </select>
      </Field>
      {draft.engine === "cli-passthrough" && (
        <Field label="目标 CLI">
          <select
            className="glass-input"
            value={draft.target_cli}
            onChange={(e) => updateDraft({ target_cli: e.target.value as any })}
          >
            <option value="codex">Codex</option>
            <option value="claude">Claude</option>
            <option value="kiro">Kiro</option>
          </select>
        </Field>
      )}
      <Field label="快捷键">
        <input
          className="glass-input"
          value={draft.shortcut}
          onChange={(e) => updateDraft({ shortcut: e.target.value })}
          placeholder="CmdOrCtrl+Shift+P"
        />
      </Field>
      <Field label="主题">
        <select
          className="glass-input"
          value={draft.theme}
          onChange={(e) => updateDraft({ theme: e.target.value })}
        >
          <option value="light">浅色</option>
          <option value="dark">深色</option>
          <option value="system">跟随系统</option>
        </select>
      </Field>
      <Field label="配置目录">
        <button type="button" onClick={() => api.openConfigDir()} className="btn-ghost !px-2 !py-1 !text-xs">
          <FolderOpen className="w-3 h-3" />
          <span>打开</span>
        </button>
      </Field>
    </div>
  );
}

function CliTab({ draft, setDraft, clis }: { draft: AppConfig; setDraft: (d: AppConfig) => void; clis: { cli: string; installed: boolean; version: string | null }[] }) {
  const [editCli, setEditCli] = useState<TargetCli>(draft.target_cli);
  const tpl = draft.cli_templates[editCli];

  const updateTpl = (patch: Partial<typeof tpl>) => {
    setDraft({
      ...draft,
      cli_templates: { ...draft.cli_templates, [editCli]: { ...tpl, ...patch } },
    });
  };

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        {clis.map((c) => (
          <div key={c.cli} className="flex items-center gap-2 text-sm">
            <span className={cn("w-2 h-2 rounded-full", c.installed ? "bg-primary" : "bg-red-400")} />
            <span className="font-medium">{c.cli}</span>
            <span className="text-fg-muted dark:text-fg-dark-muted text-xs">
              {c.installed ? c.version ?? "已安装" : "未安装"}
            </span>
          </div>
        ))}
      </div>

      <div className="flex items-center gap-2">
        {(["codex", "claude", "kiro"] as TargetCli[]).map((cli) => (
          <button
            key={cli}
            type="button"
            onClick={() => setEditCli(cli)}
            className={cn(
              "px-2 py-1 text-xs rounded cursor-pointer",
              editCli === cli ? "bg-primary/10 text-primary font-medium" : "text-fg-muted dark:text-fg-dark-muted"
            )}
          >
            {cli}
          </button>
        ))}
      </div>

      <Field label="命令">
        <input className="glass-input font-mono" value={tpl.command} onChange={(e) => updateTpl({ command: e.target.value })} />
      </Field>
      <Field label="模型">
        <input className="glass-input" value={tpl.model} onChange={(e) => updateTpl({ model: e.target.value })} placeholder="留空使用默认" />
      </Field>
      <Field label="模型参数">
        <input className="glass-input" value={tpl.model_flag} onChange={(e) => updateTpl({ model_flag: e.target.value })} placeholder="--model" />
      </Field>
      <Field label="推理强度">
        <input className="glass-input" value={tpl.reasoning_effort} onChange={(e) => updateTpl({ reasoning_effort: e.target.value })} placeholder="high / medium / low" />
      </Field>
    </div>
  );
}

function ApiTab({ draft, setDraft }: { draft: AppConfig; setDraft: (d: AppConfig) => void }) {
  const apiCfg = draft.custom_api;
  const update = (patch: Partial<typeof apiCfg>) => {
    setDraft({ ...draft, custom_api: { ...apiCfg, ...patch } });
  };

  return (
    <div className="space-y-4">
      <Field label="Base URL">
        <input className="glass-input font-mono" value={apiCfg.base_url} onChange={(e) => update({ base_url: e.target.value })} placeholder="https://api.openai.com/v1" />
      </Field>
      <Field label="API Key">
        <input className="glass-input font-mono" type="password" value={apiCfg.api_key} onChange={(e) => update({ api_key: e.target.value })} placeholder="sk-..." />
      </Field>
      <Field label="模型">
        <input className="glass-input" value={apiCfg.model} onChange={(e) => update({ model: e.target.value })} placeholder="gpt-4o" />
      </Field>
      <Field label="Temperature">
        <input className="glass-input w-24" type="number" step="0.1" min="0" max="2" value={apiCfg.temperature} onChange={(e) => update({ temperature: parseFloat(e.target.value) || 0 })} />
      </Field>
      <Field label="流式输出">
        <label className="flex items-center gap-2 cursor-pointer">
          <input type="checkbox" checked={apiCfg.stream} onChange={(e) => update({ stream: e.target.checked })} className="w-4 h-4 accent-primary" />
          <span className="text-sm">启用</span>
        </label>
      </Field>
    </div>
  );
}

function RulesTab({ draft, setDraft }: { draft: AppConfig; setDraft: (d: AppConfig) => void }) {
  const rules = draft.rules;
  const toggle = (key: keyof typeof rules) => {
    if (typeof rules[key] === "boolean") {
      setDraft({ ...draft, rules: { ...rules, [key]: !rules[key] } });
    }
  };

  const RULE_LABELS: Record<string, string> = {
    trim_whitespace: "去除首尾空白",
    collapse_blank_lines: "合并空行",
    protect_code_blocks: "保护代码块",
    remove_filler_words: "去除填充词",
    structure_template: "结构化模板",
    normalize_punctuation: "标点规范化",
    require_action_verb: "要求动词开头",
    compress_if_too_long: "超长压缩",
  };

  return (
    <div className="space-y-3">
      {Object.entries(RULE_LABELS).map(([key, label]) => (
        <label key={key} className="flex items-center gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={rules[key as keyof typeof rules] as boolean}
            onChange={() => toggle(key as keyof typeof rules)}
            className="w-4 h-4 accent-primary"
          />
          <span className="text-sm">{label}</span>
        </label>
      ))}
      <Field label="压缩阈值（字符数）">
        <input
          className="glass-input w-32"
          type="number"
          value={rules.compress_threshold}
          onChange={(e) => setDraft({ ...draft, rules: { ...rules, compress_threshold: parseInt(e.target.value) || 500 } })}
        />
      </Field>
    </div>
  );
}

function PromptTab({ draft, setDraft }: { draft: AppConfig; setDraft: (d: AppConfig) => void }) {
  const [defaultPrompt, setDefaultPrompt] = useState("");

  useEffect(() => {
    api.getDefaultSystemPrompt().then((p) => setDefaultPrompt(p as string)).catch(() => {});
  }, []);

  const isCustom = draft.system_prompt.trim().length > 0;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-fg-muted dark:text-fg-dark-muted">系统提示词</span>
          {isCustom ? (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-primary/10 text-primary">自定义</span>
          ) : (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-white/20 text-fg-muted dark:text-fg-dark-muted">使用默认</span>
          )}
        </div>
        <button
          type="button"
          onClick={() => setDraft({ ...draft, system_prompt: "" })}
          className="btn-ghost !px-2 !py-1 !text-xs"
          disabled={!isCustom}
        >
          <RotateCcw className="w-3 h-3" />
          <span>恢复默认</span>
        </button>
      </div>
      <p className="text-[11px] text-fg-muted dark:text-fg-dark-muted">
        留空则使用内置默认指令。编辑后将覆盖默认。
      </p>
      <textarea
        className="glass-input min-h-[200px] resize-y font-mono text-xs"
        value={draft.system_prompt}
        placeholder={defaultPrompt || "加载中..."}
        onChange={(e) => setDraft({ ...draft, system_prompt: e.target.value })}
        spellCheck={false}
      />
    </div>
  );
}

function McpTab() {
  const [statuses, setStatuses] = useState<McpStatus[]>([]);
  const [copiedCmd, setCopiedCmd] = useState<string | null>(null);

  useEffect(() => {
    api.checkMcpStatus().then((s) => setStatuses(s as McpStatus[])).catch(() => {});
  }, []);

  const copyToClipboard = async (text: string, id: string) => {
    await api.copyToClipboard(text);
    setCopiedCmd(id);
    setTimeout(() => setCopiedCmd(null), 1500);
  };

  const EXAMPLES = [
    { id: "basic", label: "基础改写", prompt: "用 prompto 优化：帮我写个登录页面" },
    { id: "specific", label: "指定项目", prompt: "用 prompto 的 optimize_prompt 工具改写这段提示词：重构 UserService 的数据库查询逻辑" },
    { id: "analyze", label: "分析项目", prompt: "用 prompto 的 analyze_project 工具分析当前项目" },
  ];

  return (
    <div className="space-y-5">
      {/* IDE 状态 */}
      <section className="space-y-2">
        <span className="text-xs font-semibold text-fg dark:text-fg-dark">IDE 集成状态</span>
        <div className="space-y-1.5">
          {statuses.map((s) => (
            <div key={s.ide} className="flex items-center gap-2 py-1.5 px-3 rounded-lg bg-white/30 dark:bg-white/5">
              <span className={cn("w-2 h-2 rounded-full", s.installed ? "bg-primary" : "bg-red-400")} />
              <span className="text-sm font-medium flex-1">{s.ide}</span>
              <span className="text-[10px] text-fg-muted dark:text-fg-dark-muted">
                {s.installed ? "已安装" : "未安装"}
              </span>
            </div>
          ))}
        </div>
      </section>

      {/* 可用工具 */}
      <section className="space-y-2">
        <span className="text-xs font-semibold text-fg dark:text-fg-dark">可用工具</span>
        <div className="space-y-1.5">
          <ToolRow name="optimize_prompt" desc="改写提示词（自动结合项目上下文）" />
          <ToolRow name="analyze_project" desc="分析项目技术栈、依赖、结构" />
          <ToolRow name="get_project_context" desc="查看已缓存的项目摘要" />
          <ToolRow name="list_engines" desc="查看当前引擎和 CLI 配置" />
        </div>
      </section>

      {/* 使用示例 */}
      <section className="space-y-2">
        <span className="text-xs font-semibold text-fg dark:text-fg-dark">使用示例</span>
        <div className="space-y-1.5">
          {EXAMPLES.map((ex) => (
            <button
              key={ex.id}
              type="button"
              onClick={() => void copyToClipboard(ex.prompt, ex.id)}
              className="w-full text-left px-3 py-2.5 rounded-lg bg-white/30 dark:bg-white/5 hover:bg-white/50 dark:hover:bg-white/10 cursor-pointer transition-colors group"
            >
              <div className="flex items-center justify-between gap-2 mb-1">
                <span className="text-[11px] font-medium text-fg dark:text-fg-dark">{ex.label}</span>
                <span className="text-[10px] text-primary opacity-0 group-hover:opacity-100 transition-opacity">
                  {copiedCmd === ex.id ? "✓ 已复制" : "点击复制"}
                </span>
              </div>
              <code className="text-[11px] text-fg-muted dark:text-fg-dark-muted font-mono break-all">{ex.prompt}</code>
            </button>
          ))}
        </div>
      </section>

      {/* 手动配置 */}
      <section className="space-y-2">
        <span className="text-xs font-semibold text-fg dark:text-fg-dark">手动配置</span>
        <div
          className="glass-input font-mono text-[10px] !py-2 cursor-pointer hover:border-primary/50 transition-colors"
          onClick={() => void copyToClipboard('{\n  "mcpServers": {\n    "prompto": {\n      "command": "node",\n      "args": ["<项目路径>/mcp-server/dist/index.js"]\n    }\n  }\n}', "json")}
          title="点击复制"
        >
          {`"prompto": { "command": "node", "args": ["...mcp-server/dist/index.js"] }`}
          {copiedCmd === "json" && <span className="ml-2 text-primary">✓</span>}
        </div>
      </section>
    </div>
  );
}

function ToolRow({ name, desc }: { name: string; desc: string }) {
  return (
    <div className="flex items-center gap-3 px-3 py-2 rounded-lg bg-white/30 dark:bg-white/5">
      <code className="text-[11px] px-1.5 py-0.5 rounded bg-primary/10 text-primary font-mono shrink-0">{name}</code>
      <span className="text-[11px] text-fg-muted dark:text-fg-dark-muted flex-1 truncate">{desc}</span>
    </div>
  );
}

/* ========== 通用 Field 组件 ========== */

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="text-xs font-medium text-fg-muted dark:text-fg-dark-muted">{label}</label>
      {children}
    </div>
  );
}
