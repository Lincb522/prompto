# Prompto MCP Server

让 IDE（Kiro / Cursor / VS Code 等）直接调用 Prompto 的提示词优化能力。

## 工具

| 工具名 | 说明 |
|--------|------|
| `optimize_prompt` | 接收原始提示词，返回优化后的版本 |
| `list_engines` | 列出当前引擎配置和 CLI 状态 |

## 配置

在 IDE 的 MCP 配置文件中添加：

### Kiro

编辑 `.kiro/settings/mcp.json`：

```json
{
  "mcpServers": {
    "prompto": {
      "command": "node",
      "args": ["/Users/linchengbo/未命名文件夹 9/prompto/mcp-server/dist/index.js"],
      "disabled": false,
      "autoApprove": ["optimize_prompt", "list_engines"]
    }
  }
}
```

### Cursor / VS Code

编辑 `.cursor/mcp.json` 或对应配置：

```json
{
  "mcpServers": {
    "prompto": {
      "command": "node",
      "args": ["/Users/linchengbo/未命名文件夹 9/prompto/mcp-server/dist/index.js"]
    }
  }
}
```

## 使用

配置后，在 IDE 的 AI 对话中可以直接说：

> 用 prompto 优化这段提示词：帮我写个登录页面

IDE 会自动调用 `optimize_prompt` 工具并返回优化后的版本。
