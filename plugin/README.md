# agent-browse Plugin

Claude Code plugin for browser automation through real Chrome sessions.

## What This Does

Controls your **actual Chrome browser** (with logged-in sessions, cookies, and natural fingerprints) through a relay server and Chrome extension. Unlike chrome-devtools-mcp which launches its own Chrome, this works with anti-bot protected sites.

## Architecture

```
Claude Code ──HTTP──► Relay Server (127.0.0.1:18800) ◄──WebSocket──► Chrome Extension ──► Your Browser
```

## Setup

### 1. Start the Relay Server

```bash
# From the agent_browse project root
uv run python relay_server.py
```

### 2. Load the Chrome Extension

1. Open `chrome://extensions` in Chrome
2. Enable "Developer mode"
3. Click "Load unpacked" → select `extension/` directory
4. Click the extension icon on any tab to verify connection

### 3. Install Plugin (symlink)

```bash
ln -sf "$(pwd)/plugin" ~/.claude/plugins/agent-browse
```

## Usage

### Commands

- **`/browse`** — Start a browser automation session (check relay, list tabs, attach)
- **`/browse-status`** — Quick status check for relay server and extension

### Agent

The **browser-automation** agent can be invoked for complex multi-step browser tasks. It handles the full workflow: health check → tab selection → attach → automate → verify → detach.

### CLI Tool

Standalone CLI for direct use:

```bash
./plugin/scripts/browse-cli.sh tabs
./plugin/scripts/browse-cli.sh attach 123456
./plugin/scripts/browse-cli.sh navigate 123456 "https://example.com"
./plugin/scripts/browse-cli.sh click 123456 100 200
./plugin/scripts/browse-cli.sh screenshot 123456
```

Run `./plugin/scripts/browse-cli.sh help` for all commands.

## When to Use This vs chrome-devtools-mcp

| Need | agent-browse | chrome-devtools-mcp |
|------|:---:|:---:|
| Anti-bot sites | YES | No |
| Logged-in sessions | YES | No |
| Device fingerprinting | YES | No |
| Clean browser testing | No | YES |
| CI/CD pipelines | No | YES |

## Testing

```bash
bash tests/test_plugin_structure.sh   # Plugin structure
bash tests/test_browse_cli.sh         # CLI wrapper
bash tests/test_relay_health.sh       # Health check
bash tests/test_frontmatter.sh        # YAML frontmatter
```

## Plugin Contents

```
plugin/
├── .claude-plugin/plugin.json    # Plugin manifest
├── agents/
│   └── browser-automation.md     # Automation agent
├── commands/
│   ├── browse.md                 # /browse command
│   └── browse-status.md          # /browse-status command
├── skills/
│   └── browser-relay/
│       ├── SKILL.md              # API reference & workflows
│       └── references/
│           ├── shadow-dom-patterns.md
│           └── cdp-commands.md
├── scripts/
│   ├── browse-cli.sh             # CLI wrapper
│   └── relay_health.sh           # Health check
└── README.md
```
