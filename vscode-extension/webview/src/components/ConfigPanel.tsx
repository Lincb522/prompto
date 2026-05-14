import { useState, useEffect, useCallback } from "react";
import { Zap, Circle, Layers, Settings, FolderOpen, RotateCcw, BarChart3, Sparkles } from "lucide-react";
import { cn } from "@/lib/cn";
import { useAppStore, type AppConfig, type TargetCli, type McpStatus } from "@/store/app-store";
import { api } from "@/lib/vscode-api";
import { SetupWizard } from "./SetupWizard";

type Tab = "status" | "settings";

export function ConfigPanel() {
  const [tab, setTab] = useState<Tab>("status");
  const [showSetup, setShowSetup] = useState<boolean | null>(null);
  const config = useAppStore((s) => s.config);

  // 检查是否需要显示引导
  useEffect(() => {
    if (!config) return;
    api.getSetupStatus().then((status: any) => {
      setShowSetup(!status.setupDone);
    }).catch(() => setShowSetup(false));
  }, [config]);

  if (!config || showSetup === null) {
    return <div className="p-4 text-sm text-fg-muted dark:text-fg-dark-muted">加载中...</div>;
  }

  if (showSetup) {
    return <SetupWizard onComplete={() => setShowSetup(false)} />;
  }

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Tab 切换 */}
      <div className="flex items-center gap-1 px-3 py-2 border-b border-white/15 dark:border-white/5 shrink-0">
        <button
          onClick={() => setTab("status")}
          className={cn(
            "px-2.5 py-1 text-[11px] font-medium rounded cursor-pointer transition-colors",
            tab === "status" ? "bg-primary/10 text-primary" : "text-fg-muted dark:text-fg-dark-muted hover:text-fg dark:hover:text-fg-dark"
          )}
        >
          状态
        </button>
        <button
          onClick={() => setTab("settings")}
          className={cn(
            "px-2.5 py-1 text-[11px] font-medium rounded cursor-pointer transition-colors",
            tab === "settings" ? "bg-primary/10 text-primary" : "text-fg-muted dark:text-fg-dark-muted hover:text-fg dark:hover:text-fg-dark"
          )}
        >
          <Settings className="w-3 h-3 inline mr-1" />
          设置
        </button>
      </div>

      <div className="flex-1 overflow-y-auto">
        {tab === "status" && <StatusView />}
        {tab === "settings" && <SettingsView />}
      </div>
    </div>
  );
}

// ========== 状态视图 ==========

