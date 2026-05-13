// Tauri 命令的 TS 封装
import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";

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

export interface ModelInfo {
  slug: string;
  display_name: string;
  description: string | null;
  reasoning_levels: string[];
  default_reasoning: string | null;
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

export interface OptimizeResult {
  optimized: string;
  item: HistoryItem;
}

export interface CliStatus {
  cli: TargetCli;
  installed: boolean;
  version: string | null;
  command: string;
}

export interface StreamChunk {
  request_id: string;
  delta: string;
}

export const api = {
  optimize: (request_id: string, input: string) =>
    invoke<OptimizeResult>("optimize_prompt", { requestId: request_id, input }),
  detectClis: () => invoke<CliStatus[]>("detect_clis"),
  listModels: (cli: TargetCli) => invoke<ModelInfo[]>("list_models", { cli }),
  getConfig: () => invoke<AppConfig>("get_config"),
  updateConfig: (cfg: AppConfig) =>
    invoke<AppConfig>("update_config", { cfg }),
  getHistory: () => invoke<HistoryItem[]>("get_history"),
  clearHistory: () => invoke<void>("clear_history"),
  clearAllHistory: () => invoke<void>("clear_all_history"),
  deleteHistoryItem: (id: string) =>
    invoke<HistoryItem[]>("delete_history_item", { id }),
  toggleHistoryPin: (id: string) =>
    invoke<HistoryItem[]>("toggle_history_pin", { id }),
  defaultSystemPrompt: () => invoke<string>("default_system_prompt"),
  showWindow: () => invoke<void>("show_window"),
  openConfigDir: () => invoke<void>("open_config_dir"),
};

export function onStreamChunk(cb: (chunk: StreamChunk) => void): Promise<UnlistenFn> {
  return listen<StreamChunk>("prompto://optimize-chunk", (evt) => cb(evt.payload));
}

export function onHotkeyCapture(cb: () => void): Promise<UnlistenFn> {
  return listen("prompto://hotkey-capture", () => cb());
}
