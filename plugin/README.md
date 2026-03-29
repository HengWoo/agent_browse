# agent-browse — Real Chrome Browser Automation

Control your real Chrome browser remotely via Claude Code. Uses a Chrome extension relay for anti-bot bypass, login session reuse, and real browser fingerprints.

[中文说明](#agent-browse--真实-chrome-浏览器自动化)

## How It Works

```
Claude Code → MCP (HTTPS) → Relay Server → WebSocket → Chrome Extension → Your Browser
```

Your Chrome extension connects to a relay server. Claude Code sends MCP tool calls that route to your browser. You see everything happening in real-time.

## Setup

### 1. Install the Plugin

> **脆脆用户可跳过此步** — 插件已预装，无需手动安装。

```
/install-plugin smarticeAI/smartice_plugins agent-browse
```

### 2. Set Your Auth Token

Add to your environment (shell profile or project `.env`):

```bash
export AGENT_BROWSE_TOKEN="your-token-here"
```

Token is provided by your admin.

### 3. Install Chrome Extension

**[Download Chrome Extension](https://github.com/HengWoo/agent_browse/releases/download/v0.2.0/agent-browse-extension.zip)** — unzip to get the `extension/` folder.

1. Open `chrome://extensions/` in Chrome
2. Enable "Developer mode" (top right)
3. Click "Load unpacked" → select the extracted `extension/` folder
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

---

# agent-browse — 真实 Chrome 浏览器自动化

通过 Claude Code 远程控制你的真实 Chrome 浏览器。使用 Chrome 扩展中继，绕过反爬虫检测，复用已登录会话，保持真实浏览器指纹。

## 工作原理

```
Claude Code → MCP (HTTPS) → 中继服务器 → WebSocket → Chrome 扩展 → 你的浏览器
```

Chrome 扩展连接到中继服务器，Claude Code 发送 MCP 工具调用，指令路由到你的浏览器。所有操作实时可见。

## 安装步骤

### 1. 安装插件

> **脆脆用户可跳过此步** — 插件已预装，无需手动安装。

```
/install-plugin smarticeAI/smartice_plugins agent-browse
```

### 2. 设置认证令牌

在你的 shell 配置文件或项目 `.env` 中添加：

```bash
export AGENT_BROWSE_TOKEN="你的令牌"
```

令牌由管理员提供。

### 3. 安装 Chrome 扩展

**[下载 Chrome 扩展](https://github.com/HengWoo/agent_browse/releases/download/v0.2.0/agent-browse-extension.zip)** — 解压后得到 `extension/` 文件夹。

1. 在 Chrome 中打开 `chrome://extensions/`
2. 开启右上角"开发者模式"
3. 点击"加载已解压的扩展程序" → 选择解压后的 `extension/` 文件夹
4. 点击扩展图标 → 选项
5. 设置：
   - **服务器地址**: `wss://browse.clembot.uk`
   - **用户 ID**: 管理员分配的用户 ID
   - **令牌**: 你的认证令牌
6. 点击"保存并重连"
7. 状态应显示"已连接"

### 4. 开始使用

直接让 Claude Code 操作浏览器，它会自动调用 MCP 工具：

> "打开 pos.meituan.com 查看今天的销售报表"

也可以使用 browser-automation agent 执行复杂任务。

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

## 前置条件

- 安装了中继扩展的 Chrome 浏览器
- 已设置 `AGENT_BROWSE_TOKEN` 环境变量
- 能访问 `browse.clembot.uk`
