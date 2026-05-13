<p align="center">
  <img src="https://raw.githubusercontent.com/Lincb522/prompto/main/docs/icon.png" width="120" alt="Prompto" />
</p>

<h1 align="center">Prompto</h1>

<p align="center">
  Turn rough prompts into precise AI instructions.
</p>

<p align="center">
  <a href="#features">Features</a> •
  <a href="#installation">Install</a> •
  <a href="#usage">Usage</a> •
  <a href="./README.md">中文</a>
</p>

---

## What is this

Prompto is a prompt rewriting tool that transforms casual prompts into well-structured, context-rich instructions that AI assistants can execute precisely.

Three rewriting engines:

- **CLI Passthrough** — Reuses your existing `claude` / `codex` CLI login, no extra API key needed
- **Custom API** — Connect any OpenAI-compatible endpoint
- **Local Rules** — Fully offline, 8 composable text processing rules

Two interfaces:

- **Desktop App** (Tauri) — Standalone window with global hotkey
- **VS Code / Kiro Extension** — Sidebar panel + right-click rewrite

## Features

| Capability | Description |
|-----------|-------------|
| Multi-engine | CLI passthrough / Custom API / Local rules, switch instantly |
| CLI Detection | Auto-detects claude, codex, kiro installation on startup |
| Streaming | Token-by-token output in API mode |
| History | Auto-saved with pin and search support |
| Global Hotkey | Summon window and read clipboard with one keystroke |
| MCP Server | Expose as MCP Server for other AI tools |
| Setup Wizard | Three-step guided setup in the extension |
| Custom System Prompt | Override the default rewriting instructions |

## Installation

### VS Code / Kiro Extension

Download [prompto-0.3.0.vsix](https://github.com/Lincb522/prompto/releases/latest) then:

```
code --install-extension prompto-0.3.0.vsix
```

Or in the editor: `Ctrl+Shift+P` → "Install from VSIX".

### Desktop App

```bash
git clone https://github.com/Lincb522/prompto.git
cd prompto
npm install
npm run tauri dev
```

Production build:

```bash
npm run tauri build
```

### MCP Server

Add to your IDE's MCP configuration:

```json
{
  "mcpServers": {
    "prompto": {
      "command": "node",
      "args": ["<project-path>/mcp-server/dist/index.js"]
    }
  }
}
```

## Usage

### Extension

1. Open the Prompto sidebar panel
2. Type a prompt in the chat window, press Enter to rewrite
3. Or select text in the editor, right-click → "Prompto: Rewrite Selection"

Shortcuts:
- `⌘+Shift+R` — Rewrite selection
- `⌘+Shift+L` — Focus chat window

### Desktop

1. Select engine (top dropdown)
2. Paste your prompt
3. `⌘+Enter` to rewrite
4. One-click copy the result

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Desktop | Tauri 2 · Rust · tokio |
| Frontend | React 19 · TypeScript · Tailwind CSS · Zustand |
| Extension | VS Code Extension API · esbuild |
| MCP | Node.js · @modelcontextprotocol/sdk |

## Project Structure

```
prompto/
├── src/                  # Desktop frontend (React)
├── src-tauri/            # Desktop backend (Rust)
├── vscode-extension/     # VS Code / Kiro extension
│   ├── src/              # Extension Host
│   └── webview/          # Extension WebView UI
└── mcp-server/           # MCP Server
```

## Configuration

Config is stored at `~/Library/Application Support/prompto/` (macOS):

- `config.json` — Engine, CLI templates, API config, rule toggles
- `history.json` — Rewrite history

## License

MIT

