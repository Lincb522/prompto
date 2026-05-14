// VS Code WebView API 封装
// 在 WebView 中通过 postMessage 与 Extension Host 通信

const vscode = acquireVsCodeApi();

type MessageHandler = (payload: unknown) => void;
const listeners = new Map<string, Set<MessageHandler>>();
const pendingCallbacks = new Map<string, (payload: unknown) => void>();

// 监听来自 Extension Host 的消息
window.addEventListener("message", (event) => {
  const { type, payload } = event.data;

  // 优先检查 pending callbacks（带 requestId 的一次性回调）
  if (pendingCallbacks.has(type)) {
    const cb = pendingCallbacks.get(type)!;
    pendingCallbacks.delete(type);
    cb(payload);
    return;
  }

  // 持久监听器
  const handlers = listeners.get(type);
  if (handlers) {
    handlers.forEach((h) => h(payload));
  }
});

export function postMessage(type: string, payload?: unknown) {
  vscode.postMessage({ type, payload });
}

export function onMessage(type: string, handler: MessageHandler): () => void {
  if (!listeners.has(type)) {
    listeners.set(type, new Set());
  }
  listeners.get(type)!.add(handler);
  return () => {
    listeners.get(type)?.delete(handler);
  };
}

// 发送请求并等待响应（先注册回调再发消息）
function request<T = unknown>(sendType: string, sendPayload: unknown, responseType: string, timeout = 30000): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      pendingCallbacks.delete(responseType);
      reject(new Error(`请求 ${sendType} 超时`));
    }, timeout);

    pendingCallbacks.set(responseType, (payload) => {
      clearTimeout(timer);
      resolve(payload as T);
    });

    postMessage(sendType, sendPayload);
  });
}

// 带唯一 ID 的请求（避免多次调用冲突）
function requestWithId<T = unknown>(sendType: string, payload: Record<string, unknown>, responsePrefix: string, timeout = 30000): Promise<T> {
  const requestId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const fullPayload = { ...payload, requestId };
  const responseType = `${responsePrefix}:${requestId}`;
  return request<T>(sendType, fullPayload, responseType, timeout);
}

// 便捷 API
export const api = {
  getConfig: () => request("getConfig", undefined, "configLoaded"),
  updateConfig: (config: unknown) => request("updateConfig", config, "configLoaded"),
  getHistory: () => request("getHistory", undefined, "historyLoaded"),
  deleteHistoryItem: (id: string) => request("deleteHistoryItem", { id }, "historyLoaded"),
  togglePin: (id: string) => request("togglePin", { id }, "historyLoaded"),
  clearAllHistory: () => request("clearAllHistory", undefined, "historyLoaded"),
  detectClis: () => request("detectClis", undefined, "clisDetected"),
  listModels: (cli: string) => requestWithId<unknown>("listModels", { cli }, "modelsLoaded"),
  optimize: (input: string, requestId: string) => {
    return new Promise<unknown>((resolve, reject) => {
      const timer = setTimeout(() => {
        pendingCallbacks.delete("optimizeResult");
        pendingCallbacks.delete("optimizeError");
        reject(new Error("改写超时"));
      }, 180000);

      pendingCallbacks.set("optimizeResult", (payload) => {
        clearTimeout(timer);
        pendingCallbacks.delete("optimizeError");
        resolve(payload);
      });
      pendingCallbacks.set("optimizeError", (payload: any) => {
        clearTimeout(timer);
        pendingCallbacks.delete("optimizeResult");
        reject(new Error(payload?.error || "改写失败"));
      });

      postMessage("optimize", { input, requestId });
    });
  },
  checkMcpStatus: () => request("checkMcpStatus", undefined, "mcpStatusLoaded"),
  getDefaultSystemPrompt: () => request<string>("getDefaultSystemPrompt", undefined, "defaultSystemPrompt"),
  openConfigDir: () => postMessage("openConfigDir"),
  copyToClipboard: (text: string) => request("copyToClipboard", { text }, "clipboardCopied"),
  readClipboard: () => request<string>("readClipboard", undefined, "clipboardContent"),
  installCli: (cli: string) => request<{ cli: string; success: boolean; error?: string }>("installCli", { cli }, "cliInstallResult", 120000),
  installMcp: (ide: string) => request<{ ide: string; success: boolean; error?: string }>("installMcp", { ide }, "mcpInstallResult"),
  getSetupStatus: () => request("getSetupStatus", undefined, "setupStatus"),
  markSetupDone: () => request("markSetupDone", undefined, "setupMarked"),
  sendToChat: (text: string) => request("sendToChat", { text }, "sentToChat"),
  getWorkspaceFolders: () => requestWithId<{ name: string; path: string }[]>("getWorkspaceFolders", {}, "workspaceFolders", 5000),
};
