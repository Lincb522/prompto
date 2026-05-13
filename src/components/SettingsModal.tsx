import { useState, useEffect, useCallback } from "react";
import { X, FolderOpen, RotateCcw } from "lucide-react";
import { cn } from "@/lib/cn";
import { useAppStore } from "@/store/app-store";
import { api, type AppConfig, type TargetCli } from "@/lib/api";

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

  // 本地编辑副本
  const [draft, setDraft] = useState<AppConfig | null>(null);

  useEffect(() => {
    if (open && config) {
      setDraft({ ...config });
      refreshClis();
    }
  }, [open, config, refreshClis]);

  // ESC 关闭
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
      {/* 遮罩 */}
      <div
        className="fixed inset-0 bg-black/20 dark:bg-black/40 z-40 animate-fade-in"
        onClick={onClose}
      />

      {/* 模态 */}
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="glass-card w-full max-w-[600px] max-h-[80vh] flex flex-col animate-scale-in">
          {/* 头部 */}
          <div className="flex items-center justify-between px-5 h-14 border-b border-white/20 dark:border-white/10 shrink-0">
            <span className="text-sm font-semibold whitespace-nowrap">设置</span>
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
                  "px-3 py-1.5 text-xs font-medium rounded-md cursor-pointer whitespace-nowrap",
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
            {tab === "general" && (
              <GeneralTab draft={draft} updateDraft={updateDraft} />
            )}
            {tab === "cli" && (
              <CliTab draft={draft} setDraft={setDraft} clis={clis} />
            )}
            {tab === "api" && (
              <ApiTab draft={draft} setDraft={setDraft} />
            )}
            {tab === "rules" && (
              <RulesTab draft={draft} setDraft={setDraft} />
            )}
            {tab === "prompt" && (
              <PromptTab draft={draft} setDraft={setDraft} />
            )}
            {tab === "mcp" && <McpTab />}
          </div>

          {/* 底部 */}
          <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-white/20 dark:border-white/10 shrink-0">
            <button type="button" onClick={onClose} className="btn-ghost">
              取消
            </button>
            <button type="button" onClick={handleSave} className="btn-primary">
              保存
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

/* ========== 子 Tab 组件 ========== */

function GeneralTab({
  draft,
  updateDraft,
}: {
  draft: AppConfig;
  updateDraft: (p: Partial<AppConfig>) => void;
}) {
  return (
    <div className="space-y-4">
      <Field label="快捷键">
        <input
          className="glass-input"
          value={draft.shortcut}
          onChange={(e) => updateDraft({ shortcut: e.target.value })}
          placeholder="例如: CmdOrCtrl+Shift+P"
        />
      </Field>
      <Field label="剪贴板监听">
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={draft.clipboard_watch}
            onChange={(e) => updateDraft({ clipboard_watch: e.target.checked })}
            className="w-4 h-4 accent-primary"
          />
          <span className="text-sm whitespace-nowrap">自动读取剪贴板内容</span>
        </label>
      </Field>
      <Field label="配置目录">
        <button
          type="button"
          onClick={() => api.openConfigDir()}
          className="btn-ghost !px-2 !py-1 !text-xs"
        >
          <FolderOpen className="w-3 h-3" />
          <span className="whitespace-nowrap">打开</span>
        </button>
      </Field>
    </div>
  );
}

