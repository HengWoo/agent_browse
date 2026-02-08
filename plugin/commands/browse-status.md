---
description: "Check relay server and extension connection status"
---

# /browse-status — Relay Status Check

Quick status check for the agent_browse relay system.

## Steps

### 1. Run Health Check

```bash
bash {plugin_dir}/scripts/relay_health.sh
```

### 2. Report Status

Based on the JSON output, report:

- **Server**: online/offline + URL
- **Extension**: connected/disconnected
- **Relay version**: from server info

If online, also list tabs:
```bash
bash {plugin_dir}/scripts/browse-cli.sh tabs
```

### 3. Format Output

Present as a concise status report:

```
Agent Browse Relay
  Server:    online (http://127.0.0.1:18800)
  Extension: connected
  Tabs:      3 open (2 attached)
```

If offline:
```
Agent Browse Relay
  Server:    OFFLINE

  To start: cd /Users/heng/Development/agent_browse && uv run python relay_server.py
  Then load extension from extension/ in Chrome
```
