<p align="center">
  <img src="https://raw.githubusercontent.com/Lincb522/prompto/main/docs/icon.png" width="120" alt="Prompto" />
</p>

<h1 align="center">Prompto</h1>

<p align="center">
  把粗糙的提示词变成 AI 能精准执行的指令。<br/>
  桌面客户端 + IDE 插件 + MCP Server，三端联动。
</p>

<p align="center">
  <a href="#功能">功能</a> •
  <a href="#安装">安装</a> •
  <a href="#mcp-通道">MCP 通道</a> •
  <a href="#使用方式">使用</a> •
  <a href="./README_EN.md">English</a>
</p>

---

## 这是什么

Prompto 是一个提示词改写工具。你在插件里写一句"帮我做个登录页"，它帮你改写成结构清晰、上下文完整的版本，然后自动推送到 IDE 的 AI 聊天窗口执行。

三种改写引擎：

- **CLI 透传** — 复用已登录的 `claude` / `codex` / `kiro-cli`，不需要额外 API Key
- **自定义 API** — 接入任意 OpenAI 兼容端点
- **本地规则** — 纯离线，8 条可组合的文本处理规则

三种使用方式：

- **桌面客户端**（Tauri）— 独立窗口，全局快捷键呼出
- **IDE 插件** — 侧边栏面板 + 右键改写 + 自动推送到聊天
- **MCP Server** — 让 AI 助手直接调用改写工具，支持常驻监听

## 功能

| 能力 | 说明 |
|------|------|
| 多引擎切换 | CLI 透传 / 自定义 API / 本地规则 |
| 真实模型列表 | 从 CLI 缓存动态读取（Claude / Codex / Kiro） |
| MCP 多路通道 | 按项目路由改写结果，多个 IDE 各取所需 |
| 常驻监听 | `watch_optimizations` 工具阻塞等待新结果 |
| 自动推送 | 改写完成后自动发送到 IDE 聊天窗口 |
| 首次引导 | 三步向导：MCP 安装 → CLI 配置 → 模型选择 |
| 历史记录 | 自动保存，支持置顶和搜索 |
| 全局快捷键 | 按下即呼出窗口并读取剪贴板 |

## 安装

### IDE 插件（VS Code / Kiro / Cursor）

下载 [prompto-0.3.0.vsix](https://github.com/Lincb522/prompto/releases/latest)：

```bash
code --install-extension prompto-0.3.0.vsix
# 或
kiro --install-extension prompto-0.3.0.vsix
```

### MCP Server

在 IDE 的 MCP 配置中添加（`~/.kiro/settings/mcp.json`）：

```json
{
  "mcpServers": {
    "prompto": {
      "command": "node",
      "args": ["<项目路径>/mcp-server/dist/index.js"],
      "autoApprove": [
        "optimize_prompt",
        "get_latest_optimization",
        "watch_optimizations"
      ]
    }
  }
}
```

### 桌面客户端

```bash
git clone https://github.com/Lincb522/prompto.git
cd prompto && npm install
npm run tauri dev
```

## MCP 通道

Prompto 的核心设计：插件改写完成后，结果通过 MCP 通道推送到 IDE 的 AI 助手。

### 配置通道

在插件侧边栏 → 设置 → 通道 Tab：

1. 点击"自动检测"获取当前工作区
2. 或手动添加，填入项目名称和目录路径
3. 启用/禁用通道控制推送范围

### IDE 端使用

在 IDE 的 AI 聊天中，你可以这样用：

```
用 prompto 的 watch_optimizations 工具等待我的改写结果
```

AI 助手会调用 `watch_optimizations`，阻塞等待最多 30 秒。当你在插件中完成改写后，结果会立即返回。

也可以主动获取：

```
用 prompto 的 get_latest_optimization 获取最新的改写结果
```

### MCP 工具列表

| 工具 | 说明 |
|------|------|
| `optimize_prompt` | 直接改写提示词（结合项目上下文） |
| `analyze_project` | 分析项目技术栈和结构 |
| `get_project_context` | 查看已缓存的项目摘要 |
| `get_pending_results` | 获取所有待处理的改写结果 |
| `get_latest_optimization` | 获取最新一条改写结果 |
| `watch_optimizations` | 阻塞等待下一条改写结果（常驻监听） |
| `list_engines` | 查看引擎配置 |

### 多路通道工作流

```
┌─────────────┐     写入队列      ┌──────────────┐
│  Prompto    │ ──────────────→  │  消息队列     │
│  插件改写   │   按通道路由      │  (文件系统)   │
└─────────────┘                  └──────┬───────┘
                                        │
                    ┌───────────────────┼───────────────────┐
                    ▼                   ▼                   ▼
            ┌──────────────┐   ┌──────────────┐   ┌──────────────┐
            │  IDE-A (Kiro) │   │  IDE-B (Cursor)│   │  IDE-C (VS Code)│
            │  项目 A 通道  │   │  项目 B 通道  │   │  全局通道     │
            └──────────────┘   └──────────────┘   └──────────────┘
```

## 使用方式

### 插件端

1. 打开侧边栏 Prompto 面板
2. 在聊天窗口输入提示词，按 Enter 改写
3. 改写完成后自动推送到 IDE 聊天 + 写入 MCP 通道
4. 或选中编辑器文本，右键 → "Prompto: 改写选中内容"

快捷键：
- `⌘+Shift+R` — 改写选中
- `⌘+Shift+L` — 聚焦聊天窗口

### 桌面端

1. 选择引擎（顶部下拉）
2. 粘贴提示词
3. `⌘+Enter` 执行改写
4. 结果一键复制

## 技术栈

| 层 | 技术 |
|----|------|
| 桌面端 | Tauri 2 · Rust · tokio |
| 前端 | React 19 · TypeScript · Tailwind CSS · Zustand |
| 插件 | VS Code Extension API · esbuild |
| MCP | Node.js · @modelcontextprotocol/sdk |
| 通信 | 文件系统消息队列 · 多路通道路由 |

## 项目结构

```
prompto/
├── src/                  # 桌面端前端
├── src-tauri/            # 桌面端后端（Rust）
├── vscode-extension/     # IDE 插件
│   ├── src/              # Extension Host
│   └── webview/          # 插件 WebView UI
└── mcp-server/           # MCP Server（通道 + 改写）
```

## 配置

配置存储在 `~/Library/Application Support/prompto/`：

- `config.json` — 引擎、CLI 模板、API、规则、MCP 通道
- `history.json` — 改写历史
- `mcp-queue/` — MCP 消息队列（按通道分目录）

## 许可

MIT
