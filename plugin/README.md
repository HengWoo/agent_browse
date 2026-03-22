# agent-browse — Real Chrome Browser Automation

Control your real Chrome browser remotely via Claude Code. Uses a Chrome extension relay for anti-bot bypass, login session reuse, and real browser fingerprints.

## How It Works

```
Claude Code → MCP (HTTPS) → Relay Server → WebSocket → Chrome Extension → Your Browser
```

Your Chrome extension connects to a relay server. Claude Code sends MCP tool calls that route to your browser. You see everything happening in real-time.

## Setup

### 1. Install the Plugin

```
/install-plugin HengWoo/smartice_plugins agent-browse
```

### 2. Set Your Auth Token

Add to your environment (shell profile or project `.env`):

```bash
export AGENT_BROWSE_TOKEN="your-token-here"
```

Token is provided by your admin.

### 3. Install Chrome Extension

1. Open `chrome://extensions/` in Chrome
2. Enable "Developer mode" (top right)
3. Click "Load unpacked" → select the `extension/` directory from this repo
4. Click the extension icon → Options
5. Set:
   - **Server URL**: `wss://browse.clembot.uk`
   - **User ID**: your assigned user ID
   - **Token**: your auth token
6. Click "Save & Reconnect"
7. Status should show "Connected"

### 4. Use It

Ask Claude Code to browse — it will use the MCP tools automatically:

> "Open pos.meituan.com and check today's sales report"

Or use the browser-automation agent directly for complex tasks.

## Available MCP Tools (23)

| Category | Tools |
|----------|-------|
| Tabs | `tabs_list`, `tab_attach`, `tab_detach` |
| Navigation | `navigate` |
| Input | `click`, `click_selector`, `click_text`, `type`, `press_key` |
| Inspection | `screenshot`, `snapshot`, `evaluate` |
| Network | `network_enable`, `network_requests`, `network_request_detail` |
| Cookies | `cookies_get`, `cookies_set` |
| Storage | `storage_get`, `storage_set` |
| Extraction | `extract_table`, `extract_links`, `wait_for` |
| Raw | `cdp_raw` |

## Requirements

- Chrome browser with the relay extension installed
- `AGENT_BROWSE_TOKEN` environment variable set
- Network access to `browse.clembot.uk`
