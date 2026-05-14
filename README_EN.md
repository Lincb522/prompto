<p align="center">
  <img src="https://raw.githubusercontent.com/Lincb522/prompto/main/docs/icon.png" width="120" alt="Prompto" />
</p>

<h1 align="center">Prompto</h1>

<p align="center">
  Turn rough prompts into precise AI instructions.<br/>
  Desktop app + IDE extension + MCP Server, working together.
</p>

<p align="center">
  <a href="#features">Features</a> •
  <a href="#installation">Install</a> •
  <a href="#mcp-channels">MCP Channels</a> •
  <a href="#usage">Usage</a> •
  <a href="./README.md">中文</a>
</p>

---

## What is this

Prompto is a prompt rewriting tool. You type "make me a login page" in the extension, it rewrites it into a structured, context-rich instruction, then automatically pushes it to your IDE's AI chat for execution.

Three rewriting engines:

- **CLI Passthrough** — Reuses your logged-in `claude` / `codex` / `kiro-cli`, no extra API key needed
- **Custom API** — Connect any OpenAI-compatible endpoint
- **Local Rules** — Fully offline, 8 composable text processing rules

Three interfaces:

- **Desktop App** (Tauri) — Standalone window with global hotkey
- **IDE Extension** — Sidebar panel + right-click rewrite + auto-push to chat
- **MCP Server** — Let AI assistants call rewrite tools directly, with persistent listening

## Features

| Capability | Description |
|-----------|-------------|
| Multi-engine | CLI passthrough / Custom API / Local rules |
| Real model lists | Dynamically read from CLI caches (Claude / Codex / Kiro) |
| Multi-channel MCP | Route results by project, multiple IDEs each get their own |
| Persistent watch | `watch_optimizations` tool blocks until new results arrive |
| Auto-push | Results automatically sent to IDE chat after rewriting |
| Setup wizard | Three-step guide: MCP install → CLI setup → Model selection |
| History | Auto-saved with pin and search |
| Global hotkey | Summon window and read clipboard with one keystroke |

## Installation

### IDE Extension (VS Code / Kiro / Cursor)

Download [prompto-0.3.0.vsix](https://github.com/Lincb522/prompto/releases/latest):

```bash
code --install-extension prompto-0.3.0.vsix
# or
kiro --install-extension prompto-0.3.0.vsix
```

### MCP Server

Add to your IDE's MCP config (`~/.kiro/settings/mcp.json`):

```json
{
  "mcpServers": {
    "prompto": {
      "command": "node",
      "args": ["<project-path>/mcp-server/dist/index.js"],
      "autoApprove": [
        "optimize_prompt",
        "get_latest_optimization",
        "watch_optimizations"
      ]
    }
  }
}
```

### Desktop App

```bash
git clone https://github.com/Lincb522/prompto.git
cd prompto && npm install
npm run tauri dev
```

## MCP Channels

Core design: after the extension finishes rewriting, results are pushed to the IDE's AI assistant via MCP channels.

### Configure Channels

In the extension sidebar → Settings → Channels tab:

1. Click "Auto Detect" to pick up current workspace
2. Or manually add with project name and directory path
3. Enable/disable channels to control push scope

### IDE Usage

In your IDE's AI chat:

```
Use prompto's watch_optimizations tool to wait for my rewrite results
```

The AI assistant will call `watch_optimizations`, blocking up to 30 seconds. When you finish rewriting in the extension, the result returns immediately.

Or fetch on demand:

```
Use prompto's get_latest_optimization to get the latest rewrite result
```

### MCP Tools

| Tool | Description |
|------|-------------|
| `optimize_prompt` | Rewrite a prompt (with project context) |
| `analyze_project` | Analyze project tech stack and structure |
| `get_project_context` | View cached project summary |
| `get_pending_results` | Get all pending rewrite results |
| `get_latest_optimization` | Get the most recent rewrite result |
| `watch_optimizations` | Block and wait for next result (persistent listen) |
| `list_engines` | View engine configuration |

### Multi-Channel Workflow

```
┌─────────────┐     write to queue    ┌──────────────┐
│  Prompto    │ ────────────────────→ │  Message Queue│
│  Extension  │   route by channel    │  (filesystem) │
└─────────────┘                       └──────┬───────┘
                                             │
                    ┌────────────────────────┼────────────────────────┐
                    ▼                        ▼                        ▼
            ┌──────────────┐        ┌──────────────┐        ┌──────────────┐
            │  IDE-A (Kiro) │        │  IDE-B (Cursor)│        │  IDE-C (VS Code)│
            │  Project A    │        │  Project B    │        │  Global       │
            └──────────────┘        └──────────────┘        └──────────────┘
```

## Usage

### Extension

1. Open the Prompto sidebar panel
2. Type a prompt in the chat window, press Enter to rewrite
3. Results auto-push to IDE chat + write to MCP channel
4. Or select text in editor, right-click → "Prompto: Rewrite Selection"

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
| Communication | Filesystem message queue · Multi-channel routing |

## Project Structure

```
prompto/
├── src/                  # Desktop frontend
├── src-tauri/            # Desktop backend (Rust)
├── vscode-extension/     # IDE extension
│   ├── src/              # Extension Host
│   └── webview/          # Extension WebView UI
└── mcp-server/           # MCP Server (channels + rewrite)
```

## Configuration

Config stored at `~/Library/Application Support/prompto/`:

- `config.json` — Engine, CLI templates, API, rules, MCP channels
- `history.json` — Rewrite history
- `mcp-queue/` — MCP message queue (subdirectories per channel)

## License

MIT