function CliTab({
  draft,
  setDraft,
  clis,
}: {
  draft: AppConfig;
  setDraft: (d: AppConfig) => void;
  clis: { cli: string; installed: boolean; version: string | null; command: string }[];
}) {
  const [editCli, setEditCli] = useState<TargetCli>(draft.target_cli);
  const [models, setModels] = useState<{ slug: string; display_name: string }[]>([]);
  const [loadingModels, setLoadingModels] = useState(false);
  const tpl = draft.cli_templates[editCli];

  const updateTpl = (patch: Partial<typeof tpl>) => {
    setDraft({
      ...draft,
      cli_templates: {
        ...draft.cli_templates,
        [editCli]: { ...tpl, ...patch },
      },
    });
  };

  const fetchModels = async () => {
    setLoadingModels(true);
    try {
      const list = await api.listModels(editCli);
      setModels(list.map((m) => ({ slug: m.slug, display_name: m.display_name })));
    } catch {
      setModels([]);
    } finally {
      setLoadingModels(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* CLI 状态 */}
      <div className="space-y-2">
        {clis.map((c) => (
          <div key={c.cli} className="flex items-center gap-2 text-sm">
            <span
              className={cn(
                "w-2 h-2 rounded-full",
                c.installed ? "bg-primary" : "bg-red-400"
              )}
            />
            <span className="font-medium whitespace-nowrap">{c.cli}</span>
            <span className="text-fg-muted dark:text-fg-dark-muted text-xs">
              {c.installed ? c.version ?? "已安装" : "未安装"}
            </span>
          </div>
        ))}
      </div>

      {/* 编辑模板 */}
      <div className="flex items-center gap-2">
        {(["codex", "claude", "kiro"] as TargetCli[]).map((cli) => (
          <button
            key={cli}
            type="button"
            onClick={() => { setEditCli(cli); setModels([]); }}
            className={cn(
              "px-2 py-1 text-xs rounded cursor-pointer whitespace-nowrap",
              editCli === cli
                ? "bg-primary/10 text-primary dark:text-primary-light font-medium"
                : "text-fg-muted dark:text-fg-dark-muted"
            )}
          >
            {cli}
          </button>
        ))}
      </div>

      <Field label="命令">
        <input
          className="glass-input font-mono"
          value={tpl.command}
          onChange={(e) => updateTpl({ command: e.target.value })}
        />
      </Field>

      {/* 模型 + 获取按钮 */}
      <Field label="模型">
        <div className="flex items-center gap-2">
          <input
            className="glass-input flex-1"
            value={tpl.model}
            onChange={(e) => updateTpl({ model: e.target.value })}
            placeholder="留空使用默认"
            list={`models-${editCli}`}
          />
          <button
            type="button"
            onClick={() => void fetchModels()}
            disabled={loadingModels}
            className="btn-ghost !px-3 !py-2 !text-xs shrink-0"
          >
            {loadingModels ? "加载中..." : "获取模型"}
          </button>
        </div>
        {models.length > 0 && (
          <>
            <datalist id={`models-${editCli}`}>
              {models.map((m) => <option key={m.slug} value={m.slug} />)}
            </datalist>
            <div className="flex flex-wrap gap-1.5 mt-2">
              {models.map((m) => (
                <button
                  key={m.slug}
                  type="button"
                  onClick={() => updateTpl({ model: m.slug })}
                  className={cn(
                    "px-2 py-0.5 text-[11px] rounded-md cursor-pointer whitespace-nowrap transition-colors",
                    tpl.model === m.slug
                      ? "bg-primary/20 text-primary font-medium"
                      : "bg-white/50 dark:bg-white/10 text-fg-muted hover:text-fg"
                  )}
                >
                  {m.display_name}
                </button>
              ))}
            </div>
          </>
        )}
      </Field>
      <Field label="模型参数">
        <input
          className="glass-input"
          value={tpl.model_flag}
          onChange={(e) => updateTpl({ model_flag: e.target.value })}
          placeholder="--model"
        />
      </Field>
      <Field label="推理强度">
        <input
          className="glass-input"
          value={tpl.reasoning_effort}
          onChange={(e) => updateTpl({ reasoning_effort: e.target.value })}
          placeholder="high / medium / low"
        />
      </Field>
    </div>
  );
}

function ApiTab({
  draft,
  setDraft,
}: {
  draft: AppConfig;
  setDraft: (d: AppConfig) => void;
}) {
  const apiCfg = draft.custom_api;
  const update = (patch: Partial<typeof apiCfg>) => {
    setDraft({ ...draft, custom_api: { ...apiCfg, ...patch } });
  };

  return (
    <div className="space-y-4">
      <Field label="Base URL">
        <input
          className="glass-input font-mono"
          value={apiCfg.base_url}
          onChange={(e) => update({ base_url: e.target.value })}
          placeholder="https://api.openai.com/v1"
        />
      </Field>
      <Field label="API Key">
        <input
          className="glass-input font-mono"
          type="password"
          value={apiCfg.api_key}
          onChange={(e) => update({ api_key: e.target.value })}
          placeholder="sk-..."
        />
      </Field>
      <Field label="模型">
        <input
          className="glass-input"
          value={apiCfg.model}
          onChange={(e) => update({ model: e.target.value })}
          placeholder="gpt-4o"
        />
      </Field>
      <Field label="Temperature">
        <input
          className="glass-input w-24"
          type="number"
          step="0.1"
          min="0"
          max="2"
          value={apiCfg.temperature}
          onChange={(e) => update({ temperature: parseFloat(e.target.value) || 0 })}
        />
      </Field>
      <Field label="流式输出">
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={apiCfg.stream}
            onChange={(e) => update({ stream: e.target.checked })}
            className="w-4 h-4 accent-primary"
          />
          <span className="text-sm whitespace-nowrap">启用</span>
        </label>
      </Field>
    </div>
  );
}

function RulesTab({
  draft,
  setDraft,
}: {
  draft: AppConfig;
  setDraft: (d: AppConfig) => void;
}) {
  const rules = draft.rules;
  const toggle = (key: keyof typeof rules) => {
    if (typeof rules[key] === "boolean") {
      setDraft({
        ...draft,
        rules: { ...rules, [key]: !rules[key] },
      });
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
          <span className="text-sm whitespace-nowrap">{label}</span>
        </label>
      ))}
      <Field label="压缩阈值（字符数）">
        <input
          className="glass-input w-32"
          type="number"
          value={rules.compress_threshold}
          onChange={(e) =>
            setDraft({
              ...draft,
              rules: { ...rules, compress_threshold: parseInt(e.target.value) || 500 },
            })
          }
        />
      </Field>
    </div>
  );
}

