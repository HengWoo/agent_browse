# Browser Relay for Claude Code

A custom Chrome extension + Python relay server that allows Claude Code to control browser tabs via HTTP API.

## Architecture

```
Claude Code ──HTTP──► Relay Server ◄──WebSocket──► Chrome Extension ──debugger API──► Browser Tab
```

**How it works:**
1. Chrome extension connects to relay server via WebSocket
2. Claude Code sends HTTP requests to relay server
3. Relay forwards commands to extension via WebSocket
4. Extension executes commands using Chrome's `debugger` API (CDP)
5. Results flow back through the same path

## Why This Approach?

- **Uses real Chrome** - No detectable automation frameworks
- **Persistent sessions** - Your logged-in sessions work naturally
- **Anti-bot bypass** - Sites see a real browser, not Playwright/Puppeteer
- **Full CDP access** - Any Chrome DevTools Protocol command available

## Setup

### 1. Install the Chrome Extension

1. Open Chrome and go to `chrome://extensions/`
2. Enable "Developer mode" (toggle in top right)
3. Click "Load unpacked"
4. Select the `extension/` folder from this repository
5. The extension icon should appear in your toolbar

### 2. Start the Relay Server

```bash
uv run python relay_server.py
```

The server starts at `http://127.0.0.1:18800`

### 3. Connect Extension to Server

The extension auto-connects when the relay server is running. Check the extension popup for connection status.

## Usage

### Attach to a Tab

First, click the extension icon on any tab and click "Attach to Tab". This enables debugger control.

Or via API:
```bash
# List all tabs
curl http://127.0.0.1:18800/tabs

# Attach to a specific tab
curl -X POST http://127.0.0.1:18800/attach \
  -H "Content-Type: application/json" \
  -d '{"tabId": 123456789}'
```

### Available Endpoints

| Endpoint | Method | Body | Description |
|----------|--------|------|-------------|
| `/` | GET | - | Server info |
| `/tabs` | GET | - | List all browser tabs |
| `/attach` | POST | `{tabId}` | Attach debugger to tab |
| `/detach` | POST | `{tabId}` | Detach from tab |
| `/navigate` | POST | `{tabId, url}` | Navigate to URL |
| `/click` | POST | `{tabId, x, y}` | Click at coordinates |
| `/type` | POST | `{tabId, text}` | Type text |
| `/evaluate` | POST | `{tabId, expression}` | Execute JavaScript |
| `/screenshot` | POST | `{tabId}` | Capture screenshot (base64) |
| `/pageInfo` | POST | `{tabId}` | Get URL, title, body text |
| `/cdp` | POST | `{tabId, method, params}` | Raw CDP command |

### Example: Navigate and Screenshot

```bash
# Navigate
curl -X POST http://127.0.0.1:18800/navigate \
  -H "Content-Type: application/json" \
  -d '{"tabId": 123456789, "url": "https://example.com"}'

# Take screenshot
curl -X POST http://127.0.0.1:18800/screenshot \
  -H "Content-Type: application/json" \
  -d '{"tabId": 123456789}'
```

### Example: Click by Finding Element

```bash
# First, find element coordinates with JavaScript
curl -X POST http://127.0.0.1:18800/evaluate \
  -H "Content-Type: application/json" \
  -d '{
    "tabId": 123456789,
    "expression": "(() => { const el = document.querySelector(\"button.submit\"); const rect = el.getBoundingClientRect(); return {x: rect.x + rect.width/2, y: rect.y + rect.height/2}; })()"
  }'

# Then click at those coordinates
curl -X POST http://127.0.0.1:18800/click \
  -H "Content-Type: application/json" \
  -d '{"tabId": 123456789, "x": 500, "y": 300}'
```

## Files

```
agent_browse/
├── relay_server.py          # Python WebSocket/HTTP relay
├── extension/
│   ├── manifest.json        # Extension configuration
│   ├── background.js        # Service worker (WebSocket + CDP)
│   ├── popup.html           # Extension popup UI
│   ├── popup.js             # Popup logic
│   └── icons/               # Extension icons
└── README.md
```

## Troubleshooting

**Extension not connecting:**
- Make sure relay server is running (`uv run python relay_server.py`)
- Check browser console for WebSocket errors
- Extension auto-reconnects every 5 seconds

**"Tab not attached" error:**
- Click extension icon and click "Attach to Tab" first
- Or use `/attach` API endpoint

**Debugger detaches unexpectedly:**
- Chrome detaches debugger when DevTools is opened
- Close DevTools before using relay

## Comparison with Other Tools

| Feature | Browser Relay | Playwright/Puppeteer | Chrome DevTools MCP |
|---------|--------------|---------------------|---------------------|
| Uses real Chrome | ✅ | ❌ (embedded) | ⚠️ (separate profile) |
| Existing sessions | ✅ | ❌ | ❌ |
| Anti-bot bypass | ✅ | ❌ | ⚠️ |
| Multi-session | ✅ | ⚠️ | ❌ |
| Full CDP access | ✅ | ✅ | ✅ |
