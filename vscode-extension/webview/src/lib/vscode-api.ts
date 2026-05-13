// VS Code WebView API 封装
// 在 WebView 中通过 postMessage 与 Extension Host 通信

const vscode = acquireVsCodeApi();

type MessageHandler = (payload: unknown) => void;
const listeners = new Map<string, Set<MessageHandler>>();

// 监听来自 Extension Host 的消息
window.addEventListener("message", (event) => {
  const { type, payload } = event.data;
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

// 一次性监听（Promise 化）
export function waitForMessage<T = unknown>(type: string, timeout = 30000): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error(`等待消息 ${type} 超时`));
    }, timeout);

    const cleanup = onMessage(type, (payload) => {
      clearTimeout(timer);
      cleanup();
      resolve(payload as T);
    });
  });
}

// 便捷 API
export const api = {
  getConfig: () => {
    postMessage("getConfig");
    return waitForMessage("configLoaded");
  },
  updateConfig: (config: unknown) => {
    postMessage("updateConfig", config);
    return waitForMessage("configLoaded");
  },
  getHistory: () => {
    postMessage("getHistory");
    return waitForMessage("historyLoaded");
  },
  deleteHistoryItem: (id: string) => {
    postMessage("deleteHistoryItem", { id });
    return waitForMessage("historyLoaded");
  },
  togglePin: (id: string) => {
    postMessage("togglePin", { id });
    return waitForMessage("historyLoaded");
  },
  clearAllHistory: () => {
    postMessage("clearAllHistory");
    return waitForMessage("historyLoaded");
  },
  detectClis: () => {
    postMessage("detectClis");
    return waitForMessage("clisDetected");
  },
  listModels: (cli: string) => {
    postMessage("listModels", { cli });
    return waitForMessage("modelsLoaded");
  },
  optimize: (input: string, requestId: string) => {
    postMessage("optimize", { input, requestId });
    // 返回结果或错误
    return Promise.race([
      waitForMessage("optimizeResult"),
      waitForMessage("optimizeError").then((err: any) => { throw new Error(err.error); }),
    ]);
  },
  checkMcpStatus: () => {
    postMessage("checkMcpStatus");
    return waitForMessage("mcpStatusLoaded");
  },
  getDefaultSystemPrompt: () => {
    postMessage("getDefaultSystemPrompt");
    return waitForMessage<string>("defaultSystemPrompt");
  },
  openConfigDir: () => postMessage("openConfigDir"),
  copyToClipboard: (text: string) => {
    postMessage("copyToClipboard", { text });
    return waitForMessage("clipboardCopied");
  },
  readClipboard: () => {
    postMessage("readClipboard");
    return waitForMessage<string>("clipboardContent");
  },
  installCli: (cli: string) => {
    postMessage("installCli", { cli });
    return waitForMessage<{ cli: string; success: boolean; error?: string }>("cliInstallResult");
  },
  installMcp: (ide: string) => {
    postMessage("installMcp", { ide });
    return waitForMessage<{ ide: string; success: boolean; error?: string }>("mcpInstallResult");
  },
  getSetupStatus: () => {
    postMessage("getSetupStatus");
    return waitForMessage("setupStatus");
  },
  markSetupDone: () => {
    postMessage("markSetupDone");
    return waitForMessage("setupMarked");
  },
};
