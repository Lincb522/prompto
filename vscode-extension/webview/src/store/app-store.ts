import { create } from "zustand";
import { api, onMessage } from "@/lib/vscode-api";

// ============================================================
// 类型定义（与客户端对齐）
// ============================================================

export type EngineKind = "cli-passthrough" | "custom-api" | "rule-based";
export type TargetCli = "codex" | "claude" | "kiro";

export interface CliTemplate {
  command: string;
  args: string[];
  stdin_mode: boolean;
  model: string;
  model_flag: string;
  reasoning_effort: string;
  strip_patterns: string[];
  supports_passthrough: boolean;
}

export interface CustomApiConfig {
  base_url: string;
  api_key: string;
  model: string;
  stream: boolean;
  temperature: number;
}

export interface RuleConfig {
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

export interface AppConfig {
  engine: EngineKind;
  target_cli: TargetCli;
  custom_api: CustomApiConfig;
  cli_templates: Record<TargetCli, CliTemplate>;
  rules: RuleConfig;
  clipboard_watch: boolean;
  shortcut: string;
  system_prompt: string;
  theme: string;
  mcp_channels: McpChannel[];
}

export interface McpChannel {
  id: string;
  name: string;
  project_dir: string;
  enabled: boolean;
}

export interface HistoryItem {
  id: string;
  created_at: number;
  engine: string;
  target_cli: string | null;
  original: string;
  optimized: string;
  pinned?: boolean;
}

export interface CliStatus {
  cli: string;
  installed: boolean;
  version: string | null;
  command: string;
}

export interface ModelInfo {
  slug: string;
  display_name: string;
  description: string | null;
  reasoning_levels: string[];
  default_reasoning: string | null;
}

export interface McpStatus {
  ide: string;
  installed: boolean;
}

type OptimizeStatus = "idle" | "loading" | "success" | "error";

// ============================================================
// Store
// ============================================================

interface AppState {
  config: AppConfig | null;
  clis: CliStatus[];
  history: HistoryItem[];
  input: string;
  output: string;
  status: OptimizeStatus;
  errorMsg: string;

  setInput: (v: string) => void;
  setOutput: (v: string) => void;

  loadInitial: () => Promise<void>;
  refreshClis: () => Promise<void>;
  refreshHistory: () => Promise<void>;
  updateConfig: (patch: Partial<AppConfig>) => Promise<void>;
  replaceConfig: (cfg: AppConfig) => Promise<void>;

  optimize: () => Promise<void>;
  loadFromHistory: (item: HistoryItem) => void;
  clearAllHistory: () => Promise<void>;
  deleteHistoryItem: (id: string) => Promise<void>;
  togglePin: (id: string) => Promise<void>;
}

export const useAppStore = create<AppState>((set, get) => ({
  config: null,
  clis: [],
  history: [],
  input: "",
  output: "",
  status: "idle",
  errorMsg: "",

  setInput: (v) => set({ input: v }),
  setOutput: (v) => set({ output: v }),

  loadInitial: async () => {
    try {
      const [config, clis, history] = await Promise.all([
        api.getConfig(),
        api.detectClis(),
        api.getHistory(),
      ]);
      set({
        config: config as AppConfig,
        clis: clis as CliStatus[],
        history: history as HistoryItem[],
      });
    } catch (e) {
      console.error("加载初始数据失败:", e);
    }

    // 监听来自 extension 的 setInput 消息
    onMessage("setInput", (payload) => {
      set({ input: payload as string });
    });
  },

  refreshClis: async () => {
    const clis = await api.detectClis();
    set({ clis: clis as CliStatus[] });
  },

  refreshHistory: async () => {
    const history = await api.getHistory();
    set({ history: history as HistoryItem[] });
  },

  updateConfig: async (patch) => {
    const current = get().config;
    if (!current) return;
    const next = { ...current, ...patch } as AppConfig;
    const saved = await api.updateConfig(next);
    set({ config: saved as AppConfig });
  },

  replaceConfig: async (cfg) => {
    const saved = await api.updateConfig(cfg);
    set({ config: saved as AppConfig });
  },

  optimize: async () => {
    const input = get().input.trim();
    if (!input) {
      set({ errorMsg: "请输入原始提示词", status: "error" });
      return;
    }
    const requestId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    set({ status: "loading", errorMsg: "", output: "" });
    try {
      const result = await api.optimize(input, requestId) as { optimized: string; item: HistoryItem };
      set({
        output: result.optimized,
        status: "success",
        history: [result.item, ...get().history].slice(0, 200),
      });
    } catch (e: any) {
      set({
        status: "error",
        errorMsg: typeof e === "string" ? e : e?.message ?? "未知错误",
      });
    }
  },

  loadFromHistory: (item) =>
    set({ input: item.original, output: item.optimized, status: "success" }),

  clearAllHistory: async () => {
    await api.clearAllHistory();
    set({ history: [] });
  },

  deleteHistoryItem: async (id) => {
    const items = await api.deleteHistoryItem(id);
    set({ history: items as HistoryItem[] });
  },

  togglePin: async (id) => {
    const items = await api.togglePin(id);
    set({ history: items as HistoryItem[] });
  },
}));
