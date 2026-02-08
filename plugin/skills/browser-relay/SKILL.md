---
name: browser-relay
description: This skill should be used when the user asks to "browse", "automate browser", "control chrome", "real browser", "anti-bot", "relay server", "agent browse", or wants to interact with their actual Chrome browser sessions. Provides the API reference, decision matrix, and workflow patterns for the agent_browse relay system.
version: 1.0.0
---

# Browser Relay — Real Chrome Automation

Control the user's actual Chrome browser through the agent_browse relay system. Unlike Playwright or chrome-devtools-mcp, this uses the real browser with logged-in sessions and natural fingerprints.

## When to Use This vs chrome-devtools-mcp

| Scenario | Use agent_browse | Use chrome-devtools-mcp |
|----------|:---:|:---:|
| Anti-bot protected sites (Cloudflare, etc.) | YES | No |
| Pages requiring login sessions | YES | No |
| Sites with device fingerprinting | YES | No |
| Quick prototyping / clean browser | No | YES |
| Automated testing pipelines | No | YES |
| Screenshot of arbitrary URL | Either | YES |

## Relay Architecture

```
Claude Code ──HTTP──► Relay Server (127.0.0.1:18800) ◄──WebSocket──► Chrome Extension ──debugger API──► Tab
```

### Components
- **relay_server.py**: Python aiohttp server bridging HTTP ↔ WebSocket
- **extension/**: Chrome Manifest V3 extension using `chrome.debugger` API
- **browse-cli.sh**: CLI wrapper for curl commands

## API Reference

### Server Info
```
GET / → {name, version, extension_connected, endpoints}
```

### Tab Management
```
GET /tabs → {tabs: [{id, url, title, attached}...]}
POST /attach {tabId} → {success: true}
POST /detach {tabId} → {success: true}
```

**Important**: You must attach to a tab before sending any commands to it.

### Navigation & Content
```
POST /navigate {tabId, url} → {success: true}
POST /pageInfo {tabId} → {url, title, text}
```

### User Interaction
```
POST /click {tabId, x, y} → {success: true}
POST /type {tabId, text} → {success: true}
POST /evaluate {tabId, expression} → {result: ...}
```

### Screenshots
```
POST /screenshot {tabId} → {data: "base64..."}
```

### Raw CDP
```
POST /cdp {tabId, method, params} → {result: ...}
```

Any Chrome DevTools Protocol method can be called. Common examples:
- `DOM.getDocument` — get DOM tree
- `Runtime.evaluate` — evaluate JS (more control than /evaluate)
- `Network.enable` — start network monitoring
- `Page.captureScreenshot` — screenshot with format options

## Common Workflows

### 1. Basic Page Automation
```bash
# Setup
browse-cli.sh tabs                     # Find target tab
browse-cli.sh attach <tabId>           # Attach debugger

# Work
browse-cli.sh navigate <tabId> <url>   # Go to page
browse-cli.sh screenshot <tabId>       # Verify state
browse-cli.sh click <tabId> 100 200    # Click element
browse-cli.sh type <tabId> "hello"     # Type text

# Cleanup
browse-cli.sh detach <tabId>           # Release
```

### 2. Finding Elements for Click
When you need to click a specific element, use JavaScript to find its coordinates:

```bash
browse-cli.sh evaluate <tabId> "
  const el = document.querySelector('button.submit');
  if (el) {
    const rect = el.getBoundingClientRect();
    JSON.stringify({x: rect.x + rect.width/2, y: rect.y + rect.height/2});
  } else {
    JSON.stringify({error: 'not found'});
  }
"
```

Then use the returned x,y with the click command.

### 3. Handling Shadow DOM
See `references/shadow-dom-patterns.md` for patterns to interact with shadow DOM elements.

### 4. Data Extraction
```bash
browse-cli.sh evaluate <tabId> "
  JSON.stringify(
    Array.from(document.querySelectorAll('table tr'))
      .map(r => Array.from(r.cells).map(c => c.textContent.trim()))
  )
"
```

## Troubleshooting

| Error | Cause | Fix |
|-------|-------|-----|
| Extension not connected | Relay has no WebSocket client | Load extension, click icon |
| Tab not attached | Debugger not attached to tab | Run `attach <tabId>` first |
| Request timeout | Extension disconnected | Check extension, restart relay |
| Debugger detached | DevTools opened on same tab | Close DevTools, re-attach |
| Tab closed | User closed the tab | List tabs, pick new target |