function PromptTab({
  draft,
  setDraft,
}: {
  draft: AppConfig;
  setDraft: (d: AppConfig) => void;
}) {
  const [defaultPrompt, setDefaultPrompt] = useState("");

  useEffect(() => {
    void api.defaultSystemPrompt().then(setDefaultPrompt);
  }, []);

  const isCustom = draft.system_prompt.trim().length > 0;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-fg-muted dark:text-fg-dark-muted whitespace-nowrap">
            系统提示词
          </span>
          {isCustom ? (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-primary/10 text-primary whitespace-nowrap">自定义</span>
          ) : (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-white/20 text-fg-muted dark:text-fg-dark-muted whitespace-nowrap">使用默认</span>
          )}
        </div>
        <button
          type="button"
          onClick={() => setDraft({ ...draft, system_prompt: "" })}
          className="btn-ghost !px-2 !py-1 !text-xs"
          disabled={!isCustom}
        >
          <RotateCcw className="w-3 h-3" />
          <span className="whitespace-nowrap">恢复默认</span>
        </button>
      </div>
      <p className="text-[11px] text-fg-muted dark:text-fg-dark-muted">
        留空则使用内置默认指令。编辑后将覆盖默认。
      </p>
      <textarea
        className="glass-input min-h-[240px] resize-y font-mono text-xs"
        value={draft.system_prompt}
        placeholder={defaultPrompt || "加载中..."}
        onChange={(e) => setDraft({ ...draft, system_prompt: e.target.value })}
        spellCheck={false}
      />
      {!isCustom && defaultPrompt && (
        <details className="text-xs">
          <summary className="text-fg-muted dark:text-fg-dark-muted cursor-pointer hover:text-fg dark:hover:text-fg-dark">
            查看当前默认指令内容
          </summary>
          <pre className="mt-2 p-3 rounded-lg bg-white/30 dark:bg-white/5 text-fg-muted dark:text-fg-dark-muted font-mono text-[11px] leading-relaxed whitespace-pre-wrap break-words max-h-[200px] overflow-auto">
            {defaultPrompt}
          </pre>
        </details>
      )}
    </div>
  );
}

