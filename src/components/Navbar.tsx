import { History, Settings, Sun, Moon, Monitor, Home, Wand2 } from "lucide-react";
import { cn } from "@/lib/cn";
import { useAppStore } from "@/store/app-store";
import { applyTheme, type Theme } from "@/lib/theme";
import { Dropdown } from "./Dropdown";

const ENGINE_OPTIONS = [
  { value: "cli-passthrough", label: "CLI" },
  { value: "custom-api", label: "API" },
  { value: "rule-based", label: "规则" },
];

const CLI_OPTIONS = [
  { value: "codex", label: "Codex" },
  { value: "claude", label: "Claude" },
  { value: "kiro", label: "Kiro" },
];

interface NavbarProps {
  page: "home" | "editor";
  onNavigate: (p: "home" | "editor") => void;
  onOpenHistory: () => void;
  onOpenSettings: () => void;
}

export function Navbar({ page, onNavigate, onOpenHistory, onOpenSettings }: NavbarProps) {
  const config = useAppStore((s) => s.config);
  const updateConfig = useAppStore((s) => s.updateConfig);

  const currentTheme = (config?.theme ?? "light") as Theme;

  const cycleTheme = () => {
    const order: Theme[] = ["light", "dark", "system"];
    const idx = order.indexOf(currentTheme);
    const next = order[(idx + 1) % order.length];
    applyTheme(next);
    updateConfig({ theme: next });
  };

  const ThemeIcon = currentTheme === "dark" ? Moon : currentTheme === "system" ? Monitor : Sun;

  return (
    <header className="h-12 flex items-center px-4 glass-card rounded-none border-x-0 border-t-0 relative z-50 select-none" data-tauri-drag-region>
      {/* 左侧留空给系统交通灯 */}
      <div className="w-[72px] shrink-0" />

      {/* 中间拖拽区 + 导航 */}
      <div className="flex-1 flex items-center justify-center gap-1">
        {/* 页面切换 */}
        <div className="flex items-center gap-0.5 p-0.5 rounded-lg bg-white/30 dark:bg-white/10">
          <button
            onClick={() => onNavigate("home")}
            className={cn(
              "flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium cursor-pointer transition-all duration-150 whitespace-nowrap",
              page === "home"
                ? "bg-white dark:bg-white/20 text-fg dark:text-fg-dark shadow-sm"
                : "text-fg-muted dark:text-fg-dark-muted hover:text-fg dark:hover:text-fg-dark",
            )}
          >
            <Home className="w-3.5 h-3.5" />
            首页
          </button>
          <button
            onClick={() => onNavigate("editor")}
            className={cn(
              "flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium cursor-pointer transition-all duration-150 whitespace-nowrap",
              page === "editor"
                ? "bg-white dark:bg-white/20 text-fg dark:text-fg-dark shadow-sm"
                : "text-fg-muted dark:text-fg-dark-muted hover:text-fg dark:hover:text-fg-dark",
            )}
          >
            <Wand2 className="w-3.5 h-3.5" />
            编辑器
          </button>
        </div>

        {/* 引擎/CLI 选择（仅编辑器页面） */}
        {page === "editor" && (
          <div className="flex items-center gap-1.5 ml-3">
            <Dropdown
              options={ENGINE_OPTIONS}
              value={config?.engine ?? "cli-passthrough"}
              onChange={(v) => updateConfig({ engine: v as "cli-passthrough" | "custom-api" | "rule-based" })}
            />
            {config?.engine === "cli-passthrough" && (
              <Dropdown
                options={CLI_OPTIONS}
                value={config?.target_cli ?? "codex"}
                onChange={(v) => updateConfig({ target_cli: v as "codex" | "claude" | "kiro" })}
              />
            )}
          </div>
        )}
      </div>

      {/* 右侧图标 */}
      <div className="flex items-center gap-0.5 shrink-0">
        <button type="button" onClick={onOpenHistory} className="btn-icon" title="记录">
          <History className="w-4 h-4" />
        </button>
        <button type="button" onClick={onOpenSettings} className="btn-icon" title="设置">
          <Settings className="w-4 h-4" />
        </button>
        <button type="button" onClick={cycleTheme} className="btn-icon" title={`主题: ${currentTheme}`}>
          <ThemeIcon className="w-4 h-4" />
        </button>
      </div>
    </header>
  );
}
