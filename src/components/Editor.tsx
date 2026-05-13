import { useRef, useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowRight,
  Copy,
  RotateCcw,
  Loader2,
  Square,
  Sparkles,
  Zap,
  Check,
  Clipboard,
  Send,
} from "lucide-react";
import { cn } from "@/lib/cn";
import { useAppStore } from "@/store/app-store";
import { api, type ModelInfo } from "@/lib/api";
import { readText, writeText } from "@tauri-apps/plugin-clipboard-manager";
import { Dropdown } from "./Dropdown";

export function Editor() {
  const config = useAppStore((s) => s.config);
  const input = useAppStore((s) => s.input);
  const output = useAppStore((s) => s.output);
  const status = useAppStore((s) => s.status);
  const errorMsg = useAppStore((s) => s.errorMsg);
  const setInput = useAppStore((s) => s.setInput);
  const optimize = useAppStore((s) => s.optimize);
  const cancelOptimize = useAppStore((s) => s.cancelOptimize);
  const updateConfig = useAppStore((s) => s.updateConfig);

  const inputRef = useRef<HTMLTextAreaElement>(null);
  const [models, setModels] = useState<ModelInfo[]>([]);
  const [copied, setCopied] = useState(false);

  const showCli = config?.engine === "cli-passthrough";
  const tpl = showCli && config ? config.cli_templates[config.target_cli] : undefined;
  const curModel = tpl?.model ?? "";
  const curInfo = useMemo(() => models.find((m) => m.slug === curModel), [models, curModel]);
  const levels = curInfo?.reasoning_levels ?? [];

  useEffect(() => {
    if (!config || config.engine !== "cli-passthrough") { setModels([]); return; }
    let cancelled = false;
    const load = async () => {
      try {
        const list = await api.listModels(config.target_cli);
        if (!cancelled) setModels(list);
      } catch {
        if (!cancelled) setModels([]);
      }
    };
    void load();
    return () => { cancelled = true; };
  }, [config?.engine, config?.target_cli, config]);

  const patchTpl = (p: Record<string, unknown>) => {
    if (!tpl || !config) return;
    updateConfig({ cli_templates: { ...config.cli_templates, [config.target_cli]: { ...tpl, ...p } } });
  };

  const handleOptimize = useCallback(() => { optimize(); }, [optimize]);
  const handleCopy = useCallback(async () => {
    if (!output) return;
    await writeText(output);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }, [output]);
  const handlePaste = useCallback(async () => {
    try { const t = await readText(); if (t) setInput(t); } catch {}
  }, [setInput]);
  const handleClear = useCallback(() => { setInput(""); }, [setInput]);
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") { e.preventDefault(); handleOptimize(); }
  }, [handleOptimize]);
  const handleSendToIde = useCallback(async () => {
    if (!output) return;
    await writeText(output);
    try {
      const { Command } = await import("@tauri-apps/plugin-shell");
      await Command.create("osascript", ["-e", 'tell application "System Events" to keystroke "v" using command down']).execute();
    } catch {}
  }, [output]);

  const isLoading = status === "loading";
  const streaming = config?.custom_api.stream && config?.engine === "custom-api";

  const modelOptions = [
    { value: "", label: "默认模型" },
    ...models.map((m) => ({ value: m.slug, label: m.display_name })),
  ];
  const effortOptions = [
    { value: "", label: "自动" },
    ...levels.map((l) => ({ value: l, label: l })),
  ];

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* 模型/思考选择条 */}
      {showCli && models.length > 0 && (
        <div className="flex items-center gap-3 px-5 py-2 border-b border-white/15 dark:border-white/5 bg-white/20 dark:bg-white/5">
          <Sparkles className="w-3.5 h-3.5 text-primary shrink-0" />
          <Dropdown options={modelOptions} value={curModel} onChange={(v) => patchTpl({ model: v })} placeholder="模型" />
          {levels.length > 0 && (
            <>
              <Zap className="w-3.5 h-3.5 text-fg-muted dark:text-fg-dark-muted shrink-0" />
              <Dropdown options={effortOptions} value={tpl?.reasoning_effort ?? ""} onChange={(v) => patchTpl({ reasoning_effort: v })} placeholder="思考" />
            </>
          )}
          <div className="flex-1" />
          <span className="text-[10px] text-fg-muted dark:text-fg-dark-muted whitespace-nowrap">
            ⌘+Enter 改写
          </span>
        </div>
      )}

      {/* 主编辑区 */}
      <div className="flex-1 flex min-h-0 p-4 gap-4">
        {/* 左：输入 */}
        <div className="flex-1 flex flex-col glass-card overflow-hidden min-w-0">
          <div className="flex items-center justify-between px-4 py-2.5 border-b border-white/15 dark:border-white/5">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-primary/60" />
              <span className="text-xs font-semibold text-fg dark:text-fg-dark whitespace-nowrap">输入</span>
              <span className="text-[10px] text-fg-muted dark:text-fg-dark-muted whitespace-nowrap">{input.length} 字</span>
            </div>
            <div className="flex items-center gap-1">
              <button type="button" onClick={() => void handlePaste()} className="btn-ghost !px-2 !py-1 !text-[11px]">
                <Clipboard className="w-3 h-3" />
                <span className="whitespace-nowrap">粘贴</span>
              </button>
              <button type="button" onClick={handleClear} className="btn-ghost !px-2 !py-1 !text-[11px]" disabled={!input}>
                <RotateCcw className="w-3 h-3" />
                <span className="whitespace-nowrap">清空</span>
              </button>
            </div>
          </div>
          <div className="flex-1 min-h-0 p-4">
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="在这里输入或粘贴你的提示词…"
              className="w-full h-full resize-none bg-transparent outline-none text-sm font-mono leading-relaxed text-fg dark:text-fg-dark placeholder:text-fg-muted/40 dark:placeholder:text-fg-dark-muted/40"
              spellCheck={false}
            />
          </div>
        </div>

        {/* 中间操作条 */}
        <div className="flex flex-col items-center justify-center gap-3 shrink-0">
          {isLoading ? (
            <button type="button" onClick={cancelOptimize} className="w-11 h-11 rounded-xl bg-red-500/10 border border-red-500/30 flex items-center justify-center cursor-pointer hover:bg-red-500/20 transition-colors" title="停止">
              <Square className="w-4 h-4 text-red-500" />
            </button>
          ) : (
            <button
              type="button"
              onClick={handleOptimize}
              disabled={!input.trim()}
              className={cn(
                "w-11 h-11 rounded-xl flex items-center justify-center cursor-pointer transition-all duration-200",
                input.trim()
                  ? "bg-primary text-white shadow-btn hover:shadow-btn-hover hover:-translate-y-0.5"
                  : "bg-white/30 dark:bg-white/10 text-fg-muted dark:text-fg-dark-muted cursor-not-allowed",
              )}
              title="改写 (⌘+Enter)"
            >
              <ArrowRight className="w-4 h-4" />
            </button>
          )}
          <span className="text-[9px] text-fg-muted dark:text-fg-dark-muted whitespace-nowrap font-mono">⌘↵</span>
        </div>

        {/* 右：结果 */}
        <div className="flex-1 flex flex-col glass-card overflow-hidden min-w-0">
          <div className="flex items-center justify-between px-4 py-2.5 border-b border-white/15 dark:border-white/5">
            <div className="flex items-center gap-2">
              <div className={cn("w-2 h-2 rounded-full", isLoading ? "bg-yellow-400 animate-pulse" : output ? "bg-primary" : "bg-fg-muted/30")} />
              <span className="text-xs font-semibold text-fg dark:text-fg-dark whitespace-nowrap">结果</span>
              <span className="text-[10px] text-fg-muted dark:text-fg-dark-muted whitespace-nowrap">{output.length} 字</span>
              {isLoading && (
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-primary/10 text-primary whitespace-nowrap animate-pulse">
                  {streaming ? "接收中" : "处理中"}
                </span>
              )}
            </div>
            <div className="flex items-center gap-1">
              <button type="button" onClick={() => void handleCopy()} className="btn-ghost !px-2 !py-1 !text-[11px]" disabled={!output}>
                {copied ? <Check className="w-3 h-3 text-primary" /> : <Copy className="w-3 h-3" />}
                <span className="whitespace-nowrap">{copied ? "已复制" : "复制"}</span>
              </button>
              <button type="button" onClick={() => void handleSendToIde()} className="btn-ghost !px-2 !py-1 !text-[11px]" disabled={!output} title="发送到 IDE">
                <Send className="w-3 h-3" />
                <span className="whitespace-nowrap">发送</span>
              </button>
            </div>
          </div>
          <div className="flex-1 min-h-0 p-4 overflow-auto">
            {isLoading && !output && (
              <div className="flex items-center gap-2 text-fg-muted dark:text-fg-dark-muted">
                <Loader2 className="w-4 h-4 animate-spin text-primary" />
                <span className="text-sm whitespace-nowrap">改写中…</span>
              </div>
            )}
            {isLoading && output && (
              <pre className="text-sm whitespace-pre-wrap break-words font-mono leading-relaxed text-fg dark:text-fg-dark">
                {output}
                <span className="inline-block w-1.5 h-4 bg-primary ml-0.5 align-middle animate-pulse rounded-sm" />
              </pre>
            )}
            {!isLoading && output && (
              <pre className="text-sm whitespace-pre-wrap break-words font-mono leading-relaxed text-fg dark:text-fg-dark">{output}</pre>
            )}
            {status === "error" && errorMsg && (
              <div className="p-3 rounded-lg bg-red-500/5 border border-red-500/20">
                <pre className="text-sm text-red-500 font-mono whitespace-pre-wrap break-words">{errorMsg}</pre>
              </div>
            )}
            {status === "idle" && !output && (
              <div className="h-full flex flex-col items-center justify-center gap-2 text-fg-muted/40 dark:text-fg-dark-muted/40">
                <Sparkles className="w-6 h-6" />
                <span className="text-sm">改写结果将显示在这里</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