function StatusView() {
  const config = useAppStore((s) => s.config)!;
  const clis = useAppStore((s) => s.clis);
  const history = useAppStore((s) => s.history);
  const [mcpStatuses, setMcpStatuses] = useState<McpStatus[]>([]);

  useEffect(() => {
    api.checkMcpStatus().then((s) => setMcpStatuses(s as McpStatus[])).catch(() => {});
  }, []);

  const mcpInstalled = mcpStatuses.filter((s) => s.installed);
  const engineLabel = config.engine === "cli-passthrough" ? "CLI 透传" : config.engine === "custom-api" ? "自定义 API" : "本地规则";
  const totalCount = history.length;
  const todayCount = history.filter((h) => new Date(h.created_at).toDateString() === new Date().toDateString()).length;

  return (
    <div className="p-3 space-y-3">
      {/* 统计 */}
      <div className="flex items-center gap-2">
        <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-white/50 dark:bg-white/10 shadow-sm">
          <BarChart3 className="w-3.5 h-3.5 text-fg-muted dark:text-fg-dark-muted" />
          <span className="text-[10px] text-fg-muted dark:text-fg-dark-muted">总计</span>
          <span className="text-xs font-bold text-fg dark:text-fg-dark">{totalCount}</span>
        </div>
        <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-primary/5 dark:bg-primary/10 shadow-sm">
          <Sparkles className="w-3.5 h-3.5 text-primary" />
          <span className="text-[10px] text-fg-muted dark:text-fg-dark-muted">今日</span>
          <span className="text-xs font-bold text-primary">{todayCount}</span>
        </div>
      </div>

      {/* 引擎 */}
      <div className="glass-card p-3 space-y-2">
        <div className="flex items-center gap-2">
          <Zap className="w-3.5 h-3.5 text-primary" />
          <span className="text-[11px] font-semibold text-fg dark:text-fg-dark">引擎</span>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-primary/10 text-primary font-medium">{engineLabel}</span>
          {config.engine === "cli-passthrough" && (
            <span className="text-[10px] text-fg-muted dark:text-fg-dark-muted">→ {config.target_cli}</span>
          )}
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {clis.map((c) => (
            <div key={c.cli} className="flex items-center gap-1">
              <Circle className={cn("w-1.5 h-1.5 fill-current", c.installed ? "text-primary" : "text-red-400")} />
              <span className="text-[10px] text-fg-muted dark:text-fg-dark-muted">{c.cli}</span>
            </div>
          ))}
        </div>
      </div>

      {/* MCP */}
      <div className="glass-card p-3 space-y-2">
        <div className="flex items-center gap-2">
          <Layers className="w-3.5 h-3.5 text-secondary" />
          <span className="text-[11px] font-semibold text-fg dark:text-fg-dark">MCP</span>
          <span className={cn("text-[9px] px-1 py-0.5 rounded font-medium", mcpInstalled.length > 0 ? "bg-primary/10 text-primary" : "bg-white/30 dark:bg-white/10 text-fg-muted")}>
            {mcpInstalled.length > 0 ? `${mcpInstalled.length} 已连接` : "未安装"}
          </span>
        </div>
        {mcpInstalled.length > 0 && (
          <div className="flex items-center gap-1 flex-wrap">
            {mcpInstalled.map((s) => (
              <span key={s.ide} className="text-[9px] px-1 py-0.5 rounded bg-white/40 dark:bg-white/10 text-fg-muted dark:text-fg-dark-muted">{s.ide}</span>
            ))}
          </div>
        )}
      </div>

      {/* 快捷键提示 */}
      <div className="text-[10px] text-fg-muted/50 dark:text-fg-dark-muted/50 space-y-1.5 px-1 pt-1">
        <div className="flex items-center gap-2">
          <kbd className="px-1 py-0.5 rounded bg-white/50 dark:bg-white/10 text-[9px] font-mono">⌘⇧R</kbd>
          <span>改写选中</span>
        </div>
        <div className="flex items-center gap-2">
          <kbd className="px-1 py-0.5 rounded bg-white/50 dark:bg-white/10 text-[9px] font-mono">⌘⇧L</kbd>
          <span>聚焦聊天</span>
        </div>
      </div>
    </div>
  );
}

// ========== 设置视图 ==========

type SettingsTab = "general" | "cli" | "api" | "rules" | "prompt" | "channels";

