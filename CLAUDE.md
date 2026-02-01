# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Start the relay server
uv run python relay_server.py

# Run any Python file
uv run python <file.py>
```

## Architecture

Browser automation system using real Chrome sessions (anti-bot friendly):

```
Claude Code ──HTTP──► Relay Server ◄──WebSocket──► Chrome Extension ──debugger API──► Browser Tab
```

### Components

**relay_server.py** - Python aiohttp server on `127.0.0.1:18800`:
- HTTP API for Claude Code (endpoints: `/tabs`, `/attach`, `/navigate`, `/click`, `/type`, `/evaluate`, `/screenshot`, `/cdp`)
- WebSocket endpoint (`/ws`) for extension connection
- Request/response matching via UUID-based message IDs in `pending_requests` dict

**extension/** - Chrome Manifest V3 extension:
- `background.js` - Service worker handling WebSocket relay and Chrome Debugger API (CDP)
- Uses `chrome.debugger` to attach/control tabs
- Maintains `state.attachedTabs` Map for tracking debugger sessions
- Keep-alive via `chrome.alarms` (service workers have ~30s idle timeout)

### Key Design Decisions

- Uses Chrome's native debugger API instead of Playwright/Puppeteer to avoid automation detection
- Extension must attach to tab before any CDP commands work (error: "Tab not attached")
- Chrome detaches debugger when DevTools opens on the same tab
- WebSocket auto-reconnects every 5 seconds if relay server restarts

## API Usage

All POST endpoints require `{tabId}` in body. Get tab IDs from `GET /tabs`.

```bash
# List tabs
curl http://127.0.0.1:18800/tabs

# Attach debugger to tab (required before other commands)
curl -X POST http://127.0.0.1:18800/attach -d '{"tabId": 123}'

# Navigate, click, type, screenshot
curl -X POST http://127.0.0.1:18800/navigate -d '{"tabId": 123, "url": "..."}'
curl -X POST http://127.0.0.1:18800/click -d '{"tabId": 123, "x": 100, "y": 200}'
curl -X POST http://127.0.0.1:18800/type -d '{"tabId": 123, "text": "hello"}'
curl -X POST http://127.0.0.1:18800/screenshot -d '{"tabId": 123}'

# Raw CDP command
curl -X POST http://127.0.0.1:18800/cdp -d '{"tabId": 123, "method": "DOM.getDocument", "params": {}}'
```
