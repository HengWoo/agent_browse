---
description: "Start browser automation: check relay, list tabs, attach to a tab"
argument-hint: "[url or action]"
---

# /browse — Browser Automation

Start a browser automation session using the agent_browse relay.

## Steps

### 1. Check Relay Health

Run the health check:
```bash
bash {plugin_dir}/scripts/relay_health.sh
```

If the server is **offline**, tell the user:
> The relay server is not running. Start it with:
> ```
> cd /Users/heng/Development/agent_browse && uv run python relay_server.py
> ```
> Then load the Chrome extension from `extension/` and click its icon on your target tab.

If the extension is **not connected**, tell the user:
> The relay server is running but no Chrome extension is connected.
> Load the extension from `/Users/heng/Development/agent_browse/extension/` in Chrome (chrome://extensions → Load unpacked).

### 2. List Available Tabs

```bash
bash {plugin_dir}/scripts/browse-cli.sh tabs
```

Display the tabs to the user in a readable format: tab ID, title, URL.

### 3. Handle Arguments

If `$ARGUMENTS` contains a URL, navigate to it after attaching.
If `$ARGUMENTS` contains an action description, plan the automation steps.
If no arguments, ask the user which tab to work with.

### 4. Attach and Work

After the user selects a tab (or one is auto-selected):

```bash
bash {plugin_dir}/scripts/browse-cli.sh attach <tabId>
bash {plugin_dir}/scripts/browse-cli.sh screenshot <tabId>
```

Show the screenshot and ask what the user wants to do, or proceed with the requested action.

### 5. Automation Tips

- Use `evaluate` to find element coordinates before clicking
- Take screenshots after each action to verify results
- For complex workflows, use the **browser-automation** agent