function SettingsView() {
  const config = useAppStore((s) => s.config)!;
  const replaceConfig = useAppStore((s) => s.replaceConfig);
  const clis = useAppStore((s) => s.clis);
  const refreshClis = useAppStore((s) => s.refreshClis);
  const [draft, setDraft] = useState<AppConfig>(config);
  const [settingsTab, setSettingsTab] = useState<SettingsTab>("general");

  useEffect(() => { setDraft(config); refreshClis(); }, [config, refreshClis]);

  const save = () => { replaceConfig(draft); };

  const SETTINGS_TABS: { key: SettingsTab; label: string }[] = [
    { key: "general", label: "通用" },
    { key: "cli", label: "CLI" },
    { key: "api", label: "API" },
    { key: "rules", label: "规则" },
    { key: "prompt", label: "提示词" },
    { key: "channels", label: "通道" },
  ];

  return (
    <div className="p-3 space-y-3">
      {/* 子 Tab */}
      <div className="flex items-center gap-0.5 flex-wrap">
        {SETTINGS_TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setSettingsTab(t.key)}
            className={cn(
              "px-2 py-1 text-[10px] font-medium rounded cursor-pointer transition-colors",
              settingsTab === t.key ? "bg-primary/10 text-primary" : "text-fg-muted dark:text-fg-dark-muted hover:text-fg dark:hover:text-fg-dark"
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* 通用 */}
      {settingsTab === "general" && (
        <div className="space-y-2.5">
          <Field label="引擎">
            <select className="glass-input !text-[11px] !py-1.5" value={draft.engine} onChange={(e) => setDraft({ ...draft, engine: e.target.value as any })}>
              <option value="cli-passthrough">CLI 透传</option>
              <option value="custom-api">自定义 API</option>
              <option value="rule-based">本地规则</option>
            </select>
          </Field>

          {draft.engine === "cli-passthrough" && (
            <Field label="目标 CLI">
              <select className="glass-input !text-[11px] !py-1.5" value={draft.target_cli} onChange={(e) => setDraft({ ...draft, target_cli: e.target.value as any })}>
                <option value="codex">Codex</option>
                <option value="claude">Claude</option>
                <option value="kiro">Kiro</option>
              </select>
            </Field>
          )}

          <Field label="主题">
            <select className="glass-input !text-[11px] !py-1.5" value={draft.theme} onChange={(e) => setDraft({ ...draft, theme: e.target.value })}>
              <option value="light">浅色</option>
              <option value="dark">深色</option>
              <option value="system">跟随系统</option>
            </select>
          </Field>

          <Field label="快捷键">
            <input className="glass-input !text-[11px] !py-1.5" value={draft.shortcut} onChange={(e) => setDraft({ ...draft, shortcut: e.target.value })} placeholder="CmdOrCtrl+Shift+P" />
          </Field>

          <CheckboxField label="剪贴板监听" checked={draft.clipboard_watch} onChange={(v) => setDraft({ ...draft, clipboard_watch: v })} />
        </div>
      )}

      {/* CLI */}
      {settingsTab === "cli" && <CliSettingsTab draft={draft} setDraft={setDraft} clis={clis} />}

      {/* API */}
      {settingsTab === "api" && (
        <div className="space-y-2.5">
          <Field label="Base URL">
            <input className="glass-input !text-[11px] !py-1.5 font-mono" value={draft.custom_api.base_url} onChange={(e) => setDraft({ ...draft, custom_api: { ...draft.custom_api, base_url: e.target.value } })} placeholder="https://api.openai.com/v1" />
          </Field>
          <Field label="API Key">
            <input className="glass-input !text-[11px] !py-1.5 font-mono" type="password" value={draft.custom_api.api_key} onChange={(e) => setDraft({ ...draft, custom_api: { ...draft.custom_api, api_key: e.target.value } })} placeholder="sk-..." />
          </Field>
          <Field label="模型">
            <input className="glass-input !text-[11px] !py-1.5" value={draft.custom_api.model} onChange={(e) => setDraft({ ...draft, custom_api: { ...draft.custom_api, model: e.target.value } })} placeholder="gpt-4o" />
          </Field>
          <Field label="Temperature">
            <input className="glass-input !text-[11px] !py-1.5 w-20" type="number" step="0.1" min="0" max="2" value={draft.custom_api.temperature} onChange={(e) => setDraft({ ...draft, custom_api: { ...draft.custom_api, temperature: parseFloat(e.target.value) || 0 } })} />
          </Field>
          <CheckboxField label="流式输出" checked={draft.custom_api.stream} onChange={(v) => setDraft({ ...draft, custom_api: { ...draft.custom_api, stream: v } })} />
        </div>
      )}

      {/* 规则 */}
      {settingsTab === "rules" && (
        <div className="space-y-2">
          {([
            { key: "trim_whitespace", label: "去除首尾空白" },
            { key: "collapse_blank_lines", label: "合并空行" },
            { key: "protect_code_blocks", label: "保护代码块" },
            { key: "remove_filler_words", label: "去除填充词" },
            { key: "structure_template", label: "结构化模板" },
            { key: "normalize_punctuation", label: "标点规范化" },
            { key: "require_action_verb", label: "要求动词开头" },
            { key: "compress_if_too_long", label: "超长压缩" },
          ] as const).map(({ key, label }) => (
            <CheckboxField
              key={key}
              label={label}
              checked={draft.rules[key] as boolean}
              onChange={(v) => setDraft({ ...draft, rules: { ...draft.rules, [key]: v } })}
            />
          ))}
          <Field label="压缩阈值">
            <input className="glass-input !text-[11px] !py-1.5 w-24" type="number" value={draft.rules.compress_threshold} onChange={(e) => setDraft({ ...draft, rules: { ...draft.rules, compress_threshold: parseInt(e.target.value) || 500 } })} />
          </Field>
        </div>
      )}

      {/* 系统提示词 */}
      {settingsTab === "prompt" && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[10px] text-fg-muted dark:text-fg-dark-muted">
              {draft.system_prompt.trim() ? "自定义" : "使用默认"}
            </span>
            <button
              onClick={() => setDraft({ ...draft, system_prompt: "" })}
              className="btn-ghost !text-[10px] !px-1.5 !py-0.5"
              disabled={!draft.system_prompt.trim()}
            >
              <RotateCcw className="w-2.5 h-2.5" />
              <span>重置</span>
            </button>
          </div>
          <textarea
            className="glass-input !text-[10px] min-h-[120px] resize-y font-mono"
            value={draft.system_prompt}
            placeholder="留空使用内置默认提示词..."
            onChange={(e) => setDraft({ ...draft, system_prompt: e.target.value })}
            spellCheck={false}
          />
        </div>
      )}

      {/* MCP 通道 */}
      {settingsTab === "channels" && <ChannelsTab draft={draft} setDraft={setDraft} />}

      {/* 保存 + 打开配置目录 */}
      <div className="flex items-center gap-2 pt-1 border-t border-white/10 dark:border-white/5">
        <button onClick={save} className="btn-primary !text-[11px] !px-3 !py-1.5">保存</button>
        <button onClick={() => api.openConfigDir()} className="btn-ghost !text-[11px] !px-2 !py-1.5">
          <FolderOpen className="w-3 h-3" />
          <span>配置目录</span>
        </button>
      </div>
    </div>
  );
}

