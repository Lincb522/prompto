import { useEffect } from "react";
import { useAppStore } from "@/store/app-store";
import { ConfigPanel } from "@/components/ConfigPanel";
import { ChatPanel } from "@/components/ChatPanel";

declare global {
  interface Window {
    __PROMPTO_MODE__?: string;
  }
}

const mode = window.__PROMPTO_MODE__ || "chat";

export default function App() {
  const config = useAppStore((s) => s.config);
  const loadInitial = useAppStore((s) => s.loadInitial);

  useEffect(() => { loadInitial(); }, [loadInitial]);

  // 主题
  useEffect(() => {
    if (!config?.theme) return;
    const root = document.documentElement;
    if (config.theme === "dark") {
      root.classList.add("dark");
    } else if (config.theme === "system") {
      const isDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
      root.classList.toggle("dark", isDark);
    } else {
      root.classList.remove("dark");
    }
  }, [config?.theme]);

  if (mode === "config") return <ConfigPanel />;
  return <ChatPanel />;
}
