---
name: browser-relay
description: This skill should be used when the user asks to "browse", "automate browser", "control chrome", "real browser", "anti-bot", "open website", "scrape page", "take screenshot", "click button", or wants to interact with their actual Chrome browser via the agent-browse relay. Provides the tool reference, decision matrix, and workflow patterns for remote browser automation.
version: 2.0.0
---

# Browser Relay — Real Chrome Automation via MCP

Control the user's actual Chrome browser through the agent-browse relay server. The Chrome extension bridges Claude Code to the user's real browser — with logged-in sessions, natural fingerprints, and anti-bot bypass.

## When to Use This vs Other Browser Tools

| Scenario | Use agent-browse | Use chrome-devtools-mcp | Use Playwright |
|----------|:---:|:---:|:---:|
| Anti-bot protected sites (Cloudflare, etc.) | YES | No | No |
| Pages requiring login sessions | YES | No | No |
| Sites with device fingerprinting | YES | No | No |
| User wants to watch automation live | YES | No | No |
| Quick prototyping / clean browser | Either | YES | YES |
| Automated testing pipelines | No | YES | YES |

## Architecture

```
Claude Code → MCP (HTTPS) → Relay Server → WebSocket → Chrome Extension → Real Browser
```

The user's Chrome extension connects to the relay server. Claude Code sends MCP tool calls that route to the user's specific extension via per-user auth tokens.

## Prerequisites

Before using browser tools, the user must have:
1. Chrome extension installed and configured (server URL + userId + token in extension options)
2. `AGENT_BROWSE_TOKEN` environment variable set (their auth token)
3. Extension showing "Connected" status

Check connection status first:
- Call `tabs_list` — if it returns tabs, the extension is connected
- If it throws "Extension not connected", the user needs to set up the extension

## MCP Tools Reference

All tools are available as `mcp__agent-browse__<tool_name>`.

### Tab Management
- `tabs_list` — List all open browser tabs with id, url, title
- `tab_attach` — Attach debugger to a tab (required before most actions)
- `tab_detach` — Detach debugger from a tab

### Navigation
- `navigate` — Navigate a tab to a URL

### Input
- `click` — Click at coordinates (x, y)
- `click_selector` — Click element by CSS selector (auto-finds coordinates)
- `click_text` — Click element by visible text content
- `type` — Type text into focused element
- `press_key` — Press a key or key combo (e.g., "Enter", "Control+A")

### Inspection
- `screenshot` — Capture visible page as PNG
- `snapshot` — Get accessibility tree (structured DOM) with element IDs (e1, e2, ...)
- `evaluate` — Execute JavaScript in page context

### Network
- `network_enable` — Start capturing network requests (call BEFORE navigating)
- `network_requests` — List captured network requests (with optional URL filter)
- `network_request_detail` — Get response body of a specific request

### Cookies & Storage
- `cookies_get` — Get cookies for a URL
- `cookies_set` — Set a cookie
- `storage_get` — Read localStorage (key or all)
- `storage_set` — Write to localStorage

### Content Extraction
- `extract_table` — Extract table data from page by CSS selector
- `extract_links` — Extract all links from page
- `wait_for` — Wait for selector, text, or network idle

### Raw CDP
- `cdp_raw` — Send any Chrome DevTools Protocol command directly

## Standard Workflow

1. **List tabs** → `tabs_list` to find the tab to work with
2. **Attach** → `tab_attach` with the tab ID
3. **Navigate** → `navigate` to the target URL
4. **Inspect** → `snapshot` to see page structure, or `screenshot` for visual
5. **Act** → `click_selector`, `type`, `press_key` to interact
6. **Extract** → `evaluate` for data, `extract_table` for tables, `screenshot` for visual proof
7. **Detach** → `tab_detach` when done

## Tips

- Always call `tab_attach` before other actions on a tab
- Use `snapshot` over `screenshot` for structured interaction — it gives element IDs you can reference
- Use `click_selector` or `click_text` over raw `click` (x, y) — more reliable
- Call `network_enable` BEFORE navigating if you need to capture XHR/fetch requests
- The `wait_for` tool is essential after navigation — pages may still be loading
- For complex pages, combine `snapshot` (structure) + `screenshot` (visual) for best understanding
