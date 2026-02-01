# Meituan POS Case Study

## Target Site
- **URL**: https://pos.meituan.com/web/operation/main#/
- **Type**: Meituan Point-of-Sale business management system
- **Auth**: Login required, user has existing session

## Problem Discovered

```
User's Personal Chrome          MCP-Controlled Chrome
┌─────────────────────┐        ┌─────────────────────┐
│  ✅ Logged into     │        │  ❌ No session      │
│     Meituan POS     │        │     (clean profile) │
│                     │        │                     │
│  Cookies, localStorage       │  Different profile  │
│  Auth tokens        │        │  at ~/.cache/       │
│                     │        │  chrome-devtools-mcp│
└─────────────────────┘        └─────────────────────┘
        ↑                              ↑
    User browses                  MCP controls
    manually here                 this browser
```

**Core Issue**: MCP cannot access existing logged-in sessions

## Anti-Bot Analysis (Meituan)

Meituan is a major Chinese tech company. Expected protections:
- Likely custom anti-bot (not Cloudflare/DataDome)
- Session validation (IP, device fingerprint)
- Rate limiting on API calls
- Possible CAPTCHA on suspicious activity

## Solution Options

### Option 1: Cookie Export/Import (Quick Hack)
```bash
# Export cookies from personal Chrome
# Import to MCP profile
# Risk: Session may be invalidated on different fingerprint
```

### Option 2: OpenClaw Extension Relay (Best for Existing Sessions)
```
Personal Chrome + OpenClaw Extension
        ↓
    Relay Server (127.0.0.1:18792)
        ↓
    Claude Code Agent
```
- Controls existing tabs where you're logged in
- No session transfer needed
- Click-to-attach model

### Option 3: Patchright with Session Transfer
```python
# Launch Patchright with persistent context
# Login once (manually or automated)
# Reuse profile for future sessions
context = patchright.chromium.launch_persistent_context(
    user_data_dir="./meituan_profile",
    channel="chrome",
    headless=False,
)
# After manual login, profile persists
```

### Option 4: Connect to Existing Chrome via CDP
```bash
# Launch Chrome with remote debugging
/Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome \
  --remote-debugging-port=9222
```
```python
# Connect with Playwright/Patchright
browser = playwright.chromium.connect_over_cdp("http://localhost:9222")
```

## Recommended Approach for Meituan

### Phase 1: Session Capture
1. Use Option 3 (Patchright persistent context)
2. Launch headful browser
3. Manually login to Meituan
4. Profile saved with session

### Phase 2: Automation
1. Relaunch with same profile
2. Session preserved (cookies, localStorage)
3. Use stealth features to avoid detection

### Phase 3: Long-Running
1. Monitor session expiry
2. Re-authenticate when needed
3. Handle Meituan-specific challenges (if any)

## Test Plan

1. [ ] Check if Meituan has visible anti-bot (Cloudflare badge, etc.)
2. [ ] Test session transfer via cookies
3. [ ] Test Patchright persistent context approach
4. [ ] Identify API endpoints for automation
5. [ ] Check rate limits and restrictions

## Questions to Answer

1. **What specific tasks do you need to automate on Meituan POS?**
   - Data extraction?
   - Order management?
   - Reporting?

2. **How long do Meituan sessions last?**
   - Hours/days/weeks?
   - Affects re-authentication strategy

3. **Is there a Meituan API available?**
   - Some operations might be better via API than browser
