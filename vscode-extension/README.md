# Prompto - IDE 提示词改写插件

在 IDE 侧边栏中改写提示词，自动推送到 AI 聊天窗口执行。支持 VS Code / Kiro / Cursor / Windsurf。

## 核心能力

- 侧边栏聊天窗口，输入提示词按 Enter 即改写
- 改写完成后自动推送到 IDE 的 AI 聊天（通过 MCP 通道）
- 选中编辑器文本右键一键改写
- 三种引擎可切换：CLI 透传 / 自定义 API / 本地规则
- 真实模型列表（从 Claude、Codex、Kiro CLI 缓存动态读取）
- MCP 多路通道，按项目路由改写结果
- 首次使用三步引导

## 安装

### 从 VSIX 安装

```bash
code --install-extension prompto-0.3.0.vsix
# 或
kiro --install-extension prompto-0.3.0.vsix
```

也可以在编辑器中：`Ctrl+Shift+P` → "从 VSIX 安装"。

### 从源码构建

```bash
cd vscode-extension
npm install
cd webview && npm install && cd ..
npm run build
npm run package
```

## 界面说明

插件在侧边栏注册了两个面板：

### 配置面板（上半部分）

包含"状态"和"设置"两个视图：

**状态视图**：显示当前引擎、CLI 安装状态、MCP 连接状态、改写统计。

**设置视图**（6 个 Tab）：

| Tab | 内容 |
|-----|------|
| 通用 | 引擎选择、目标 CLI、主题、快捷键、剪贴板监听 |
| CLI | CLI 安装状态、命令配置、模型选择（下拉 + 刷新）、推理强度 |
| API | Base URL、API Key、模型、Temperature、流式输出 |
| 规则 | 8 条可独立开关的文本处理规则 + 压缩阈值 |
| 提示词 | 自定义系统提示词（覆盖默认改写指令） |
| 通道 | MCP 多路通道配置，自动检测工作区或手动添加 |

### 改写对话（下半部分）

聊天式交互：

1. 输入原始提示词
2. 按 Enter 发送改写
3. 结果显示在对话中
4. 自动推送到 IDE 聊天 + 写入 MCP 通道
5. 每条结果旁有"复制"和"发送到聊天"按钮

## 命令

| 命令 | 快捷键 | 说明 |
|------|--------|------|
| `Prompto: 改写选中内容` | `⌘+Shift+R` | 改写编辑器中选中的文本 |
| `Prompto: 改写到聊天窗口` | — | 将选中文本发送到 Prompto 聊天面板 |
| `Prompto: 聚焦聊天窗口` | `⌘+Shift+L` | 聚焦到 Prompto 聊天面板 |
| `Prompto: 打开面板` | — | 聚焦配置面板 |
| `Prompto: 分析当前项目` | — | 分析工作区项目信息 |

## VS Code 设置项

所有设置项都可以在 VS Code 设置中配置（`Ctrl+,` 搜索 `prompto`）：

### 通用

| 设置 | 默认值 | 说明 |
|------|--------|------|
| `prompto.engine` | 空（用客户端配置） | 改写引擎 |
| `prompto.targetCli` | 空 | CLI 透传目标 |
| `prompto.theme` | system | 界面主题 |
| `prompto.shortcut` | CmdOrCtrl+Shift+P | 全局快捷键 |
| `prompto.clipboardWatch` | false | 剪贴板监听 |
| `prompto.systemPrompt` | 空 | 自定义系统提示词 |
| `prompto.replaceSelection` | false | 改写后直接替换选中内容 |

### 自定义 API

| 设置 | 默认值 | 说明 |
|------|--------|------|
| `prompto.customApi.baseUrl` | 空 | API Base URL |
| `prompto.customApi.apiKey` | 空 | API Key |
| `prompto.customApi.model` | gpt-4o-mini | 模型名 |
| `prompto.customApi.temperature` | 0.3 | 温度参数 |
| `prompto.customApi.stream` | false | 流式输出 |

### 规则

| 设置 | 默认值 | 说明 |
|------|--------|------|
| `prompto.rules.trimWhitespace` | true | 去除首尾空白 |
| `prompto.rules.collapseBlankLines` | true | 合并空行 |
| `prompto.rules.protectCodeBlocks` | true | 保护代码块 |
| `prompto.rules.removeFillerWords` | true | 去除填充词 |
| `prompto.rules.structureTemplate` | true | 结构化模板 |
| `prompto.rules.normalizePunctuation` | true | 标点规范化 |
| `prompto.rules.requireActionVerb` | true | 要求动词开头 |
| `prompto.rules.compressIfTooLong` | true | 超长压缩 |
| `prompto.rules.compressThreshold` | 500 | 压缩阈值（字符数） |

### CLI 模板

每个 CLI（codex / claude / kiro）都可以单独配置：

| 设置 | 说明 |
|------|------|
| `prompto.cliTemplates.<cli>.command` | CLI 命令 |
| `prompto.cliTemplates.<cli>.model` | 使用的模型 |
| `prompto.cliTemplates.<cli>.modelFlag` | 模型参数标志 |
| `prompto.cliTemplates.<cli>.reasoningEffort` | 推理强度 |

## MCP 通道

### 工作原理

```
插件改写完成 → 写入消息队列 → MCP Server 读取 → IDE AI 助手获取
                (按通道路由)     (按通道过滤)
```

### 配置通道

在设置 → 通道 Tab 中：

- **自动检测**：点击按钮自动获取当前 IDE 打开的工作区目录
- **手动添加**：填入通道名称和项目目录路径
- **启用/禁用**：控制哪些通道接收改写结果

### IDE 端使用

配置好 MCP Server 后，在 IDE 的 AI 聊天中：

```
用 prompto 的 watch_optimizations 工具监听改写结果
```

AI 助手会阻塞等待（最长 30 秒），当你在插件中完成改写后结果立即返回。

按项目过滤：

```
用 prompto 的 get_pending_results 工具获取结果，channel 参数填 "/Users/xxx/my-project"
```

### MCP 配置示例

```json
{
  "mcpServers": {
    "prompto": {
      "command": "node",
      "args": ["/path/to/prompto/mcp-server/dist/index.js"],
      "autoApprove": [
        "optimize_prompt",
        "get_latest_optimization",
        "watch_optimizations",
        "get_pending_results"
      ]
    }
  }
}
```

## 模型获取

插件从以下位置动态读取真实模型列表：

| CLI | 数据来源 |
|-----|---------|
| Claude | `~/.claude/cache/gateway-models.json` |
| Codex | `~/.codex/models_cache.json` |
| Kiro | `kiro-cli chat --list-models` 命令输出 |

如果缓存文件不存在，使用内置的 fallback 列表。点击模型旁的刷新按钮可重新加载。

## 配置文件

插件读写的配置文件位于 `~/Library/Application Support/prompto/`：

| 文件 | 说明 |
|------|------|
| `config.json` | 所有配置（引擎、CLI、API、规则、通道） |
| `history.json` | 改写历史记录 |
| `mcp-queue/` | MCP 消息队列目录 |
| `.setup-done` | 引导完成标记 |

VS Code 设置中的非默认值会覆盖文件配置（优先级：VS Code 设置 > 文件配置 > 默认值）。

## 开发

```bash
# 构建扩展
npm run build:ext

# 构建 WebView
npm run build:webview

# 完整构建
npm run build

# 监听模式（扩展）
npm run watch:ext

# 开发模式（WebView）
npm run dev:webview

# 打包 VSIX
npm run package
```

## 作者

ZIJIU522
