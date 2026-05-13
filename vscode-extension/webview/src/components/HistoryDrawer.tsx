import { useEffect } from "react";
import { X, Pin, Trash2, ArrowUpRight } from "lucide-react";
import { cn } from "@/lib/cn";
import { useAppStore } from "@/store/app-store";

interface HistoryDrawerProps {
  open: boolean;
  onClose: () => void;
}

export function HistoryDrawer({ open, onClose }: HistoryDrawerProps) {
  const history = useAppStore((s) => s.history);
  const refreshHistory = useAppStore((s) => s.refreshHistory);
  const deleteHistoryItem = useAppStore((s) => s.deleteHistoryItem);
  const togglePin = useAppStore((s) => s.togglePin);
  const loadFromHistory = useAppStore((s) => s.loadFromHistory);
  const clearAllHistory = useAppStore((s) => s.clearAllHistory);

  useEffect(() => {
    if (open) refreshHistory();
  }, [open, refreshHistory]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape" && open) onClose();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open, onClose]);

  if (!open) return null;

  const pinned = history.filter((h) => h.pinned);
  const unpinned = history.filter((h) => !h.pinned);

  return (
    <>
      {/* 遮罩 */}
      <div
        className="fixed inset-0 bg-black/20 dark:bg-black/40 z-40 animate-fade-in"
        onClick={onClose}
      />

      {/* 抽屉 */}
      <aside
        className={cn(
          "fixed top-0 right-0 bottom-0 w-[340px] max-w-[85vw] z-50",
          "glass-card rounded-none rounded-l-lg",
          "flex flex-col animate-slide-in-right"
        )}
      >
        {/* 头部 */}
        <div className="flex items-center justify-between px-4 h-12 border-b border-white/20 dark:border-white/10 shrink-0">
          <span className="text-sm font-semibold">记录</span>
          <div className="flex items-center gap-1">
            {history.length > 0 && (
              <button
                type="button"
                onClick={() => void clearAllHistory()}
                className="btn-ghost !px-2 !py-1 !text-xs text-red-500 hover:text-red-600"
              >
                <Trash2 className="w-3 h-3" />
                <span>清空</span>
              </button>
            )}
            <button type="button" onClick={onClose} className="btn-icon">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* 列表 */}
        <div className="flex-1 overflow-y-auto p-3 space-y-2">
          {history.length === 0 && (
            <p className="text-sm text-fg-muted dark:text-fg-dark-muted text-center py-8">
              暂无记录
            </p>
          )}

          {pinned.length > 0 && (
            <>
              <p className="text-xs font-medium text-fg-muted dark:text-fg-dark-muted px-1">已固定</p>
              {pinned.map((item) => (
                <HistoryCard
                  key={item.id}
                  item={item}
                  onLoad={() => { loadFromHistory(item); onClose(); }}
                  onDelete={() => void deleteHistoryItem(item.id)}
                  onTogglePin={() => void togglePin(item.id)}
                />
              ))}
            </>
          )}

          {unpinned.length > 0 && pinned.length > 0 && (
            <p className="text-xs font-medium text-fg-muted dark:text-fg-dark-muted px-1 pt-2">全部</p>
          )}
          {unpinned.map((item) => (
            <HistoryCard
              key={item.id}
              item={item}
              onLoad={() => { loadFromHistory(item); onClose(); }}
              onDelete={() => void deleteHistoryItem(item.id)}
              onTogglePin={() => void togglePin(item.id)}
            />
          ))}
        </div>
      </aside>
    </>
  );
}

function HistoryCard({
  item,
  onLoad,
  onDelete,
  onTogglePin,
}: {
  item: { id: string; original: string; optimized: string; created_at: number; engine: string; pinned?: boolean };
  onLoad: () => void;
  onDelete: () => void;
  onTogglePin: () => void;
}) {
  const formatTime = (ts: number) => {
    const d = new Date(ts);
    return d.toLocaleString("zh-CN", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  return (
    <div className="group rounded-lg border border-white/20 dark:border-white/10 p-3 hover:border-primary/30 dark:hover:border-primary-light/30 transition-colors duration-200 cursor-pointer">
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm line-clamp-2 flex-1 min-w-0" onClick={onLoad}>
          {item.original}
        </p>
        <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
          <button
            type="button"
            onClick={onTogglePin}
            className={cn("btn-icon !w-6 !h-6", item.pinned && "text-primary dark:text-primary-light")}
            title={item.pinned ? "取消固定" : "固定"}
          >
            <Pin className="w-3 h-3" />
          </button>
          <button type="button" onClick={onLoad} className="btn-icon !w-6 !h-6" title="加载">
            <ArrowUpRight className="w-3 h-3" />
          </button>
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onDelete(); }}
            className="btn-icon !w-6 !h-6 hover:text-red-500"
            title="删除"
          >
            <Trash2 className="w-3 h-3" />
          </button>
        </div>
      </div>
      <div className="flex items-center gap-2 mt-2">
        <span className="text-[10px] text-fg-muted dark:text-fg-dark-muted">
          {formatTime(item.created_at)}
        </span>
        <span className="text-[10px] px-1.5 py-0.5 rounded bg-primary/10 text-primary dark:text-primary-light">
          {item.engine}
        </span>
      </div>
    </div>
  );
}
