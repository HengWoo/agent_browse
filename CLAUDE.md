# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Python relay server (legacy, replaced by Node MCP server)
uv run python relay_server.py

# Node MCP server (primary)
cd server && npm run dev          # Development with tsx
cd server && npm run build        # Compile TypeScript
cd server && npm start            # Run compiled output

# Tests
cd server && npm test             # Run all vitest tests
cd server && npx vitest run src/__tests__/tools.test.ts  # Single test file

# Plugin shell tests
bash tests/test_plugin_structure.sh
bash tests/test_relay_health.sh
```

## Architecture

Browser automation system using real Chrome sessions (anti-bot friendly):

```
Claude Code ──MCP/stdio──► MCP Server (server/)
                               │
                          HTTP + WebSocket on 127.0.0.1:18800
                               │
Chrome Extension ──WebSocket──►┘  (extension connects to /ws)
     │
     └── chrome.debugger API ──► Browser Tab
```

### Two Server Implementations

1. **`server/`** (TypeScript, primary) — MCP server using `@modelcontextprotocol/sdk`. Exposes tools via stdio for Claude Code, plus an HTTP API on port 18800 for backward compatibility.
2. **`relay_server.py`** (Python, legacy) — Standalone aiohttp server on port 18800. HTTP-only, no MCP. Kept for reference but superseded by the Node server.

Both use the same protocol: extension connects to `ws://127.0.0.1:18800/ws`, commands are JSON with UUID-based request/response correlation.

### MCP Server Internals (`server/src/`)

- **`main.ts`** — Boots HTTP server, WebSocket bridge, and MCP stdio transport. Registers all tools with a mutex (extension processes commands sequentially).
- **`ExtensionBridge.ts`** — WebSocket bridge to Chrome extension. Single-connection model (new connection replaces old). Handles version handshake, request/response matching, and CDP event forwarding.
- **`ToolDefinition.ts`** — `defineTool()` pattern: each tool is `{ name, description, schema (Zod), handler }`. Tools are organized by domain in `tools/` directory.
- **`McpResponse.ts`** — Builder for MCP responses (text + images). Tool handlers call `appendText()`/`attachImage()`, then `build()` produces the content array.
- **`http-server.ts`** — Express routes replicating `relay_server.py` HTTP API for backward compatibility with `browse-cli.sh` and curl.
- **`Mutex.ts`** — Ensures only one tool handler runs at a time (critical for sequential extension processing).
- **`tools/`** — One file per domain: tabs, navigation, input, screenshot, snapshot, script, network, cookies, extraction.

### Chrome Extension (`extension/`)

- **`background.js`** — Service worker. Connects to relay via WebSocket, handles all CDP commands via `chrome.debugger` API.
- **`popup.js`** / **`popup.html`** — UI for attach/detach per tab.
- **`manifest.json`** — Manifest V3, version must stay in sync with `server/package.json` version (version handshake in `ExtensionBridge`).
- Keep-alive via `chrome.alarms` (service workers have ~30s idle timeout).
- Network capture: in-memory Map per tab, capped at 500 requests, auto-cleaned on tab close/detach.

### Plugin (`plugin/`)

Claude Code plugin providing `/browse` and `/browse-status` commands, a `browser-automation` agent, and the `browser-relay` skill with CDP reference docs.

## Key Design Decisions

- Uses Chrome's native debugger API instead of Playwright/Puppeteer to avoid automation detection.
- Extension must `attach` to a tab before any CDP commands work (error: "Tab not attached").
- Chrome detaches the debugger when DevTools opens on the same tab — cannot use both simultaneously.
- WebSocket auto-reconnects every 5 seconds if relay server restarts.
- All MCP tool handlers are serialized through a mutex because the extension processes commands one at a time.
- Port configurable via `AGENT_BROWSE_PORT` env var (default 18800). If port is in use, MCP stdio still works.

## Adding a New MCP Tool

1. Create or edit a file in `server/src/tools/`.
2. Use `defineTool()` with Zod schema and async handler.
3. Export the tool — `main.ts` auto-collects all exports from tool modules.
4. The handler receives `(request, response, context)`: use `context.bridge.send(action, params)` to talk to the extension, and `response.appendText()` / `response.attachImage()` to build the MCP response.
