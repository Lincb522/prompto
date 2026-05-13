# Prompto - VS Code 扩展

选中文本一键改写为高质量提示词。支持 VS Code / Cursor / Windsurf / Kiro。

## 功能

- **选中文本 → 右键 → "Prompto: 改写选中内容"**
- **快捷键 `Cmd+Shift+R`**（选中文本时）
- **命令面板 `Prompto: 改写选中内容`**
- 状态栏显示 Prompto 图标，点击触发改写
- 支持替换选中内容或在侧栏显示结果

## 引擎

自动读取 Prompto 客户端配置（`~/Library/Application Support/prompto/config.json`），也可以在 VS Code 设置里单独配置：

- `prompto.engine` — cli-passthrough / custom-api / rule-based
- `prompto.targetCli` — claude / codex / kiro
- `prompto.customApi.baseUrl` — API 地址
- `prompto.customApi.apiKey` — API Key
- `prompto.customApi.model` — 模型名
- `prompto.replaceSelection` — 改写后是否直接替换选中内容

## 安装

```bash
cd vscode-extension
npm install
npm run build
```

然后在 VS Code 里：扩展 → ... → 从 VSIX 安装 → 选择打包后的 .vsix 文件。

或者开发模式：按 F5 启动扩展开发宿主。

## 作者

ZIJIU522
