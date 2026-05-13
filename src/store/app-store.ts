// 全局状态
import { create } from "zustand";
import {
  api,
  onStreamChunk,
  type AppConfig,
  type CliStatus,
  type HistoryItem,
  type StreamChunk,
} from "@/lib/api";

type OptimizeStatus = "idle" | "loading" | "success" | "error";

interface AppState {
  config: AppConfig | null;
  clis: CliStatus[];
  history: HistoryItem[];
  input: string;
  output: string;
  status: OptimizeStatus;
  errorMsg: string;
  currentRequestId: string | null;

  setInput: (v: string) => void;
  setOutput: (v: string) => void;

  loadInitial: () => Promise<void>;
  refreshClis: () => Promise<void>;
  refreshHistory: () => Promise<void>;
  updateConfig: (patch: Partial<AppConfig>) => Promise<void>;
  replaceConfig: (cfg: AppConfig) => Promise<void>;

  optimize: () => Promise<void>;
  cancelOptimize: () => void;
  reOptimize: (item: HistoryItem) => Promise<void>;
  clearHistory: () => Promise<void>;
  clearAllHistory: () => Promise<void>;
  deleteHistoryItem: (id: string) => Promise<void>;
  togglePin: (id: string) => Promise<void>;
  loadFromHistory: (item: HistoryItem) => void;
}

let streamUnsubscribe: (() => void) | null = null;

export const useAppStore = create<AppState>((set, get) => ({
  config: null,
  clis: [],
  history: [],
  input: "",
  output: "",
  status: "idle",
  errorMsg: "",
  currentRequestId: null,

  setInput: (v) => set({ input: v }),
  setOutput: (v) => set({ output: v }),

  loadInitial: async () => {
    const [config, clis, history] = await Promise.all([
      api.getConfig(),
      api.detectClis(),
      api.getHistory(),
    ]);
    set({ config, clis, history });
    // 只订阅一次
    if (!streamUnsubscribe) {
      const unlisten = await onStreamChunk((chunk: StreamChunk) => {
        const state = get();
        if (state.currentRequestId && chunk.request_id === state.currentRequestId) {
          set({ output: state.output + chunk.delta });
        }
      });
      streamUnsubscribe = unlisten;
    }
  },

  refreshClis: async () => set({ clis: await api.detectClis() }),
  refreshHistory: async () => set({ history: await api.getHistory() }),

  updateConfig: async (patch) => {
    const current = get().config;
    if (!current) return;
    const next: AppConfig = { ...current, ...patch };
    const saved = await api.updateConfig(next);
    set({ config: saved });
  },

  replaceConfig: async (cfg) => {
    const saved = await api.updateConfig(cfg);
    set({ config: saved });
  },

  optimize: async () => {
    const input = get().input.trim();
    if (!input) {
      set({ errorMsg: "请输入原始提示词", status: "error" });
      return;
    }
    const requestId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    set({
      status: "loading",
      errorMsg: "",
      output: "",
      currentRequestId: requestId,
    });
    try {
      const res = await api.optimize(requestId, input);
      // 流式模式下前端已经累积过内容；以后端最终返回为准校正
      set({
        output: res.optimized,
        status: "success",
        currentRequestId: null,
        history: [res.item, ...get().history].slice(0, 100),
      });
    } catch (e: any) {
      set({
        status: "error",
        currentRequestId: null,
        errorMsg: typeof e === "string" ? e : e?.message ?? "未知错误",
      });
    }
  },

  cancelOptimize: () => {
    // 后端尚未支持取消信号；这里仅把前端状态归位，避免旧 chunk 继续追加
    set({ status: "idle", currentRequestId: null });
  },

  reOptimize: async (item) => {
    set({ input: item.original, output: "", status: "idle", errorMsg: "" });
    await get().optimize();
  },

  clearHistory: async () => {
    await api.clearHistory();
    set({ history: await api.getHistory() });
  },

  clearAllHistory: async () => {
    await api.clearAllHistory();
    set({ history: [] });
  },

  deleteHistoryItem: async (id) => {
    const next = await api.deleteHistoryItem(id);
    set({ history: next });
  },

  togglePin: async (id) => {
    const next = await api.toggleHistoryPin(id);
    set({ history: next });
  },

  loadFromHistory: (item) =>
    set({ input: item.original, output: item.optimized, status: "success" }),
}));
