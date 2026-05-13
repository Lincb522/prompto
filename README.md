<p align="center">
  <img src="https://raw.githubusercontent.com/Lincb522/prompto/main/docs/icon.png" width="120" alt="Prompto" />
</p>

<h1 align="center">Prompto</h1>

<p align="center">
  把粗糙的提示词变成 AI 能精准执行的指令。<br/>
  Turn rough prompts into precise AI instructions.
</p>

<p align="center">
  <a href="#功能">功能</a> •
  <a href="#安装">安装</a> •
  <a href="#使用方式">使用</a> •
  <a href="./README_EN.md">English</a>
</p>

---

## 这是什么

Prompto 是一个提示词改写工具，帮你把随手写的 prompt 优化成结构清晰、上下文完整的版本。

支持三种改写引擎：

- **CLI 透传** — 复用已登录的 `claude` / `codex` CLI，不需要额外配置 API Key
- **自定义 API** — 接入任意 OpenAI 兼容端点
- **本地规则** — 纯离线，8 条可组合的文本处理规则

提供两种使用方式：

- **桌面客户端**（Tauri）— 独立窗口，全局快捷键呼出
- **VS Code / Kiro 插件** — 侧边栏面板 + 右键改写选中内容

## 功能

| 能力 | 说明 |
|------|------|
| 多引擎切换 | CLI 透传 / 自定义 API / 本地规则，一键切换 |
| CLI 自动检测 | 启动时探测 claude、codex、kiro 的安装状态 |
| 流式输出 | API 模式下逐字显示结果 |
| 历史记录 | 自动保存，支持置顶和搜索 |
| 全局快捷键 | 按下即呼出窗口并读取剪贴板 |
| MCP 服务 | 作为 MCP Server 供其他 AI 工具调用 |
| 首次引导 | 插件端三步引导完成配置 |
| 自定义系统提示词 | 可覆盖默认改写指令 |

## 安装

### VS Code / Kiro 插件

下载 [prompto-0.3.0.vsix](https://github.com/Lincb522/prompto/releases/latest) 后：

```
code --install-extension prompto-0.3.0.vsix
```

或在编辑器中：`Ctrl+Shift+P` → "从 VSIX 安装"。

### 桌面客户端

```bash
git clone https://github.com/Lincb522/prompto.git
cd prompto
npm install
npm run tauri dev
```

生产构建：

```bash
npm run tauri build
```

### MCP Server

在你的 IDE 的 MCP 配置中添加：

```json
{
  "mcpServers": {
    "prompto": {
      "command": "node",
      "args": ["<项目路径>/mcp-server/dist/index.js"]
    }
  }
}
```

## 使用方式

### 插件

1. 打开侧边栏 Prompto 面板
2. 在聊天窗口输入提示词，按 Enter 改写
3. 或选中编辑器中的文本，右键 → "Prompto: 改写选中内容"

快捷键：
- `⌘+Shift+R` — 改写选中
- `⌘+Shift+L` — 聚焦聊天窗口

### 桌面端

1. 选择引擎（顶部下拉）
2. 粘贴提示词到输入区
3. `⌘+Enter` 执行改写
4. 结果一键复制

## 技术栈

| 层 | 技术 |
|----|------|
| 桌面端 | Tauri 2 · Rust · tokio |
| 前端 | React 19 · TypeScript · Tailwind CSS · Zustand |
| 插件 | VS Code Extension API · esbuild |
| MCP | Node.js · @modelcontextprotocol/sdk |

## 项目结构

```
prompto/
├── src/                  # 桌面端前端（React）
├── src-tauri/            # 桌面端后端（Rust）
├── vscode-extension/     # VS Code / Kiro 插件
│   ├── src/              # Extension Host
│   └── webview/          # 插件 WebView UI
└── mcp-server/           # MCP Server
```

## 配置文件

配置存储在 `~/Library/Application Support/prompto/`（macOS）：

- `config.json` — 引擎、CLI 模板、API 配置、规则开关
- `history.json` — 改写历史

## 许可

MIT

