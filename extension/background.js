/**
 * Browser Relay Extension - Background Service Worker
 *
 * Architecture:
 * 1. Extension connects to local relay server via WebSocket
 * 2. Relay server receives HTTP requests from Claude Code
 * 3. Relay forwards commands to extension via WebSocket
 * 4. Extension executes via chrome.debugger API
 * 5. Results flow back through the same path
 *
 * Protocol contract: every response MUST include { success: boolean }.
 * Payload goes in { data } — never in ad-hoc top-level properties.
 */

// ============== Configuration ==============
const RELAY_WS_URL = "ws://127.0.0.1:18800/ws";
const RECONNECT_INTERVAL = 5000;
const KEEPALIVE_INTERVAL = 20000; // Keep service worker alive

// ============== State ==============
const state = {
  attachedTabs: new Map(), // tabId -> { attached: boolean }
  wsConnection: null,
  wsConnected: false,
  // Network capture: tabId -> { requests: Map<requestId, reqData> }
  networkCapture: new Map(),
};

// ============== Helpers ==============

/**
 * Guard: throw if tab not attached. Since handleRelayCommand wraps
 * everything in try-catch, throwing is safe and avoids duplicated guards.
 */
function requireAttached(tabId) {
  if (!state.attachedTabs.has(tabId)) {
    throw new Error("Tab not attached. Call attach first.");
  }
}

/**
 * Atomic click at coordinates — used by click, clickBySelector, clickByText.
 */
async function dispatchClick(tabId, x, y) {
  await chrome.debugger.sendCommand({ tabId }, "Input.dispatchMouseEvent", {
    type: "mousePressed", x, y, button: "left", clickCount: 1
  });
  await chrome.debugger.sendCommand({ tabId }, "Input.dispatchMouseEvent", {
    type: "mouseReleased", x, y, button: "left", clickCount: 1
  });
}

// ============== WebSocket Connection ==============

function connectToRelay() {
  if (state.wsConnection?.readyState === WebSocket.OPEN) {
    return;
  }

  console.log("[Relay] Connecting to relay server...");

  try {
    state.wsConnection = new WebSocket(RELAY_WS_URL);

    state.wsConnection.onopen = () => {
      console.log("[Relay] Connected to relay server");
      state.wsConnected = true;
      sendToRelay({
        type: "status",
        attachedTabs: Array.from(state.attachedTabs.keys())
      });
    };

    state.wsConnection.onmessage = async (event) => {
      let messageId;
      try {
        const message = JSON.parse(event.data);
        messageId = message.id;
        const result = await handleRelayCommand(message);
        sendToRelay({ id: messageId, ...result });
      } catch (error) {
        console.error("[Relay] Error handling message:", error);
        // Always send error response back so the server doesn't hang
        if (messageId) {
          sendToRelay({ id: messageId, success: false, error: error.message });
        }
      }
    };

    state.wsConnection.onclose = () => {
      console.log("[Relay] Disconnected from relay server");
      state.wsConnected = false;
      setTimeout(connectToRelay, RECONNECT_INTERVAL);
    };

    state.wsConnection.onerror = (error) => {
      console.error("[Relay] WebSocket error:", error);
    };
  } catch (error) {
    console.error("[Relay] Failed to connect:", error);
    setTimeout(connectToRelay, RECONNECT_INTERVAL);
  }
}

function sendToRelay(data) {
  if (state.wsConnection?.readyState === WebSocket.OPEN) {
    state.wsConnection.send(JSON.stringify(data));
  } else {
    console.warn("[Relay] Cannot send, WebSocket not open. Dropped:", data.id ?? data.type);
  }
}

// ============== Command Handler ==============

async function handleRelayCommand(message) {
  const { action, tabId, ...params } = message;

  try {
    switch (action) {
      case "listTabs":
        return await listTabs();
      case "attach":
        return await attachToTab(tabId);
      case "detach":
        return await detachFromTab(tabId);
      case "navigate":
        return await navigate(tabId, params.url);
      case "click":
        return await click(tabId, params.x, params.y);
      case "type":
        return await typeText(tabId, params.text);
      case "evaluate":
        return await evaluate(tabId, params.expression);
      case "screenshot":
        return await screenshot(tabId);
      case "getPageInfo":
        return await getPageInfo(tabId);
      case "snapshot":
        return await getSnapshot(tabId);
      case "clickSelector":
        return await clickBySelector(tabId, params.selector);
      case "clickText":
        return await clickByText(tabId, params.text, params.exact);
      case "pressKey":
        return await pressKey(tabId, params.key);
      case "networkRequests":
        return getNetworkRequests(tabId, params.filter, params.allTypes);
      case "networkRequestDetail":
        return await getNetworkRequestDetail(tabId, params.requestId);
      case "waitFor":
        return await waitForCondition(tabId, params);
      case "cdp":
        return await executeCommand(tabId, params.method, params.params);
      default:
        return { success: false, error: `Unknown action: ${action}` };
    }
  } catch (error) {
    return { success: false, error: error.message };
  }
}

