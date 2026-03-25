# agent-browse — Real Chrome Browser Automation for Claude Code

Control your real Chrome browser remotely via Claude Code. Uses a Chrome extension relay for anti-bot bypass, login session reuse, and real browser fingerprints.

[中文说明](#agent-browse--通过-claude-code-远程控制真实-chrome-浏览器)

## Architecture

```
Claude Code → MCP (HTTPS) → Relay Server → WebSocket → Chrome Extension → Your Browser
```

## Why This Approach?

- **Uses your real Chrome** — not a detectable automation browser
- **Persistent sessions** — your logged-in sessions work naturally
- **Anti-bot bypass** — sites see a real browser, not Playwright/Puppeteer
- **Multi-user** — each user gets their own token and browser connection
- **23 MCP tools** — tabs, navigation, clicks, screenshots, network capture, and more

## Quick Start

### 1. Install the Claude Code Plugin

> **脆脆用户可跳过此步** — 插件已预装。

```
/install-plugin smarticeAI/smartice_plugins agent-browse
```

### 2. Set Your Auth Token

Add to your shell profile (`.zshrc`, `.bashrc`, etc.):

```bash
export AGENT_BROWSE_TOKEN="your-token-here"
```

Token is provided by your admin.

### 3. Install the Chrome Extension

**Download:** Click **Code → Download ZIP** at the top of this page, then extract the `extension/` folder.

Or clone:

```bash
git clone https://github.com/HengWoo/agent_browse.git
```

Then load it in Chrome:

1. Open `chrome://extensions/`
2. Enable **Developer mode** (top right)
3. Click **Load unpacked** → select the `extension/` folder
4. Click the extension icon → **Options**
5. Set:
   - **Server URL**: `wss://browse.clembot.uk`
   - **User ID**: your assigned user ID
   - **Token**: your auth token
6. Click **Save & Reconnect**
7. Status should show **Connected**

### 4. Use It

Ask Claude Code to browse — it will use the MCP tools automatically:

> "Open pos.meituan.com and check today's sales report"

Or use the `browser-automation` agent for complex multi-step tasks.

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

## Project Structure

```
agent_browse/
├── server/          # Node.js MCP relay server (TypeScript)
├── extension/       # Chrome extension (background.js + options page)
├── plugin/          # Claude Code plugin (MCP config + agent + skill)
└── deploy/          # Dockerfile, docker-compose, systemd templates
```

## Server Deployment

The relay server runs on any Linux VPS. Two options:

**systemd (bare Node.js):**
```bash
cd server && npm install && npm run build
# Copy to /opt/agent-browse/server, create systemd service
# Set AGENT_BROWSE_MCP_SAME_PORT=1 and AGENT_BROWSE_USERS
```

**Docker:**
```bash
cd deploy && docker compose up -d
```

See `deploy/` for Dockerfile, docker-compose, and env configuration.

## Comparison

| Feature | agent-browse | Playwright/Puppeteer | Chrome DevTools MCP |
|---------|-------------|---------------------|---------------------|
| Uses real Chrome | ✅ | ❌ (embedded) | ⚠️ (separate profile) |
| Existing sessions | ✅ | ❌ | ❌ |
| Anti-bot bypass | ✅ | ❌ | ⚠️ |
| Multi-user | ✅ | ⚠️ | ❌ |
| Remote browser | ✅ | ⚠️ | ❌ |
| Full CDP access | ✅ | ✅ | ✅ |

## License

MIT

---

# agent-browse — 通过 Claude Code 远程控制真实 Chrome 浏览器

通过 Claude Code 远程控制你的真实 Chrome 浏览器。使用 Chrome 扩展中继，绕过反爬虫检测，复用已登录会话，保持真实浏览器指纹。

## 架构

```
Claude Code → MCP (HTTPS) → 中继服务器 → WebSocket → Chrome 扩展 → 你的浏览器
```

## 快速开始

### 1. 安装 Claude Code 插件

> **脆脆用户可跳过此步** — 插件已预装。

```
/install-plugin smarticeAI/smartice_plugins agent-browse
```

### 2. 设置认证令牌

在 shell 配置文件（`.zshrc`、`.bashrc` 等）中添加：

```bash
export AGENT_BROWSE_TOKEN="你的令牌"
```

令牌由管理员提供。

### 3. 安装 Chrome 扩展

**下载：** 点击本页面顶部的 **Code → Download ZIP**，然后解压出 `extension/` 文件夹。

或者克隆仓库：

```bash
git clone https://github.com/HengWoo/agent_browse.git
```

然后在 Chrome 中加载：

1. 打开 `chrome://extensions/`
2. 开启右上角**开发者模式**
3. 点击**加载已解压的扩展程序** → 选择 `extension/` 文件夹
4. 点击扩展图标 → **选项**
5. 设置：
   - **服务器地址**: `wss://browse.clembot.uk`
   - **用户 ID**: 管理员分配的用户 ID
   - **令牌**: 你的认证令牌
6. 点击**保存并重连**
7. 状态应显示**已连接**

### 4. 开始使用

直接让 Claude Code 操作浏览器，它会自动调用 MCP 工具：

> "打开 pos.meituan.com 查看今天的销售报表"

也可以使用 `browser-automation` agent 执行复杂的多步骤任务。

## 可用 MCP 工具（23 个）

| 类别 | 工具 |
|------|------|
| 标签页 | `tabs_list`, `tab_attach`, `tab_detach` |
| 导航 | `navigate` |
| 输入 | `click`, `click_selector`, `click_text`, `type`, `press_key` |
| 检查 | `screenshot`, `snapshot`, `evaluate` |
| 网络 | `network_enable`, `network_requests`, `network_request_detail` |
| Cookie | `cookies_get`, `cookies_set` |
| 存储 | `storage_get`, `storage_set` |
| 数据提取 | `extract_table`, `extract_links`, `wait_for` |
| 原始 CDP | `cdp_raw` |

## 许可证

MIT