// ========== MCP 通道配置 ==========

function ChannelsTab({ draft, setDraft }: { draft: AppConfig; setDraft: (d: AppConfig) => void }) {
  const channels = draft.mcp_channels || [];
  const [detecting, setDetecting] = useState(false);

  const addChannel = () => {
    const id = `ch-${Date.now().toString(36)}`;
    setDraft({
      ...draft,
      mcp_channels: [...channels, { id, name: "", project_dir: "", enabled: true }],
    });
  };

  const autoDetect = () => {
    setDetecting(true);
    api.getWorkspaceFolders()
      .then((folders) => {
        const newChannels = [...channels];
        if (folders && folders.length > 0) {
          const existing = new Set(channels.map(c => c.project_dir));
          for (const f of folders) {
            if (f.path && !existing.has(f.path)) {
              newChannels.push({
                id: `ch-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 4)}`,
                name: f.name || f.path.split("/").pop() || "项目",
                project_dir: f.path,
                enabled: true,
              });
            }
          }
        }
        if (newChannels.length === channels.length) {
          // 没有新增，添加一个空通道让用户手动填
          newChannels.push({
            id: `ch-${Date.now().toString(36)}`,
            name: "新通道",
            project_dir: "",
            enabled: true,
          });
        }
        setDraft({ ...draft, mcp_channels: newChannels });
      })
      .catch(() => {
        // 出错也添加空通道
        setDraft({
          ...draft,
          mcp_channels: [...channels, { id: `ch-${Date.now().toString(36)}`, name: "新通道", project_dir: "", enabled: true }],
        });
      })
      .finally(() => setDetecting(false));
  };

  const updateChannel = (index: number, patch: Partial<import("@/store/app-store").McpChannel>) => {
    const updated = [...channels];
    updated[index] = { ...updated[index], ...patch };
    setDraft({ ...draft, mcp_channels: updated });
  };

  const removeChannel = (index: number) => {
    setDraft({ ...draft, mcp_channels: channels.filter((_, i) => i !== index) });
  };

  return (
    <div className="space-y-2.5">
      <div className="flex items-center justify-between">
        <p className="text-[10px] text-fg-muted dark:text-fg-dark-muted">
          改写结果按通道推送到对应项目的 IDE。
        </p>
        <button
          onClick={autoDetect}
          disabled={detecting}
          className="text-[9px] px-1.5 py-0.5 rounded bg-primary/10 text-primary hover:bg-primary/20 cursor-pointer transition-colors disabled:opacity-50"
        >
          {detecting ? "检测中..." : "自动检测"}
        </button>
      </div>

      {channels.length === 0 && (
        <p className="text-[10px] text-fg-muted/60 dark:text-fg-dark-muted/60 py-2">
          未配置通道。点击"自动检测"获取当前工作区，或手动添加。
        </p>
      )}

      {channels.map((ch, i) => (
        <div key={ch.id} className="p-2 rounded-md bg-white/30 dark:bg-white/5 space-y-1.5">
          <div className="flex items-center justify-between">
            <CheckboxField
              label={ch.name || `通道 ${i + 1}`}
              checked={ch.enabled}
              onChange={(v) => updateChannel(i, { enabled: v })}
            />
            <button
              onClick={() => removeChannel(i)}
              className="text-[9px] text-red-400 hover:text-red-500 cursor-pointer px-1"
            >
              删除
            </button>
          </div>
          <input
            className="glass-input !text-[10px] !py-1"
            value={ch.name}
            onChange={(e) => updateChannel(i, { name: e.target.value })}
            placeholder="通道名称"
          />
          <input
            className="glass-input !text-[10px] !py-1 font-mono"
            value={ch.project_dir}
            onChange={(e) => updateChannel(i, { project_dir: e.target.value })}
            placeholder="项目目录路径"
          />
        </div>
      ))}

      <button
        onClick={addChannel}
        className="w-full py-1.5 text-[10px] text-primary hover:bg-primary/10 rounded cursor-pointer transition-colors border border-dashed border-primary/30"
      >
        + 手动添加
      </button>
    </div>
  );
}

