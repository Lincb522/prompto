import { ArrowRight, Clipboard, Wand2, Clock, Terminal, Zap, Circle, Layers, BarChart3, Sparkles } from "lucide-react";
import { useAppStore } from "@/store/app-store";
import { readText } from "@tauri-apps/plugin-clipboard-manager";
import { cn } from "@/lib/cn";
import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";

interface Props {
  onNavigate: (page: "editor") => void;
}

export function HomePage({ onNavigate }: Props) {
  const config = useAppStore((s) => s.config);
  const clis = useAppStore((s) => s.clis);
  const history = useAppStore((s) => s.history);
  const setInput = useAppStore((s) => s.setInput);
  const loadFromHistory = useAppStore((s) => s.loadFromHistory);

  const [mcpIdes, setMcpIdes] = useState<string[]>([]);
  const mcpCount = mcpIdes.length;

  useEffect(() => {
    void invoke<{ ide: string; installed: boolean }[]>("check_mcp_status")
      .then((results) => setMcpIdes(results.filter((r) => r.installed).map((r) => r.ide)))
      .catch(() => {});
  }, []);

  if (!config) return null;

  const startEmpty = () => onNavigate("editor");
  const startFromClipboard = async () => {
    try {
      const text = await readText();
      if (text && text.trim()) setInput(text);
    } catch {}
    onNavigate("editor");
  };

  const recent = history.slice(0, 5);
  const engineLabel =
    config.engine === "cli-passthrough" ? "CLI 透传"
    : config.engine === "custom-api" ? "自定义 API"
    : "本地规则";

  // 统计
  const totalOptimizations = history.length;
  const todayCount = history.filter((h) => {
    const d = new Date(h.created_at);
    const now = new Date();
    return d.toDateString() === now.toDateString();
  }).length;

  return (
    <div className="flex-1 overflow-auto">
      <div className="max-w-4xl mx-auto px-8 py-6 space-y-5">

        {/* 顶部欢迎 + 统计 */}
        <div className="flex items-start justify-between gap-6">
          <div>
            <h1 className="text-xl font-bold text-fg dark:text-fg-dark">Prompto</h1>
            <p className="text-sm text-fg-muted dark:text-fg-dark-muted mt-1">提示词改写工作台</p>
          </div>
          <div className="flex items-center gap-4">
            <StatBadge icon={<BarChart3 className="w-3.5 h-3.5" />} label="总计" value={totalOptimizations} />
            <StatBadge icon={<Sparkles className="w-3.5 h-3.5" />} label="今日" value={todayCount} color="primary" />
          </div>
        </div>

        {/* 快速操作 */}
        <div className="grid grid-cols-3 gap-3">
          <ActionCard
            icon={<Wand2 className="w-5 h-5" />}
            title="开始改写"
            desc="手动输入内容"
            color="primary"
            onClick={startEmpty}
          />
          <ActionCard
            icon={<Clipboard className="w-5 h-5" />}
            title="从剪贴板"
            desc="读取并填入"
            color="secondary"
            onClick={() => void startFromClipboard()}
          />
          <ActionCard
            icon={<Clock className="w-5 h-5" />}
            title="继续上次"
            desc={recent.length > 0 ? "加载最近一条" : "暂无记录"}
            color="neutral"
            disabled={recent.length === 0}
            onClick={() => { if (recent[0]) { loadFromHistory(recent[0]); onNavigate("editor"); } }}
          />
        </div>

        {/* 引擎 + MCP 双栏 */}
        <div className="grid grid-cols-2 gap-3">
          {/* 引擎状态 */}
          <div className="glass-card p-4 space-y-3">
            <div className="flex items-center gap-2">
              <Zap className="w-4 h-4 text-primary" />
              <span className="text-xs font-semibold text-fg dark:text-fg-dark whitespace-nowrap">引擎</span>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[11px] px-2 py-0.5 rounded-md bg-primary/10 text-primary font-medium whitespace-nowrap">
                {engineLabel}
              </span>
              {config.engine === "cli-passthrough" && (
                <span className="text-[11px] text-fg-muted dark:text-fg-dark-muted whitespace-nowrap">
                  → {config.target_cli}
                </span>
              )}
            </div>
            <div className="flex items-center gap-3">
              {clis.map((c) => (
                <div key={c.cli} className="flex items-center gap-1">
                  <Circle className={cn("w-1.5 h-1.5 fill-current", c.installed ? "text-primary" : "text-red-400")} />
                  <span className="text-[11px] text-fg-muted dark:text-fg-dark-muted whitespace-nowrap">{c.cli}</span>
                </div>
              ))}
            </div>
          </div>

          {/* MCP 状态 */}
          <div className="glass-card p-4 space-y-3">
            <div className="flex items-center gap-2">
              <Layers className="w-4 h-4 text-secondary" />
              <span className="text-xs font-semibold text-fg dark:text-fg-dark whitespace-nowrap">MCP</span>
              <span className={cn("text-[10px] px-1.5 py-0.5 rounded-md font-medium whitespace-nowrap", mcpCount > 0 ? "bg-primary/10 text-primary" : "bg-white/30 dark:bg-white/10 text-fg-muted dark:text-fg-dark-muted")}>
                {mcpCount > 0 ? `${mcpCount} 个已连接` : "未安装"}
              </span>
            </div>
            {mcpCount > 0 ? (
              <div className="flex items-center gap-1.5 flex-wrap">
                {mcpIdes.map((ide) => (
                  <span key={ide} className="text-[10px] px-1.5 py-0.5 rounded bg-white/40 dark:bg-white/10 text-fg-muted dark:text-fg-dark-muted whitespace-nowrap">
                    {ide}
                  </span>
                ))}
              </div>
            ) : (
              <p className="text-[11px] text-fg-muted dark:text-fg-dark-muted">
                在设置中安装到 IDE，即可在对话中调用改写
              </p>
            )}
            <div className="flex items-center gap-1.5">
              <Terminal className="w-3 h-3 text-fg-muted dark:text-fg-dark-muted" />
              <span className="text-[10px] text-fg-muted dark:text-fg-dark-muted whitespace-nowrap">
                快捷键: {config.shortcut || "未设置"}
              </span>
            </div>
          </div>
        </div>

        {/* 最近记录 */}
        {recent.length > 0 && (
          <div className="space-y-2">
            <div className="flex items-center justify-between px-1">
              <div className="flex items-center gap-2">
                <Clock className="w-3.5 h-3.5 text-fg-muted dark:text-fg-dark-muted" />
                <span className="text-xs font-semibold text-fg dark:text-fg-dark whitespace-nowrap">最近</span>
              </div>
              <button
                onClick={() => { if (recent[0]) { loadFromHistory(recent[0]); onNavigate("editor"); } }}
                className="text-[11px] text-primary hover:text-primary-hover cursor-pointer flex items-center gap-1 whitespace-nowrap"
              >
                查看全部 <ArrowRight className="w-3 h-3" />
              </button>
            </div>
            <div className="space-y-1.5">
              {recent.map((item) => (
                <button
                  key={item.id}
                  onClick={() => { loadFromHistory(item); onNavigate("editor"); }}
                  className="w-full glass-card px-4 py-2.5 text-left cursor-pointer hover:shadow-glass-hover transition-all duration-200 flex items-center gap-3 group"
                >
                  <div className="w-8 h-8 rounded-lg bg-primary/5 dark:bg-primary/10 flex items-center justify-center shrink-0">
                    <Wand2 className="w-3.5 h-3.5 text-primary/60" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <span className="text-xs text-fg dark:text-fg-dark truncate block">
                      {item.original.slice(0, 60)}
                    </span>
                    <span className="text-[10px] text-fg-muted dark:text-fg-dark-muted whitespace-nowrap">
                      {new Date(item.created_at).toLocaleString("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                      {" · "}
                      {item.engine.replace("cli-passthrough", "cli")}
                      {item.target_cli ? `·${item.target_cli}` : ""}
                    </span>
                  </div>
                  <ArrowRight className="w-3.5 h-3.5 text-fg-muted opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
                </button>
              ))}
            </div>
          </div>
        )}

        {/* 底部 */}
        <div className="pt-3 text-center">
          <span className="text-[10px] text-fg-muted/40 dark:text-fg-dark-muted/40">
            Prompto v0.1.0 · by ZIJIU522
          </span>
        </div>
      </div>
    </div>
  );
}

function StatBadge({ icon, label, value, color }: { icon: React.ReactNode; label: string; value: number; color?: string }) {
  return (
    <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white/40 dark:bg-white/10">
      <span className={cn("text-fg-muted dark:text-fg-dark-muted", color === "primary" && "text-primary")}>{icon}</span>
      <div className="flex flex-col">
        <span className="text-[10px] text-fg-muted dark:text-fg-dark-muted whitespace-nowrap">{label}</span>
        <span className={cn("text-sm font-bold whitespace-nowrap", color === "primary" ? "text-primary" : "text-fg dark:text-fg-dark")}>{value}</span>
      </div>
    </div>
  );
}

function ActionCard({ icon, title, desc, color, onClick, disabled }: {
  icon: React.ReactNode;
  title: string;
  desc: string;
  color: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  const colorMap: Record<string, string> = {
    primary: "bg-primary/10 text-primary",
    secondary: "bg-secondary/10 text-secondary",
    neutral: "bg-white/40 dark:bg-white/10 text-fg-muted dark:text-fg-dark-muted",
  };
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "glass-card p-4 text-left cursor-pointer hover:shadow-glass-hover transition-all duration-200 group",
        "disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:shadow-none",
      )}
    >
      <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center mb-3", colorMap[color])}>
        {icon}
      </div>
      <div className="text-sm font-semibold text-fg dark:text-fg-dark whitespace-nowrap">{title}</div>
      <div className="text-[11px] text-fg-muted dark:text-fg-dark-muted mt-0.5 whitespace-nowrap">{desc}</div>
    </button>
  );
}