// ============== Tab Management ==============

async function listTabs() {
  const tabs = await chrome.tabs.query({});
  return {
    success: true,
    data: tabs.map(t => ({
      id: t.id,
      url: t.url,
      title: t.title,
      attached: state.attachedTabs.has(t.id)
    }))
  };
}

async function attachToTab(tabId) {
  const debuggeeId = { tabId };

  try {
    await chrome.debugger.attach(debuggeeId, "1.3");
    state.attachedTabs.set(tabId, { attached: true });

    // Enable necessary CDP domains
    await chrome.debugger.sendCommand(debuggeeId, "Page.enable");
    await chrome.debugger.sendCommand(debuggeeId, "DOM.enable");

    console.log(`[Relay] Attached to tab ${tabId}`);
    updateBadge(tabId, "ON");

    return { success: true, data: { tabId } };
  } catch (error) {
    console.error(`[Relay] Attach failed:`, error);
    updateBadge(tabId, "!");
    return { success: false, error: error.message };
  }
}

async function detachFromTab(tabId) {
  if (!state.attachedTabs.has(tabId)) {
    return { success: true };
  }

  try {
    await chrome.debugger.detach({ tabId });
    state.attachedTabs.delete(tabId);
    updateBadge(tabId, "");
    console.log(`[Relay] Detached from tab ${tabId}`);
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

function updateBadge(tabId, text) {
  chrome.action.setBadgeText({ text, tabId });
  chrome.action.setBadgeBackgroundColor({
    color: text === "ON" ? "#4CAF50" : text === "!" ? "#F44336" : "#9E9E9E",
    tabId
  });
}

// ============== CDP Commands ==============

async function executeCommand(tabId, method, params = {}) {
  requireAttached(tabId);

  try {
    const result = await chrome.debugger.sendCommand({ tabId }, method, params);
    return { success: true, data: result };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

async function navigate(tabId, url) {
  return executeCommand(tabId, "Page.navigate", { url });
}

async function evaluate(tabId, expression) {
  return executeCommand(tabId, "Runtime.evaluate", {
    expression,
    returnByValue: true,
    awaitPromise: true
  });
}

async function screenshot(tabId) {
  return executeCommand(tabId, "Page.captureScreenshot", { format: "png" });
}

async function click(tabId, x, y) {
  requireAttached(tabId);
  await dispatchClick(tabId, x, y);
  return { success: true };
}

async function typeText(tabId, text) {
  requireAttached(tabId);
  for (const char of text) {
    await chrome.debugger.sendCommand({ tabId }, "Input.dispatchKeyEvent", {
      type: "char",
      text: char
    });
  }
  return { success: true };
}

async function getPageInfo(tabId) {
  const evalResult = await evaluate(tabId, `
    JSON.stringify({
      url: window.location.href,
      title: document.title,
      bodyText: document.body?.innerText?.slice(0, 10000) || ""
    })
  `);

  if (evalResult.success && evalResult.data?.result?.value) {
    try {
      return { success: true, data: JSON.parse(evalResult.data.result.value) };
    } catch {
      return evalResult;
    }
  }
  return evalResult;
}

// ============== Enhanced Actions ==============

async function getSnapshot(tabId) {
  requireAttached(tabId);

  try {
    const result = await chrome.debugger.sendCommand(
      { tabId },
      "Accessibility.getFullAXTree"
    );
    return { success: true, data: result };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

async function clickBySelector(tabId, selector) {
  requireAttached(tabId);

  try {
    const selectorJson = JSON.stringify(selector);
    const findResult = await chrome.debugger.sendCommand(
      { tabId },
      "Runtime.evaluate",
      {
        expression: `
          (function() {
            const el = document.querySelector(${selectorJson});
            if (!el) return JSON.stringify({ error: "Element not found: " + ${selectorJson} });
            const rect = el.getBoundingClientRect();
            if (rect.width === 0 && rect.height === 0) {
              return JSON.stringify({ error: "Element has zero size" });
            }
            return JSON.stringify({
              x: rect.left + rect.width / 2,
              y: rect.top + rect.height / 2
            });
          })()
        `,
        returnByValue: true
      }
    );

    if (!findResult?.result?.value) {
      return {
        success: false,
        error: findResult?.exceptionDetails?.text ?? `Failed to evaluate selector: ${selector}`
      };
    }

    const coords = JSON.parse(findResult.result.value);
    if (coords.error) {
      return { success: false, error: coords.error };
    }

    await dispatchClick(tabId, coords.x, coords.y);
    return { success: true, data: { x: coords.x, y: coords.y } };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

async function clickByText(tabId, text, exact = false) {
  requireAttached(tabId);

  try {
    const findResult = await chrome.debugger.sendCommand(
      { tabId },
      "Runtime.evaluate",
      {
        expression: `
          (function() {
            const text = ${JSON.stringify(text)};
            const exact = ${JSON.stringify(exact)};

            const walker = document.createTreeWalker(
              document.body,
              NodeFilter.SHOW_ELEMENT,
              {
                acceptNode: function(node) {
                  const style = window.getComputedStyle(node);
                  if (style.display === 'none') return NodeFilter.FILTER_REJECT;
                  if (style.visibility === 'hidden') return NodeFilter.FILTER_SKIP;
                  return NodeFilter.FILTER_ACCEPT;
                }
              }
            );

            let match = null;
            while (walker.nextNode()) {
              const el = walker.currentNode;
              const innerText = el.innerText?.trim();
              if (!innerText) continue;

              if (exact ? innerText === text : innerText.includes(text)) {
                match = el;
              }
            }

            if (!match) return JSON.stringify({ error: "Text not found: " + text });
            const rect = match.getBoundingClientRect();
            if (rect.width === 0 && rect.height === 0) {
              return JSON.stringify({ error: "Matching element has zero size" });
            }
            return JSON.stringify({
              x: rect.left + rect.width / 2,
              y: rect.top + rect.height / 2,
              matchedText: match.innerText.trim().slice(0, 100)
            });
          })()
        `,
        returnByValue: true
      }
    );

    if (!findResult?.result?.value) {
      return {
        success: false,
        error: findResult?.exceptionDetails?.text ?? `Failed to evaluate text search`
      };
    }

    const coords = JSON.parse(findResult.result.value);
    if (coords.error) {
      return { success: false, error: coords.error };
    }

    await dispatchClick(tabId, coords.x, coords.y);
    return { success: true, data: { x: coords.x, y: coords.y, matchedText: coords.matchedText } };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

/**
 * Parse a key combo string like "Control+Shift+A" into modifier flags and key info.
 */
function parseKeyCombo(keyCombo) {
  const parts = keyCombo.split('+');
  const modifiers = { ctrl: false, shift: false, alt: false, meta: false };
  let key = '';

  for (const part of parts) {
    const lower = part.toLowerCase();
    if (lower === 'control' || lower === 'ctrl') modifiers.ctrl = true;
    else if (lower === 'shift') modifiers.shift = true;
    else if (lower === 'alt') modifiers.alt = true;
    else if (lower === 'meta' || lower === 'command' || lower === 'cmd') modifiers.meta = true;
    else key = part;
  }

  let modifierFlags = 0;
  if (modifiers.alt) modifierFlags |= 1;
  if (modifiers.ctrl) modifierFlags |= 2;
  if (modifiers.meta) modifierFlags |= 4;
  if (modifiers.shift) modifierFlags |= 8;

  return { key, modifiers: modifierFlags };
}

const SPECIAL_KEYS = {
  'Enter': { code: 'Enter', keyCode: 13, key: 'Enter' },
  'Tab': { code: 'Tab', keyCode: 9, key: 'Tab' },
  'Escape': { code: 'Escape', keyCode: 27, key: 'Escape' },
  'Backspace': { code: 'Backspace', keyCode: 8, key: 'Backspace' },
  'Delete': { code: 'Delete', keyCode: 46, key: 'Delete' },
  'ArrowUp': { code: 'ArrowUp', keyCode: 38, key: 'ArrowUp' },
  'ArrowDown': { code: 'ArrowDown', keyCode: 40, key: 'ArrowDown' },
  'ArrowLeft': { code: 'ArrowLeft', keyCode: 37, key: 'ArrowLeft' },
  'ArrowRight': { code: 'ArrowRight', keyCode: 39, key: 'ArrowRight' },
  'Home': { code: 'Home', keyCode: 36, key: 'Home' },
  'End': { code: 'End', keyCode: 35, key: 'End' },
  'PageUp': { code: 'PageUp', keyCode: 33, key: 'PageUp' },
  'PageDown': { code: 'PageDown', keyCode: 34, key: 'PageDown' },
  'Space': { code: 'Space', keyCode: 32, key: ' ' },
  'F1': { code: 'F1', keyCode: 112, key: 'F1' },
  'F2': { code: 'F2', keyCode: 113, key: 'F2' },
  'F3': { code: 'F3', keyCode: 114, key: 'F3' },
  'F5': { code: 'F5', keyCode: 116, key: 'F5' },
  'F12': { code: 'F12', keyCode: 123, key: 'F12' },
};

async function pressKey(tabId, keyCombo) {
  requireAttached(tabId);

  try {
    const { key, modifiers } = parseKeyCombo(keyCombo);
    const specialKey = SPECIAL_KEYS[key];

    const keyDown = {
      type: "keyDown",
      modifiers,
      key: specialKey?.key ?? key,
      code: specialKey?.code ?? `Key${key.toUpperCase()}`,
      windowsVirtualKeyCode: specialKey?.keyCode ?? key.toUpperCase().charCodeAt(0),
    };

    const keyUp = {
      type: "keyUp",
      modifiers,
      key: keyDown.key,
      code: keyDown.code,
      windowsVirtualKeyCode: keyDown.windowsVirtualKeyCode,
    };

    await chrome.debugger.sendCommand({ tabId }, "Input.dispatchKeyEvent", keyDown);

    if (key.length === 1 && modifiers === 0 && !specialKey) {
      await chrome.debugger.sendCommand({ tabId }, "Input.dispatchKeyEvent", {
        type: "char",
        text: key,
        modifiers: 0
      });
    }

    await chrome.debugger.sendCommand({ tabId }, "Input.dispatchKeyEvent", keyUp);

    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

// ============== Wait Conditions ==============

async function waitForCondition(tabId, { selector, text, networkIdle, timeout = 30000 }) {
  requireAttached(tabId);

  const startTime = Date.now();
  const pollInterval = 250;
  let lastError = null;
  let consecutiveErrors = 0;

  while (Date.now() - startTime < timeout) {
    try {
      if (selector) {
        const result = await chrome.debugger.sendCommand(
          { tabId },
          "Runtime.evaluate",
          {
            expression: `!!document.querySelector(${JSON.stringify(selector)})`,
            returnByValue: true
          }
        );
        if (result.result?.value === true) {
          return { success: true, data: { condition: 'selector', elapsed: Date.now() - startTime } };
        }
      }

      if (text) {
        const result = await chrome.debugger.sendCommand(
          { tabId },
          "Runtime.evaluate",
          {
            expression: `document.body?.innerText?.includes(${JSON.stringify(text)}) ?? false`,
            returnByValue: true
          }
        );
        if (result.result?.value === true) {
          return { success: true, data: { condition: 'text', elapsed: Date.now() - startTime } };
        }
      }

      if (networkIdle) {
        const capture = state.networkCapture.get(tabId);
        if (capture) {
          const pending = Array.from(capture.requests.values()).filter(r => r.status === null);
          if (pending.length === 0) {
            await new Promise(r => setTimeout(r, 2000));
            const stillPending = Array.from(capture.requests.values()).filter(r => r.status === null);
            if (stillPending.length === 0) {
              return { success: true, data: { condition: 'networkIdle', elapsed: Date.now() - startTime } };
            }
          }
        } else {
          return {
            success: false,
            error: 'Network capture not enabled for this tab. Call network_enable first.'
          };
        }
      }

      lastError = null;
      consecutiveErrors = 0;
    } catch (error) {
      lastError = error;
      consecutiveErrors++;
      if (consecutiveErrors >= 3) {
        return {
          success: false,
          error: `Condition check failed repeatedly: ${error.message}`
        };
      }
    }

    await new Promise(r => setTimeout(r, pollInterval));
  }

  return {
    success: false,
    error: lastError
      ? `Timeout after ${timeout}ms (last error: ${lastError.message})`
      : `Timeout after ${timeout}ms`
  };
}

// ============== Network Capture ==============

function ensureNetworkCapture(tabId) {
  if (!state.networkCapture.has(tabId)) {
    state.networkCapture.set(tabId, { requests: new Map() });
  }
  return state.networkCapture.get(tabId);
}

function getNetworkRequests(tabId, filter, allTypes) {
  const capture = state.networkCapture.get(tabId);
  if (!capture) {
    return { success: true, data: [] };
  }

  let requests = Array.from(capture.requests.values());

  if (!allTypes) {
    requests = requests.filter(r => r.type === 'XHR' || r.type === 'Fetch');
  }

  if (filter) {
    requests = requests.filter(r => r.url.includes(filter));
  }

  const data = requests.map(r => ({
    id: r.requestId,
    url: r.url,
    method: r.method,
    status: r.status,
    type: r.type,
    size: r.responseSize ?? 0,
  }));

  return { success: true, data };
}

async function getNetworkRequestDetail(tabId, requestId) {
  const capture = state.networkCapture.get(tabId);
  if (!capture || !capture.requests.has(requestId)) {
    return { success: false, error: `Request ${requestId} not found` };
  }

  const req = capture.requests.get(requestId);

  let responseBody = null;
  let responseBodyError = null;
  try {
    const bodyResult = await chrome.debugger.sendCommand(
      { tabId },
      "Network.getResponseBody",
      { requestId }
    );
    responseBody = bodyResult.body;
  } catch (err) {
    responseBodyError = err.message;
  }

  return {
    success: true,
    data: {
      url: req.url,
      method: req.method,
      requestHeaders: req.requestHeaders ?? {},
      requestBody: req.postData ?? null,
      status: req.status,
      responseHeaders: req.responseHeaders ?? {},
      responseBody,
      responseBodyError,
    }
  };
}

// ============== CDP Event Forwarding ==============

chrome.debugger.onEvent.addListener((source, method, params) => {
  const tabId = source.tabId;

  // Capture network events in-memory
  if (method === 'Network.requestWillBeSent') {
    const capture = ensureNetworkCapture(tabId);
    capture.requests.set(params.requestId, {
      requestId: params.requestId,
      url: params.request.url,
      method: params.request.method,
      type: params.type ?? 'Other',
      postData: params.request.postData,
      requestHeaders: params.request.headers,
      status: null,
      responseHeaders: null,
      responseSize: null,
    });
    if (capture.requests.size > 500) {
      const firstKey = capture.requests.keys().next().value;
      capture.requests.delete(firstKey);
    }
  } else if (method === 'Network.responseReceived') {
    const capture = state.networkCapture.get(tabId);
    if (capture && capture.requests.has(params.requestId)) {
      const req = capture.requests.get(params.requestId);
      req.status = params.response.status;
      req.responseHeaders = params.response.headers;
      req.type = params.type ?? req.type;
    }
  } else if (method === 'Network.loadingFinished') {
    const capture = state.networkCapture.get(tabId);
    if (capture && capture.requests.has(params.requestId)) {
      capture.requests.get(params.requestId).responseSize = params.encodedDataLength;
    }
  }

  // Forward all CDP events to server
  sendToRelay({
    type: "cdpEvent",
    tabId,
    method,
    params
  });
});

// ============== Event Handlers ==============

chrome.debugger.onDetach.addListener((source, reason) => {
  const tabId = source.tabId;
  state.attachedTabs.delete(tabId);
  state.networkCapture.delete(tabId);
  updateBadge(tabId, "");
  console.log(`[Relay] Tab ${tabId} detached: ${reason}`);
  sendToRelay({ type: "tabDetached", tabId, reason });
});

chrome.tabs.onRemoved.addListener((tabId) => {
  state.networkCapture.delete(tabId);
  if (state.attachedTabs.has(tabId)) {
    state.attachedTabs.delete(tabId);
    sendToRelay({ type: "tabClosed", tabId });
  }
});

// ============== Popup Message Handler ==============

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  (async () => {
    const { action, tabId } = message;

    if (action === "status") {
      sendResponse({
        attached: state.attachedTabs.has(tabId),
        wsConnected: state.wsConnected,
        attachedTabs: Array.from(state.attachedTabs.keys())
      });
    } else if (action === "attach") {
      sendResponse(await attachToTab(tabId));
    } else if (action === "detach") {
      sendResponse(await detachFromTab(tabId));
    }
  })();
  return true;
});

// ============== Keep-Alive ==============

chrome.alarms.create("keepAlive", { periodInMinutes: 0.4 });

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === "keepAlive") {
    if (state.wsConnection?.readyState === WebSocket.OPEN) {
      state.wsConnection.send(JSON.stringify({ type: "ping" }));
    }
  }
});

// ============== Initialization ==============

console.log("[Relay] Background service worker started");
connectToRelay();