// ========== CLI 设置子面板 ==========

function CliSettingsTab({ draft, setDraft, clis }: { draft: AppConfig; setDraft: (d: AppConfig) => void; clis: { cli: string; installed: boolean; version: string | null }[] }) {
  const [editCli, setEditCli] = useState<TargetCli>(draft.target_cli);
  const [models, setModels] = useState<import("@/store/app-store").ModelInfo[]>([]);
  const [loadingModels, setLoadingModels] = useState(false);
  const tpl = draft.cli_templates[editCli];

  const fetchModels = useCallback(() => {
    setLoadingModels(true);
    api.listModels(editCli)
      .then((m) => setModels(m as any[]))
      .catch(() => setModels([]))
      .finally(() => setLoadingModels(false));
  }, [editCli]);

  useEffect(() => { fetchModels(); }, [fetchModels]);

  const updateTpl = (patch: Partial<typeof tpl>) => {
    setDraft({
      ...draft,
      cli_templates: { ...draft.cli_templates, [editCli]: { ...tpl, ...patch } },
    });
  };

  return (
    <div className="space-y-2.5">
      {/* CLI 状态 */}
      <div className="space-y-1">
        {clis.map((c) => (
          <div key={c.cli} className="flex items-center gap-1.5 text-[10px]">
            <Circle className={cn("w-1.5 h-1.5 fill-current", c.installed ? "text-primary" : "text-red-400")} />
            <span className="font-medium">{c.cli}</span>
            <span className="text-fg-muted dark:text-fg-dark-muted">
              {c.installed ? c.version ?? "已安装" : "未安装"}
            </span>
          </div>
        ))}
      </div>

      {/* CLI 切换 */}
      <div className="flex items-center gap-1">
        {(["codex", "claude", "kiro"] as TargetCli[]).map((cli) => (
          <button
            key={cli}
            onClick={() => setEditCli(cli)}
            className={cn(
              "px-2 py-0.5 text-[10px] rounded cursor-pointer transition-colors",
              editCli === cli ? "bg-primary/10 text-primary font-medium" : "text-fg-muted dark:text-fg-dark-muted"
            )}
          >
            {cli}
          </button>
        ))}
      </div>

      <Field label="命令">
        <input className="glass-input !text-[11px] !py-1.5 font-mono" value={tpl.command} onChange={(e) => updateTpl({ command: e.target.value })} />
      </Field>
      <Field label="模型">
        <div className="flex items-center gap-1.5">
          {models.length > 0 ? (
            <select className="glass-input !text-[11px] !py-1.5 flex-1" value={tpl.model} onChange={(e) => updateTpl({ model: e.target.value })}>
              <option value="">默认</option>
              {models.map((m) => (
                <option key={m.slug} value={m.slug}>
                  {m.display_name}{m.description ? ` — ${m.description}` : ""}
                </option>
              ))}
            </select>
          ) : (
            <input className="glass-input !text-[11px] !py-1.5 flex-1" value={tpl.model} onChange={(e) => updateTpl({ model: e.target.value })} placeholder="留空使用默认" />
          )}
          <button
            onClick={fetchModels}
            disabled={loadingModels}
            className="shrink-0 px-1.5 py-1.5 rounded text-fg-muted dark:text-fg-dark-muted hover:text-primary hover:bg-primary/10 cursor-pointer transition-colors disabled:opacity-50"
            title="刷新模型列表"
          >
            <RotateCcw className={cn("w-3 h-3", loadingModels && "animate-spin")} />
          </button>
        </div>
      </Field>
      <Field label="模型参数">
        <input className="glass-input !text-[11px] !py-1.5" value={tpl.model_flag} onChange={(e) => updateTpl({ model_flag: e.target.value })} placeholder="--model" />
      </Field>
      <Field label="推理强度">
        <select className="glass-input !text-[11px] !py-1.5" value={tpl.reasoning_effort} onChange={(e) => updateTpl({ reasoning_effort: e.target.value })}>
          <option value="">默认</option>
          <option value="low">低</option>
          <option value="medium">中</option>
          <option value="high">高</option>
        </select>
      </Field>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <label className="text-[10px] font-medium text-fg-muted dark:text-fg-dark-muted">{label}</label>
      {children}
    </div>
  );
}

function CheckboxField({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-center gap-2 cursor-pointer">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="w-3.5 h-3.5 accent-primary" />
      <span className="text-[11px]">{label}</span>
    </label>
  );
}
