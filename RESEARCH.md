# SOTA Agentic Browser Automation Research

## Executive Summary

This document analyzes state-of-the-art solutions for building multi-session, long-running agentic browser tools for Claude Code. The landscape includes MCP-based solutions, standalone frameworks, and hybrid approaches.

---

## 1. Chrome DevTools MCP (Official Google)

**Source**: [GitHub - ChromeDevTools/chrome-devtools-mcp](https://github.com/ChromeDevTools/chrome-devtools-mcp)

### Architecture
- MCP server built on Puppeteer + Chrome DevTools Protocol (CDP)
- 26 tools across 6 categories: Input, Navigation, Emulation, Performance, Network, Debugging
- WebSocket-based communication with browser

### Strengths
- **Official Google support** - maintained by Chrome DevTools team
- **Rich debugging tools** - network inspection, console access, performance tracing
- **Production-ready** - battle-tested Puppeteer foundation
- **Auto-connect mode** (Chrome M144+) - share browser state between manual and agent testing
- **Already integrated** - available as MCP tools in this environment

### Limitations
- Single browser instance per server
- No native multi-session orchestration
- No stealth/anti-detection features
- Memory overhead of Puppeteer

### Multi-Session Support
- Multi-tab via `list_pages`, `select_page`, `new_page`, `close_page`
- Persistent profile at `$HOME/.cache/chrome-devtools-mcp/chrome-profile-$CHANNEL`
- `--isolated` flag for ephemeral sessions

### Claude Code Integration
```bash
claude mcp add chrome-devtools --scope user npx chrome-devtools-mcp@latest
```

---

## 2. Microsoft Playwright MCP

**Source**: [GitHub - microsoft/playwright-mcp](https://github.com/microsoft/playwright-mcp)

### Architecture
- MCP server using Playwright's accessibility tree (not vision-based)
- Supports Chromium, Firefox, WebKit, Edge
- Structured data approach - deterministic, no ambiguity

### Strengths
- **Fast & lightweight** - accessibility tree parsing vs screenshots
- **Cross-browser** - Firefox and WebKit support
- **LLM-friendly** - no vision model required
- **Official Microsoft support**
- **Three session modes**: persistent profile, isolated, extension-based

### Limitations
- Less rich debugging compared to Chrome DevTools MCP
- Vision mode optional (requires `--caps vision`)
- Newer, less battle-tested for agentic use cases

### Multi-Session Support
- `--shared-browser-context` for shared state across HTTP clients
- Persistent profile by default
- `--isolated` mode with optional `--storage-state`

### Claude Code Integration
```json
{
  "mcpServers": {
    "playwright": {
      "command": "npx",
      "args": ["-y", "@playwright/mcp@latest"]
    }
  }
}
```

---

## 3. Patchright (Undetected Playwright) - CRITICAL FOR ANTI-BOT

**Source**: [GitHub - Kaliiiiiiiiii-Vinyzu/patchright](https://github.com/Kaliiiiiiiiii-Vinyzu/patchright)

### The Problem It Solves

Standard Playwright/Puppeteer are instantly detectable because:
1. `Runtime.enable` CDP command - anti-bot systems specifically monitor this
2. `navigator.webdriver = true` - dead giveaway
3. Automation flags in browser args
4. Console API behavior patterns

### Core Patches (Technical Details)

**1. Runtime.enable Bypass (Primary Patch)**
```
Standard Playwright: Browser ──CDP──> Runtime.enable ──> Detected!
Patchright:          Browser ──CDP──> Isolated ExecutionContexts ──> Undetected
```
- Executes JavaScript in isolated contexts instead of using `Runtime.enable`
- This is the #1 detection vector for Cloudflare/DataDome

**2. Console API Disabled**
- Console.enable leak patched by disabling entirely
- **Trade-off**: No `console.log()` - use alternative logging

**3. Command Flag Modifications**
```diff
- --enable-automation
- --disable-popup-blocking
- --disable-component-update
- --disable-default-apps
- --disable-extensions
+ --disable-blink-features=AutomationControlled
```

**4. InitScripts via Routes**
- Since Runtime.enable unavailable, JS injected via Playwright Routes into HTML
- May cause timing issues (not yet exploited by anti-bots)

**5. Shadow DOM Support**
- Works with closed shadow roots automatically
- Standard locators + XPath work transparently

### Installation

**Python:**
```bash
pip install patchright
patchright install chrome  # Chrome, NOT Chromium!
```

**Node.js:**
```bash
npm install patchright
npx patchright install chrome
```

### Optimal Configuration (CRITICAL)

```python
from patchright.sync_api import sync_playwright

with sync_playwright() as p:
    # BEST PRACTICE: Persistent context + Chrome + headful
    context = p.chromium.launch_persistent_context(
        user_data_dir="./browser_data",
        channel="chrome",        # Real Chrome, not Chromium
        headless=False,          # NEVER use headless
        no_viewport=True,        # Use native resolution
        # NO custom user_agent or headers!
    )
    page = context.new_page()
    page.goto("https://cloudflare-protected-site.com")
```

### Extended API

**isolated_context Parameter** (Patchright-specific):
```python
# Evaluate in isolated context (default, stealthier)
page.evaluate("window.secretVar", isolated_context=True)

# Evaluate in main context (when needed)
page.evaluate("window.secretVar", isolated_context=False)
```

### Detection Bypass Verified

| Anti-Bot System | Status |
|-----------------|--------|
| Cloudflare | ✅ Bypassed |
| DataDome | ✅ Bypassed |
| Kasada | ✅ Bypassed |
| Akamai/Shape/F5 | ✅ Bypassed |
| Fingerprint.com | ✅ Bypassed |
| CreepJS | ✅ 0% detection |
| BrowserScan | ✅ Bypassed |
| Bet365 | ✅ Bypassed |

### Limitations

- **Chromium only** - no Firefox/WebKit support
- **No console.log** - use alternative logging
- **Headless broken** - must run headful or virtual display
- **Some Playwright tests fail** - rarely affects real usage
- **Timing still matters** - add human-like delays

### When to Use Patchright

| Scenario | Use Patchright? |
|----------|-----------------|
| Cloudflare-protected site | ✅ Yes |
| DataDome-protected site | ✅ Yes |
| Internal/corporate tools | ❌ Overkill |
| Public APIs | ❌ Unnecessary |
| Login-gated sites (your account) | ✅ Yes (they still detect bots) |

---

## 4. Browser-Use Framework

**Source**: [GitHub - browser-use/browser-use](https://github.com/browser-use/browser-use)

### Architecture
- Python framework with Playwright backend
- LLM-agnostic (OpenAI, Google, Ollama, custom ChatBrowserUse)
- Multi-modal: screenshots + DOM inspection
- Agent class orchestrates decision-making

### Strengths
- **Natural language tasks** - "book a flight to NYC"
- **Custom tool extension** - add external APIs via decorators
- **ChatBrowserUse model** - 3-5x faster, specialized for automation
- **Session persistence** - cookies, auth state
- **Cloud offering** - parallel execution, proxy rotation, CAPTCHA solving

### Multi-Agent Orchestration (PR #2510)
- **BaseAgent**: Task decomposition, manages up to 10 workers
- **WorkerAgent**: Parallel browser automation
- **SharedMemory**: Thread-safe inter-agent communication
- Real-time progress tracking

### Limitations
- Python-only (no native Node.js)
- Resource-intensive for local parallel execution
- Cloud features require paid service

### Claude Code Integration
Available as CLI + skill for Claude Code environment

---

## 5. Stagehand by Browserbase

**Source**: [GitHub - browserbase/stagehand](https://github.com/browserbase/stagehand)

### Architecture
- AI-native browser automation framework
- TypeScript/Python SDKs
- Four primitives: `act()`, `extract()`, `observe()`, `agent()`
- Optional Browserbase cloud for scaling

### Strengths
- **Hybrid approach** - code when precise, NL when flexible
- **Self-healing** - adapts when DOM changes
- **Element caching** - reuse without LLM inference cost
- **v3: 44% faster** than v2
- **Model-agnostic** - any LLM or CUA

### Key Features
- Context builder reduces token waste
- Built-in prompt observability
- Session replay for debugging
- Captcha solving (cloud)

### Limitations
- Best experience requires Browserbase cloud ($)
- Newer framework, evolving rapidly

### Claude Code Integration
TypeScript SDK directly usable in coding workflows

---

## 6. OpenClaw Browser Tool (Deep Dive)

**Source**: [docs.openclaw.ai/tools/browser](https://docs.openclaw.ai/tools/browser), [GitHub - openclaw/openclaw](https://github.com/openclaw/openclaw)

### CDP Architecture
```
┌─────────────────────────────────────────────────────┐
│                  HTTP Control Server                 │
│              (Accepts agent requests)                │
├─────────────────────────────────────────────────────┤
│                  CDP Connection                      │
│          (Chromium-based browser control)            │
├─────────────────────────────────────────────────────┤
│              Playwright Layer (optional)             │
│    (click/type/snapshot/PDF when available)          │
└─────────────────────────────────────────────────────┘
```

### Three Profile Types

**1. Managed Browser (`openclaw` profile)**
- Dedicated Chromium instance with isolated user data directory
- Deterministic CDP port allocation (18800-18899)
- Sandbox isolation from personal browsing
- Best for: Automated workflows needing clean state

**2. Remote CDP**
- Connect to external Chromium via explicit URL
- Supports auth tokens or HTTP Basic auth
- Enables distributed browser architectures
- Best for: Remote/cloud browser instances

**3. Extension Relay (`chrome` profile) - KEY FEATURE**
- Chrome MV3 extension using `chrome.debugger` API
- Local relay at `127.0.0.1:18792` (configurable)
- **Click-to-attach model** - agent only controls explicitly attached tabs
- **Preserves logged-in sessions** - reuse existing auth state
- Best for: Leveraging existing browser sessions & auth

### 40+ Control Endpoints

| Category | Actions |
|----------|---------|
| Navigation | open/focus/close tabs, navigate URLs |
| Inspection | AI snapshots (numeric refs), ARIA snapshots, screenshots, console, network |
| User Actions | click, type, hover, drag, scroll, select, dialog handling |
| State | cookies, localStorage, sessionStorage, offline mode, headers |
| Advanced | PDF generation, file uploads, JS evaluation, geolocation |

### Ref System (Critical for Agents)

**AI Snapshots** (recommended):
```
ref="12" - button[Submit]
ref="13" - input[email]
```
- Numeric refs optimized for LLM consumption
- Actions reference: `click ref=12`

**Role Snapshots**:
```
ref="e12" - [button] "Submit"
```
- Accessibility tree with ARIA roles
- Supports depth limiting, viewport overlays

**Important**: Refs are NOT stable across navigations - must re-snapshot after page changes.

### Key Differentiators

| OpenClaw | Typical Automation |
|----------|-------------------|
| Named profiles with routing | Single instance |
| Deterministic targetId tab control | "Last tab" heuristics |
| Built-in extension relay | External tooling |
| Numeric + role refs | Brittle CSS selectors |
| Gateway auth + loopback security | Varies |

### Strengths
- **Uses existing browser** - extension relay leverages your logged-in Chrome
- **Multi-profile architecture** - switch between managed/remote/extension
- **Agent-optimized refs** - stable within navigation, LLM-friendly
- **40+ HTTP endpoints** - comprehensive control surface
- **Built-in security** - loopback binding, Gateway auth

### Limitations
- Requires OpenClaw Gateway infrastructure (not standalone)
- Manual extension installation for relay mode
- Part of larger ecosystem (may be overkill for simple use cases)
- No built-in stealth/anti-detection

### Security Model
- Badge indicates state: `ON` (attached) / `…` (connecting) / `!` (error)
- Relay access restricted to loopback by default
- Recommendation: dedicated Chrome profile for automation

---

## 7. Vercel agent-browser Skill

**Source**: [skills.sh/vercel-labs/agent-browser](https://skills.sh/vercel-labs/agent-browser/agent-browser)

### Architecture
- CLI tool with element reference system (@e1, @e2)
- Snapshot-based interaction
- Video recording with state preservation

### Strengths
- **Simple workflow**: open → snapshot -i → interact → repeat
- **Element references** - no CSS selectors needed
- **Session isolation** - parallel sessions supported
- **Rich features**: proxy, device emulation, network interception

### Limitations
- Skill-based distribution (skills.sh ecosystem)
- Less visibility into internals

---

## 8. Claude Computer Use (Native)

**Source**: [Anthropic Computer Use API](https://platform.claude.com/docs/en/agents-and-tools/tool-use/computer-use-tool)

### Architecture
- Screenshot-based visual understanding
- Pixel-perfect mouse/keyboard control
- Requires `anthropic-beta: computer-use-2025-01-24` header

### Strengths
- **Native Claude capability** - no external tools
- **Multi-application** - not limited to browser
- **Works with any UI** - desktop apps, dialogs, etc.
- **Opus 4.5**: new `zoom` action for detailed inspection

### Limitations
- **Vision-dependent** - slower than accessibility tree approaches
- **Beta feature** - still evolving
- **Security concerns** - prompt injection via screenshots
- **Requires containerization** - VM/container recommended

### Best For
Complex workflows spanning multiple applications

---

---

## Anti-Bot Bypass: Complete Guide

### Understanding Detection Layers

Modern anti-bot systems (Cloudflare, DataDome, Akamai) use **multiple detection layers**:

```
┌─────────────────────────────────────────────────────────┐
│                    Detection Stack                       │
├─────────────────────────────────────────────────────────┤
│ 1. TLS/JA3/JA4 Fingerprinting                           │
│    - TLS handshake patterns unique to browsers          │
│    - JA4 (2023) resists extension randomization         │
├─────────────────────────────────────────────────────────┤
│ 2. HTTP/2 Fingerprinting                                │
│    - Frame ordering, header compression                 │
│    - Stream priorities, connection settings             │
├─────────────────────────────────────────────────────────┤
│ 3. Browser Fingerprinting                               │
│    - Canvas, WebGL, fonts, plugins                      │
│    - navigator.webdriver property                       │
│    - Screen resolution, color depth                     │
├─────────────────────────────────────────────────────────┤
│ 4. CDP/Automation Detection                             │
│    - Runtime.enable command monitoring                  │
│    - Automation flags in browser args                   │
│    - Console API patterns                               │
├─────────────────────────────────────────────────────────┤
│ 5. Behavioral Analysis                                  │
│    - Mouse movement patterns (curves vs lines)          │
│    - Scroll behavior, event timing                      │
│    - Concurrent request patterns                        │
├─────────────────────────────────────────────────────────┤
│ 6. IP Reputation (25-30% of trust score)                │
│    - Datacenter IPs = instant fail                      │
│    - Residential proxies required                       │
└─────────────────────────────────────────────────────────┘
```

### Anti-Bot Tools Comparison

#### 1. Patchright (See Section 3)
- **Best for**: Cloudflare, DataDome bypass with Playwright API
- **Approach**: CDP patches, isolated ExecutionContexts
- **Limitation**: Chromium only, no console

#### 2. Rebrowser-Patches
**Source**: [GitHub - rebrowser/rebrowser-patches](https://github.com/rebrowser/rebrowser-patches)

**Drop-in replacements:**
```json
// package.json
"puppeteer": "npm:rebrowser-puppeteer@^24.8.1"
"playwright": "npm:rebrowser-playwright@^1.52.0"
```

**Runtime Fix Modes:**
| Mode | Description | Main Context Access |
|------|-------------|---------------------|
| `addBinding` (default) | Context bindings via function calls | ✅ Yes |
| `alwaysIsolated` | Isolated worlds only | ❌ No |
| `enableDisable` | Enable then immediately disable | ✅ Yes |

**Configuration:**
```bash
REBROWSER_PATCHES_RUNTIME_FIX_MODE=addBinding
REBROWSER_PATCHES_SOURCE_URL=app.js  # Hide pptr: URLs
```

#### 3. Camoufox (Firefox-based)
**Source**: [GitHub - daijro/camoufox](https://github.com/daijro/camoufox)

**Key Advantage**: Patches at **C++ level**, not JavaScript
- Detection systems can't find spoofing via JS inspection
- `Object.getOwnPropertyDescriptor` returns clean results

**Architecture:**
```
Firefox Source ──> C++ Fingerprint Patches ──> Portable Build
                   ↓
              Playwright Integration (Juggler protocol)
                   ↓
              Sandboxed Page Agent (isolated from main page)
```

**Spoofed Properties:**
- Navigator (device, OS, browser, hardware)
- Screen (resolution, viewport, window)
- WebGL (extensions, shaders)
- AudioContext, VoiceSynthesis, Battery API
- WebRTC IP (protocol level)
- Network headers matching navigator

**Usage:**
```python
from camoufox.sync_api import Camoufox

with Camoufox() as browser:
    page = browser.new_page()
    page.goto("https://datadome-protected.com")
```

**Performance:** ~200MB/instance (vs 400MB+ Firefox)

**Verified Against:** CreepJS, DataDome, Cloudflare Turnstile, Imperva, reCAPTCHA

**Limitation:** Firefox only (some sites specifically test for SpiderMonkey engine)

#### 4. Undetected ChromeDriver (Selenium)
- **Status:** Declining effectiveness (open source = targeted)
- **Use case:** Legacy Selenium projects only
- **Recommendation:** Migrate to Patchright/Camoufox

#### 5. puppeteer-stealth
- **Status:** ❌ Discontinued February 2025
- **Reason:** Cloudflare specifically detects its patterns
- **Migration:** Use rebrowser-patches or Patchright

### Anti-Bot Decision Matrix

| Target Protection | Recommended Tool | Proxy Type |
|-------------------|------------------|------------|
| Cloudflare (standard) | Patchright | Residential |
| Cloudflare Turnstile | Camoufox | Residential |
| DataDome | Patchright or Camoufox | Residential |
| Akamai/Shape | Patchright | Residential |
| PerimeterX | Camoufox | Residential |
| Light protection | rebrowser-patches | Datacenter OK |
| No protection | Standard Playwright | Any |

### Best Practices for Evasion

**1. Browser Configuration**
```python
# DO
context = playwright.chromium.launch_persistent_context(
    channel="chrome",     # Real Chrome
    headless=False,       # Always visible
    no_viewport=True,     # Native resolution
)

# DON'T
browser = playwright.chromium.launch(
    headless=True,        # Instant detection
    args=["--user-agent=..."]  # Custom UA = suspicious
)
```

**2. Human-like Behavior**
```python
import random
import time

# Random delays between actions
time.sleep(random.uniform(0.5, 2.0))

# Curved mouse movements (not straight lines)
# Realistic scroll patterns
# Varied typing speeds
```

**3. Proxy Selection**
- ❌ Datacenter proxies (flagged by IP reputation)
- ✅ Residential proxies (25-30% of trust score)
- ✅ Mobile proxies (highest trust)

**4. Session Management**
- Reuse browser profiles (cookies = trust)
- Don't clear cookies between sessions
- Maintain consistent fingerprints

---

## Comparison Matrix

### Feature Comparison

| Solution | Multi-Session | Long-Running | Claude Code | Vision-Free | Self-Healing |
|----------|--------------|--------------|-------------|-------------|--------------|
| Chrome DevTools MCP | Multi-tab | ✅ Persistent | ✅ Native | ✅ | ❌ |
| Playwright MCP | Multi-context | ✅ Persistent | ✅ Native | ✅ | ❌ |
| Patchright | Via Playwright | ✅ | Build needed | ✅ | ❌ |
| Camoufox | Via Playwright | ✅ | Build needed | ✅ | ❌ |
| rebrowser-patches | Via Playwright | ✅ | Build needed | ✅ | ❌ |
| Browser-Use | ✅ Parallel | ✅ | ✅ Skill | ❌ Multi-modal | ❌ |
| Stagehand | ✅ Cloud | ✅ | Via SDK | ✅ | ✅ |
| OpenClaw | Multi-profile | ✅ | Custom | ✅ | ❌ |
| Claude Computer Use | N/A | Session-based | ✅ Native | ❌ | ❌ |

### Anti-Bot Capabilities (CRITICAL)

| Solution | Cloudflare | DataDome | Akamai | Kasada | Fingerprint.com |
|----------|------------|----------|--------|--------|-----------------|
| Chrome DevTools MCP | ❌ | ❌ | ❌ | ❌ | ❌ |
| Playwright MCP | ❌ | ❌ | ❌ | ❌ | ❌ |
| **Patchright** | ✅ | ✅ | ✅ | ✅ | ✅ |
| **Camoufox** | ✅ | ✅ | ✅ | ⚠️ | ✅ |
| **rebrowser-patches** | ✅ | ✅ | ✅ | ⚠️ | ✅ |
| Browser-Use Cloud | ✅ | ✅ | ✅ | ✅ | ✅ |
| Stagehand Cloud | ✅ | ✅ | ✅ | ✅ | ✅ |
| OpenClaw | ❌ | ❌ | ❌ | ❌ | ❌ |
| Claude Computer Use | ❌ | ❌ | ❌ | ❌ | ❌ |

**Legend:** ✅ Verified bypass | ⚠️ Partial/situational | ❌ Detected

---

## Recommendations for Your Needs

### Primary Needs:
1. Multi-session support
2. Long-running agentic browser
3. Claude Code integration
4. **Anti-bot bypass (Cloudflare, DataDome, etc.)**

---

### Recommended Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                     Claude Code Agent                            │
├─────────────────────────────────────────────────────────────────┤
│                    Session Orchestrator                          │
│   ┌──────────────┐  ┌──────────────┐  ┌──────────────┐         │
│   │  Session 1   │  │  Session 2   │  │  Session N   │         │
│   │ (Protected)  │  │ (Internal)   │  │ (Research)   │         │
│   └──────┬───────┘  └──────┬───────┘  └──────┬───────┘         │
│          │                 │                 │                  │
├──────────┴─────────────────┴─────────────────┴──────────────────┤
│              Adaptive Browser Layer                              │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │  if anti-bot detected:                                      │ │
│  │    → Patchright (Chromium) OR Camoufox (Firefox)           │ │
│  │  else:                                                      │ │
│  │    → Chrome DevTools MCP (rich debugging)                   │ │
│  │    → Playwright MCP (cross-browser, fast)                   │ │
│  └────────────────────────────────────────────────────────────┘ │
├─────────────────────────────────────────────────────────────────┤
│              Persistent State Layer                              │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐              │
│  │  Profiles   │  │  Cookies    │  │  Proxies    │              │
│  │ (userDir)   │  │(state.json) │  │(residential)│              │
│  └─────────────┘  └─────────────┘  └─────────────┘              │
└─────────────────────────────────────────────────────────────────┘
```

---

### Implementation Tiers

### Tier 1: Immediate (No Build Required)
**Use Case:** Internal tools, unprotected sites, development

**Stack:**
- Chrome DevTools MCP (already available)
- Multi-tab via `list_pages`, `select_page`

**Pros:** Works now, rich debugging
**Cons:** No anti-bot bypass

---

### Tier 2: Anti-Bot Ready (Light Build)
**Use Case:** Cloudflare/DataDome protected sites

**Option A - Patchright MCP (Recommended)**
```bash
# Build a Patchright-based MCP server
# Replace Puppeteer in chrome-devtools-mcp with Patchright
```

**Option B - Hybrid Approach**
```python
# Python wrapper that routes to appropriate backend
def get_browser(target_url):
    if has_anti_bot(target_url):
        return patchright.chromium.launch_persistent_context(...)
    else:
        return playwright.chromium.launch(...)
```

**Pros:** Bypasses major anti-bot systems
**Cons:** No MCP yet, requires Python/Node wrapper

---

### Tier 3: Multi-Agent Orchestration
**Use Case:** Complex parallel workflows

**Stack:**
- Browser-Use parallel orchestrator (PR #2510)
- Patchright as backend
- SharedMemory for coordination

**Architecture:**
```
BaseAgent (task decomposition)
    ├── WorkerAgent 1 (Patchright browser)
    ├── WorkerAgent 2 (Patchright browser)
    └── WorkerAgent N (Patchright browser)
```

**Pros:** 10 parallel workers, shared memory
**Cons:** Python only, resource intensive

---

### Tier 4: Production Scale
**Use Case:** Enterprise, high volume

**Option A - Browserbase + Stagehand**
- Cloud infrastructure ($)
- Self-healing selectors
- Built-in stealth + CAPTCHA solving

**Option B - Self-Hosted**
- Kubernetes cluster with Patchright containers
- Residential proxy pool
- Custom orchestration layer

---

### Decision Tree

```
Start
  │
  ├─> Target site has anti-bot?
  │     │
  │     ├─> YES: Which protection?
  │     │     │
  │     │     ├─> Cloudflare/DataDome/Akamai
  │     │     │     → Use Patchright
  │     │     │
  │     │     └─> Heavy fingerprinting (PerimeterX)
  │     │           → Use Camoufox (C++ level spoofing)
  │     │
  │     └─> NO: Use Chrome DevTools MCP or Playwright MCP
  │
  └─> Need multi-session orchestration?
        │
        ├─> YES: Browser-Use parallel orchestrator
        │         + Patchright backend
        │
        └─> NO: Single browser instance sufficient
```

---

## Proposed Architecture for Your Use Case

```
┌─────────────────────────────────────────────────────────────┐
│                    Claude Code Agent                         │
├─────────────────────────────────────────────────────────────┤
│                   Session Orchestrator                       │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐         │
│  │  Session 1  │  │  Session 2  │  │  Session N  │         │
│  │  (Tab Pool) │  │  (Tab Pool) │  │  (Tab Pool) │         │
│  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘         │
│         │                │                │                 │
├─────────┴────────────────┴────────────────┴─────────────────┤
│              Browser Control Layer (Pick One)                │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  Option A: Chrome DevTools MCP (debugging focus)     │   │
│  │  Option B: Playwright MCP (cross-browser, fast)      │   │
│  │  Option C: Patchright (stealth when needed)          │   │
│  └─────────────────────────────────────────────────────┘   │
├─────────────────────────────────────────────────────────────┤
│              Persistent State Layer                          │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐         │
│  │  Profiles   │  │  Cookies    │  │  Storage    │         │
│  │  (userDir)  │  │  (state.json)│  │  (localStorage)│     │
│  └─────────────┘  └─────────────┘  └─────────────┘         │
└─────────────────────────────────────────────────────────────┘
```

---

## Next Steps (Actionable)

### Phase 1: Immediate (This Week)
1. ✅ **Test Chrome DevTools MCP** - already available in environment
2. **Identify target sites** - list sites we need to automate
3. **Classify by protection** - which have Cloudflare/DataDome?

### Phase 2: Anti-Bot Foundation (Week 2)
4. **Install Patchright** - `pip install patchright && patchright install chrome`
5. **Test against protected sites** - verify bypass works
6. **Build Patchright wrapper** - simple Python API for Claude Code

### Phase 3: MCP Integration (Week 3-4)
7. **Fork chrome-devtools-mcp** - replace Puppeteer with Patchright
8. **Or build new MCP** - Patchright-native from scratch
9. **Add to Claude Code** - `claude mcp add patchright-mcp ...`

### Phase 4: Multi-Session (Month 2)
10. **Evaluate Browser-Use orchestrator** - PR #2510
11. **Design session manager** - profile pool, state persistence
12. **Build orchestration layer** - coordinate multiple browsers

### Phase 5: Production Hardening
13. **Proxy integration** - residential proxy pool
14. **Monitoring** - track success rates by site
15. **Fallback logic** - Patchright → Camoufox → Cloud

---

## Open Questions

1. **Which sites specifically need anti-bot bypass?**
   - This determines whether Patchright alone suffices or need Camoufox

2. **What's the session persistence requirement?**
   - Hours? Days? Weeks?
   - Affects profile and cookie management strategy

3. **What's the parallelism need?**
   - Single sequential tasks? → Simple
   - 10+ concurrent browsers? → Browser-Use orchestrator

4. **Budget for cloud services?**
   - Browserbase/Stagehand cloud is easiest but costs $
   - Self-hosted requires more engineering

5. **Firefox compatibility needed?**
   - If yes, need Camoufox (Firefox-based)
   - If Chromium-only OK, Patchright is simpler

---

## Key Sources

### Core Tools
- [Chrome DevTools Protocol](https://chromedevtools.github.io/devtools-protocol/)
- [Chrome DevTools MCP](https://github.com/ChromeDevTools/chrome-devtools-mcp)
- [Microsoft Playwright MCP](https://github.com/microsoft/playwright-mcp)
- [Browser-Use](https://github.com/browser-use/browser-use)
- [Stagehand](https://github.com/browserbase/stagehand)
- [OpenClaw Browser Tool](https://docs.openclaw.ai/tools/browser)
- [Claude Computer Use API](https://platform.claude.com/docs/en/agents-and-tools/tool-use/computer-use-tool)
- [Vercel agent-browser](https://skills.sh/vercel-labs/agent-browser/agent-browser)

### Anti-Bot Bypass (CRITICAL)
- [Patchright](https://github.com/Kaliiiiiiiiii-Vinyzu/patchright) - Undetected Playwright
- [Patchright Python](https://github.com/Kaliiiiiiiiii-Vinyzu/patchright-python)
- [Patchright Node.js](https://github.com/Kaliiiiiiiiii-Vinyzu/patchright-nodejs)
- [Camoufox](https://github.com/daijro/camoufox) - Firefox-based anti-detect
- [rebrowser-patches](https://github.com/rebrowser/rebrowser-patches) - Puppeteer/Playwright patches
- [ZenRows Cloudflare Bypass Guide](https://www.zenrows.com/blog/bypass-cloudflare)
- [ZenRows DataDome Bypass Guide](https://www.zenrows.com/blog/datadome-bypass)

### Industry Analysis
- [Browserless 2026 Outlook](https://www.browserless.io/blog/state-of-ai-browser-automation-2026)
- [KDnuggets: Best Agentic AI Browsers 2026](https://www.kdnuggets.com/the-best-agentic-ai-browsers-to-look-for-in-2026)
- [Castle.io: Anti-detect Framework Evolution](https://blog.castle.io/from-puppeteer-stealth-to-nodriver-how-anti-detect-frameworks-evolved-to-evade-bot-detection/)

### Claude Code Integration
- [Simon Willison: Playwright MCP with Claude Code](https://til.simonwillison.net/claude-code/playwright-mcp-claude-code)
- [Testomat: Playwright MCP Claude Code](https://testomat.io/blog/playwright-mcp-claude-code/)
