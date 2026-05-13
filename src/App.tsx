import { useState, useEffect } from "react";
import { useAppStore } from "@/store/app-store";
import { applyTheme, watchSystemTheme, type Theme } from "@/lib/theme";
import { onHotkeyCapture } from "@/lib/api";
import { Navbar } from "@/components/Navbar";
import { HomePage } from "@/components/HomePage";
import { Editor } from "@/components/Editor";
import { HistoryDrawer } from "@/components/HistoryDrawer";
import { SettingsModal } from "@/components/SettingsModal";
import { Clipboard, Circle } from "lucide-react";
import { readText } from "@tauri-apps/plugin-clipboard-manager";
import { cn } from "@/lib/cn";

type Page = "home" | "editor";

export default function App() {
  const [page, setPage] = useState<Page>("home");
  const [historyOpen, setHistoryOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const config = useAppStore((s) => s.config);
  const input = useAppStore((s) => s.input);
  const output = useAppStore((s) => s.output);
  const clis = useAppStore((s) => s.clis);
  const loadInitial = useAppStore((s) => s.loadInitial);
  const setInput = useAppStore((s) => s.setInput);

  useEffect(() => { loadInitial(); }, [loadInitial]);

  useEffect(() => {
    if (config?.theme) applyTheme(config.theme as Theme);
  }, [config?.theme]);

  useEffect(() => {
    if (config?.theme === "system") {
      return watchSystemTheme(() => applyTheme("system"));
    }
  }, [config?.theme]);

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    onHotkeyCapture(async () => {
      try {
        const text = await readText();
        if (text) setInput(text);
      } catch {}
      setPage("editor");
    }).then((fn) => { unlisten = fn; });
    return () => unlisten?.();
  }, [setInput]);

  const currentCli = clis.find((c) => c.cli === config?.target_cli);
  const cliInstalled = currentCli?.installed ?? false;

  return (
    <div className="h-full flex flex-col">
      <Navbar
        page={page}
        onNavigate={setPage}
        onOpenHistory={() => setHistoryOpen(true)}
        onOpenSettings={() => setSettingsOpen(true)}
      />

      {page === "home" && <HomePage onNavigate={setPage} />}
      {page === "editor" && <Editor />}

      {/* 底部状态栏 */}
      <footer className="h-8 flex items-center justify-between px-4 text-[11px] text-fg-muted dark:text-fg-dark-muted border-t border-white/20 dark:border-white/10">
        <div className="flex items-center gap-3">
          {config?.engine === "cli-passthrough" && (
            <div className="flex items-center gap-1.5">
              <Circle className={cn("w-2 h-2 fill-current", cliInstalled ? "text-primary" : "text-red-400")} />
              <span className="whitespace-nowrap">{config.target_cli}{cliInstalled ? "" : " (未安装)"}</span>
            </div>
          )}
          <div className="flex items-center gap-1.5">
            <Clipboard className="w-3 h-3" />
            <span className="whitespace-nowrap">{config?.clipboard_watch ? "监听中" : "已关闭"}</span>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className="whitespace-nowrap">输入: {input.length}</span>
          <span className="whitespace-nowrap">结果: {output.length}</span>
        </div>
      </footer>

      <HistoryDrawer open={historyOpen} onClose={() => { setHistoryOpen(false); setPage("editor"); }} />
      <SettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </div>
  );
}
