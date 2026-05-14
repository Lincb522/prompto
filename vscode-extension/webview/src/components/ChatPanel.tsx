import { useState, useRef, useEffect, useCallback } from "react";
import { Send, Copy, Check, Loader2, Sparkles, RotateCcw, Pin, Trash2, MessageSquareShare } from "lucide-react";
import { cn } from "@/lib/cn";
import { useAppStore, type HistoryItem } from "@/store/app-store";
import { api, onMessage } from "@/lib/vscode-api";

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: number;
}

export function ChatPanel() {
  const config = useAppStore((s) => s.config);
  const history = useAppStore((s) => s.history);
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // 监听来自 extension 的 setInput
  useEffect(() => {
    return onMessage("setInput", (payload) => {
      setInput(payload as string);
      inputRef.current?.focus();
    });
  }, []);

  // 自动滚动到底部
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  // 自动调整 textarea 高度
  const adjustHeight = useCallback(() => {
    const el = inputRef.current;
    if (el) {
      el.style.height = "auto";
      el.style.height = Math.min(el.scrollHeight, 120) + "px";
    }
  }, []);

  useEffect(() => { adjustHeight(); }, [input, adjustHeight]);

  const handleSend = async () => {
    const text = input.trim();
    if (!text || loading) return;

    const userMsg: ChatMessage = {
      id: `${Date.now()}-user`,
      role: "user",
      content: text,
      timestamp: Date.now(),
    };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setLoading(true);

    try {
      const requestId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const result = await api.optimize(text, requestId) as { optimized: string; item: HistoryItem };
      const assistantMsg: ChatMessage = {
        id: `${Date.now()}-assistant`,
        role: "assistant",
        content: result.optimized,
        timestamp: Date.now(),
      };
      setMessages((prev) => [...prev, assistantMsg]);
      // 自动发送到 IDE 聊天窗口
      api.sendToChat(result.optimized).catch(() => {});
    } catch (e: any) {
      const errorMsg: ChatMessage = {
        id: `${Date.now()}-error`,
        role: "assistant",
        content: `❌ 改写失败: ${e?.message ?? "未知错误"}`,
        timestamp: Date.now(),
      };
      setMessages((prev) => [...prev, errorMsg]);
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleCopy = async (text: string, id: string) => {
    await api.copyToClipboard(text);
    setCopied(id);
    setTimeout(() => setCopied(null), 1500);
  };

  const loadFromHistory = (item: HistoryItem) => {
    const userMsg: ChatMessage = { id: `${Date.now()}-user`, role: "user", content: item.original, timestamp: item.created_at };
    const assistantMsg: ChatMessage = { id: `${Date.now()}-assistant`, role: "assistant", content: item.optimized, timestamp: item.created_at };
    setMessages((prev) => [...prev, userMsg, assistantMsg]);
    setShowHistory(false);
  };

  const engineLabel = config?.engine === "cli-passthrough"
    ? `CLI → ${config.target_cli}`
    : config?.engine === "custom-api" ? "API" : "规则";

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* 头部 */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-white/15 dark:border-white/5 shrink-0">
        <div className="flex items-center gap-2">
          <Sparkles className="w-3.5 h-3.5 text-primary" />
          <span className="text-[11px] font-semibold text-fg dark:text-fg-dark">改写对话</span>
          <span className="text-[9px] px-1.5 py-0.5 rounded bg-primary/10 text-primary">{engineLabel}</span>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setShowHistory(!showHistory)}
            className={cn("btn-icon !w-6 !h-6", showHistory && "text-primary")}
            title="历史记录"
          >
            <RotateCcw className="w-3 h-3" />
          </button>
          <button
            onClick={() => setMessages([])}
            className="btn-icon !w-6 !h-6"
            title="清空对话"
            disabled={messages.length === 0}
          >
            <Trash2 className="w-3 h-3" />
          </button>
        </div>
      </div>

      {/* 历史记录面板 */}
      {showHistory && (
        <HistoryPanel
          history={history}
          onLoad={loadFromHistory}
          onClose={() => setShowHistory(false)}
        />
      )}

      {/* 消息列表 */}
      {!showHistory && (
        <div className="flex-1 overflow-y-auto p-3 space-y-3">
          {messages.length === 0 && (
            <div className="h-full flex flex-col items-center justify-center gap-2 text-fg-muted/40 dark:text-fg-dark-muted/40">
              <Sparkles className="w-8 h-8" />
              <span className="text-xs text-center">输入提示词，按 Enter 改写</span>
              <span className="text-[10px] text-center">Shift+Enter 换行</span>
            </div>
          )}

          {messages.map((msg) => (
            <div key={msg.id} className={cn("flex flex-col gap-1", msg.role === "user" ? "items-end" : "items-start")}>
              <div className={cn(
                "max-w-[90%] rounded-lg px-3 py-2 text-[12px] leading-relaxed",
                msg.role === "user"
                  ? "bg-primary/10 text-fg dark:text-fg-dark"
                  : "glass-card !rounded-lg"
              )}>
                <pre className="whitespace-pre-wrap break-words font-mono text-[11px]">{msg.content}</pre>
              </div>
              {msg.role === "assistant" && !msg.content.startsWith("❌") && (
                <div className="flex items-center gap-2 px-1">
                  <button
                    onClick={() => void handleCopy(msg.content, msg.id)}
                    className="text-[10px] text-fg-muted dark:text-fg-dark-muted hover:text-primary cursor-pointer flex items-center gap-1"
                  >
                    {copied === msg.id ? <Check className="w-2.5 h-2.5 text-primary" /> : <Copy className="w-2.5 h-2.5" />}
                    {copied === msg.id ? "已复制" : "复制"}
                  </button>
                  <button
                    onClick={() => void api.sendToChat(msg.content)}
                    className="text-[10px] text-fg-muted dark:text-fg-dark-muted hover:text-primary cursor-pointer flex items-center gap-1"
                  >
                    <MessageSquareShare className="w-2.5 h-2.5" />
                    发送到聊天
                  </button>
                </div>
              )}
            </div>
          ))}

          {loading && (
            <div className="flex items-center gap-2 text-fg-muted dark:text-fg-dark-muted">
              <Loader2 className="w-3.5 h-3.5 animate-spin text-primary" />
              <span className="text-[11px]">改写中…</span>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>
      )}

      {/* 输入区 */}
      <div className="border-t border-white/15 dark:border-white/5 p-2 shrink-0">
        <div className="flex items-end gap-2">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="输入提示词，Enter 发送…"
            rows={1}
            className="flex-1 resize-none bg-transparent outline-none text-[12px] font-mono leading-relaxed text-fg dark:text-fg-dark placeholder:text-fg-muted/40 dark:placeholder:text-fg-dark-muted/40 glass-input !py-2 !px-3 min-h-[36px] max-h-[120px]"
            spellCheck={false}
          />
          <button
            onClick={handleSend}
            disabled={!input.trim() || loading}
            className={cn(
              "w-8 h-8 rounded-lg flex items-center justify-center shrink-0 cursor-pointer transition-all",
              input.trim() && !loading
                ? "bg-primary text-white shadow-btn hover:shadow-btn-hover"
                : "bg-white/30 dark:bg-white/10 text-fg-muted dark:text-fg-dark-muted cursor-not-allowed"
            )}
          >
            <Send className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}

// ========== 历史记录面板 ==========

function HistoryPanel({ history, onLoad, onClose }: {
  history: HistoryItem[];
  onLoad: (item: HistoryItem) => void;
  onClose: () => void;
}) {
  const deleteHistoryItem = useAppStore((s) => s.deleteHistoryItem);
  const togglePin = useAppStore((s) => s.togglePin);
  const refreshHistory = useAppStore((s) => s.refreshHistory);

  useEffect(() => { refreshHistory(); }, [refreshHistory]);

  const pinned = history.filter((h) => h.pinned);
  const unpinned = history.filter((h) => !h.pinned);

  return (
    <div className="flex-1 overflow-y-auto p-2 space-y-1.5">
      {history.length === 0 && (
        <p className="text-[11px] text-fg-muted dark:text-fg-dark-muted text-center py-6">暂无记录</p>
      )}

      {pinned.length > 0 && (
        <p className="text-[10px] font-medium text-fg-muted dark:text-fg-dark-muted px-1">已固定</p>
      )}
      {pinned.map((item) => (
        <HistoryCard key={item.id} item={item} onLoad={() => onLoad(item)} onDelete={() => void deleteHistoryItem(item.id)} onTogglePin={() => void togglePin(item.id)} />
      ))}

      {unpinned.length > 0 && pinned.length > 0 && (
        <p className="text-[10px] font-medium text-fg-muted dark:text-fg-dark-muted px-1 pt-1">全部</p>
      )}
      {unpinned.slice(0, 20).map((item) => (
        <HistoryCard key={item.id} item={item} onLoad={() => onLoad(item)} onDelete={() => void deleteHistoryItem(item.id)} onTogglePin={() => void togglePin(item.id)} />
      ))}
    </div>
  );
}

function HistoryCard({ item, onLoad, onDelete, onTogglePin }: {
  item: HistoryItem;
  onLoad: () => void;
  onDelete: () => void;
  onTogglePin: () => void;
}) {
  return (
    <div className="group rounded-md border border-white/15 dark:border-white/5 p-2 hover:border-primary/30 transition-colors cursor-pointer" onClick={onLoad}>
      <p className="text-[11px] line-clamp-2 text-fg dark:text-fg-dark">{item.original}</p>
      <div className="flex items-center justify-between mt-1.5">
        <span className="text-[9px] text-fg-muted dark:text-fg-dark-muted">
          {new Date(item.created_at).toLocaleString("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}
        </span>
        <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
          <button onClick={(e) => { e.stopPropagation(); onTogglePin(); }} className={cn("btn-icon !w-5 !h-5", item.pinned && "text-primary")}>
            <Pin className="w-2.5 h-2.5" />
          </button>
          <button onClick={(e) => { e.stopPropagation(); onDelete(); }} className="btn-icon !w-5 !h-5 hover:text-red-500">
            <Trash2 className="w-2.5 h-2.5" />
          </button>
        </div>
      </div>
    </div>
  );
}