/* ========== MCP Tab ========== */

function McpTab() {
  const [statuses, setStatuses] = useState<Record<string, "checking" | "installed" | "not-installed">>({});
  const [messages, setMessages] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState<string | null>(null);
  const [copiedCmd, setCopiedCmd] = useState<string | null>(null);

  useEffect(() => { void checkAll(); }, []);

  const checkAll = async () => {
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      const results = await invoke<{ ide: string; installed: boolean }[]>("check_mcp_status");
      const newStatuses: Record<string, "installed" | "not-installed"> = {};
      for (const r of results) {
        newStatuses[r.ide] = r.installed ? "installed" : "not-installed";
      }
      setStatuses(newStatuses);
    } catch {}
  };

  const install = async (ide: string) => {
    setLoading(ide);
    setMessages((prev) => ({ ...prev, [ide]: "" }));
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      await invoke("install_mcp", { ide });
      setStatuses((prev) => ({ ...prev, [ide]: "installed" }));
      setMessages((prev) => ({ ...prev, [ide]: "已安装" }));
    } catch (e: unknown) {
      setMessages((prev) => ({ ...prev, [ide]: `错误: ${e instanceof Error ? e.message : String(e)}` }));
    } finally {
      setLoading(null);
    }
  };

  const uninstall = async (ide: string) => {
    setLoading(ide);
    setMessages((prev) => ({ ...prev, [ide]: "" }));
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      await invoke("uninstall_mcp", { ide });
      setStatuses((prev) => ({ ...prev, [ide]: "not-installed" }));
      setMessages((prev) => ({ ...prev, [ide]: "已移除" }));
    } catch (e: unknown) {
      setMessages((prev) => ({ ...prev, [ide]: `错误: ${e instanceof Error ? e.message : String(e)}` }));
    } finally {
      setLoading(null);
    }
  };

  const copyToClipboard = async (text: string, id: string) => {
    await navigator.clipboard.writeText(text);
    setCopiedCmd(id);
    setTimeout(() => setCopiedCmd(null), 1500);
  };

  const IDE_NAMES = ["Kiro", "Cursor", "Windsurf", "Codex", "Claude Desktop", "VS Code"];

  const EXAMPLES = [
    { id: "basic", label: "基础改写", prompt: "用 prompto 优化：帮我写个登录页面" },
    { id: "specific", label: "指定项目", prompt: "用 prompto 的 optimize_prompt 工具改写这段提示词：重构 UserService 的数据库查询逻辑" },
    { id: "analyze", label: "分析项目", prompt: "用 prompto 的 analyze_project 工具分析当前项目" },
    { id: "context", label: "查看上下文", prompt: "用 prompto 的 get_project_context 工具查看项目信息" },
    { id: "engines", label: "查看引擎", prompt: "用 prompto 的 list_engines 工具查看当前配置" },
  ];

  return (
    <div className="space-y-6">
      {/* 1. IDE 安装管理 */}
      <section className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold text-fg dark:text-fg-dark whitespace-nowrap">IDE 集成</span>
          <button type="button" onClick={() => void checkAll()} className="btn-ghost !px-2 !py-1 !text-[11px]">刷新</button>
        </div>
        <p className="text-[11px] text-fg-muted dark:text-fg-dark-muted">
          一键安装到各 IDE，安装后在 AI 对话中即可调用 Prompto 的改写能力。
        </p>
        <div className="space-y-1.5">
          {IDE_NAMES.map((ide) => {
            const st = statuses[ide] ?? "checking";
            const msg = messages[ide];
            const isLoading = loading === ide;
            return (
              <div key={ide} className="flex items-center justify-between gap-3 py-2 px-3 rounded-lg bg-white/30 dark:bg-white/5">
                <div className="flex items-center gap-2 min-w-0">
                  <span className={cn("w-2 h-2 rounded-full shrink-0", st === "installed" ? "bg-primary" : st === "not-installed" ? "bg-red-400" : "bg-yellow-400")} />
                  <span className="text-sm font-medium whitespace-nowrap">{ide}</span>
                  {msg && <span className="text-[10px] text-fg-muted dark:text-fg-dark-muted truncate">{msg}</span>}
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  {st === "not-installed" && (
                    <button type="button" onClick={() => void install(ide)} disabled={isLoading} className="btn-primary !text-[11px] !px-2.5 !py-1">
                      {isLoading ? "..." : "安装"}
                    </button>
                  )}
                  {st === "installed" && (
                    <button type="button" onClick={() => void uninstall(ide)} disabled={isLoading} className="btn-ghost !text-[11px] !px-2 !py-1 text-red-500">
                      {isLoading ? "..." : "移除"}
                    </button>
                  )}
                  {st === "checking" && <span className="text-[11px] text-fg-muted">检查中</span>}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* 2. 可用工具 */}
      <section className="space-y-2">
        <span className="text-xs font-semibold text-fg dark:text-fg-dark whitespace-nowrap">可用工具</span>
        <div className="space-y-1.5">
          <ToolRow name="optimize_prompt" desc="改写提示词（自动结合项目上下文）" params="prompt, project_dir?" />
          <ToolRow name="analyze_project" desc="分析项目技术栈、依赖、结构" params="project_dir?" />
          <ToolRow name="get_project_context" desc="查看已缓存的项目摘要" params="project_dir?" />
          <ToolRow name="list_engines" desc="查看当前引擎和 CLI 配置" params="无" />
        </div>
      </section>

      {/* 3. 使用示例（可复制） */}
      <section className="space-y-2">
        <span className="text-xs font-semibold text-fg dark:text-fg-dark whitespace-nowrap">使用示例</span>
        <p className="text-[11px] text-fg-muted dark:text-fg-dark-muted">
          安装后在 IDE 的 AI 对话中输入以下内容即可调用。点击复制。
        </p>
        <div className="space-y-1.5">
          {EXAMPLES.map((ex) => (
            <button
              key={ex.id}
              type="button"
              onClick={() => void copyToClipboard(ex.prompt, ex.id)}
              className="w-full text-left px-3 py-2.5 rounded-lg bg-white/30 dark:bg-white/5 hover:bg-white/50 dark:hover:bg-white/10 cursor-pointer transition-colors group"
            >
              <div className="flex items-center justify-between gap-2 mb-1">
                <span className="text-[11px] font-medium text-fg dark:text-fg-dark whitespace-nowrap">{ex.label}</span>
                <span className="text-[10px] text-primary opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">
                  {copiedCmd === ex.id ? "✓ 已复制" : "点击复制"}
                </span>
              </div>
              <code className="text-[11px] text-fg-muted dark:text-fg-dark-muted font-mono break-all">{ex.prompt}</code>
            </button>
          ))}
        </div>
      </section>

      {/* 4. 使用教程 */}
      <section className="space-y-2">
        <span className="text-xs font-semibold text-fg dark:text-fg-dark whitespace-nowrap">使用教程</span>
        <div className="space-y-3 text-[12px] text-fg-muted dark:text-fg-dark-muted leading-relaxed">
          <div className="space-y-1">
            <div className="font-medium text-fg dark:text-fg-dark">1. 安装</div>
            <div>点击上方对应 IDE 的「安装」按钮，Prompto 会自动写入 MCP 配置文件。</div>
          </div>
          <div className="space-y-1">
            <div className="font-medium text-fg dark:text-fg-dark">2. 重启 IDE</div>
            <div>部分 IDE 需要重启才能加载新的 MCP Server。Kiro 和 Cursor 通常会自动重连。</div>
          </div>
          <div className="space-y-1">
            <div className="font-medium text-fg dark:text-fg-dark">3. 使用</div>
            <div>在 AI 对话中直接说「用 prompto 优化：你的提示词」，IDE 会自动调用 optimize_prompt 工具。</div>
          </div>
          <div className="space-y-1">
            <div className="font-medium text-fg dark:text-fg-dark">4. 项目感知</div>
            <div>首次调用时 Prompto 会自动分析当前项目（技术栈、依赖、目录结构），后续改写会结合项目信息生成更贴合的结果。分析结果缓存在项目根目录的 .prompto/context.json 中。</div>
          </div>
          <div className="space-y-1">
            <div className="font-medium text-fg dark:text-fg-dark">5. 配置同步</div>
            <div>MCP Server 读取 Prompto 客户端的配置（引擎、CLI、模型、思考强度），修改客户端设置后 MCP 调用会自动使用新配置。</div>
          </div>
        </div>
      </section>

      {/* 5. 高级配置 */}
      <section className="space-y-2">
        <span className="text-xs font-semibold text-fg dark:text-fg-dark whitespace-nowrap">高级</span>
        <div className="space-y-2">
          <Field label="Server 路径">
            <div
              className="glass-input font-mono text-[11px] !py-1.5 cursor-pointer hover:border-primary/50 transition-colors"
              onClick={() => void copyToClipboard("node mcp-server/dist/index.js", "path")}
              title="点击复制"
            >
              mcp-server/dist/index.js
              {copiedCmd === "path" && <span className="ml-2 text-primary">✓</span>}
            </div>
          </Field>
          <Field label="手动配置 JSON（适用于 Kiro/Cursor/Windsurf/VS Code）">
            <div
              className="glass-input font-mono text-[10px] !py-2 cursor-pointer hover:border-primary/50 transition-colors whitespace-pre"
              onClick={() => void copyToClipboard('{\n  "mcpServers": {\n    "prompto": {\n      "command": "node",\n      "args": ["<项目路径>/mcp-server/dist/index.js"]\n    }\n  }\n}', "json")}
              title="点击复制"
            >
              {`"prompto": { "command": "node", "args": ["...mcp-server/dist/index.js"] }`}
              {copiedCmd === "json" && <span className="ml-2 text-primary">✓</span>}
            </div>
          </Field>
          <Field label="手动配置 TOML（适用于 Codex）">
            <div
              className="glass-input font-mono text-[10px] !py-2 cursor-pointer hover:border-primary/50 transition-colors whitespace-pre"
              onClick={() => void copyToClipboard('[mcp_servers.prompto]\ncommand = "node"\nargs = ["<项目路径>/mcp-server/dist/index.js"]', "toml")}
              title="点击复制"
            >
              {`[mcp_servers.prompto] command = "node" args = ["..."]`}
              {copiedCmd === "toml" && <span className="ml-2 text-primary">✓</span>}
            </div>
          </Field>
        </div>
      </section>
    </div>
  );
}

function ToolRow({ name, desc, params }: { name: string; desc: string; params: string }) {
  return (
    <div className="flex items-center gap-3 px-3 py-2 rounded-lg bg-white/30 dark:bg-white/5">
      <code className="text-[11px] px-1.5 py-0.5 rounded bg-primary/10 text-primary font-mono whitespace-nowrap shrink-0">{name}</code>
      <span className="text-[11px] text-fg-muted dark:text-fg-dark-muted flex-1 truncate">{desc}</span>
      <span className="text-[10px] text-fg-muted/60 dark:text-fg-dark-muted/60 font-mono whitespace-nowrap shrink-0">{params}</span>
    </div>
  );
}

/* ========== 通用 Field 组件 ========== */

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <label className="text-xs font-medium text-fg-muted dark:text-fg-dark-muted whitespace-nowrap">
        {label}
      </label>
      {children}
    </div>
  );
}
