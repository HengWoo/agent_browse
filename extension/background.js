/**
 * Browser Relay Extension - Background Service Worker
 *
 * Architecture:
 * 1. Extension connects to local relay server via WebSocket
 * 2. Relay server receives HTTP requests from Claude Code
 * 3. Relay forwards commands to extension via WebSocket
 * 4. Extension executes via chrome.debugger API
 * 5. Results flow back through the same path
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
};

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
      // Send initial status
      sendToRelay({
        type: "status",
        attachedTabs: Array.from(state.attachedTabs.keys())
      });
    };

    state.wsConnection.onmessage = async (event) => {
      try {
        const message = JSON.parse(event.data);
        const result = await handleRelayCommand(message);
        sendToRelay({ id: message.id, ...result });
      } catch (error) {
        console.error("[Relay] Error handling message:", error);
      }
    };

    state.wsConnection.onclose = () => {
      console.log("[Relay] Disconnected from relay server");
      state.wsConnected = false;
      // Attempt reconnection
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
      case "cdp":
        return await executeCommand(tabId, params.method, params.params);
      default:
        return { error: `Unknown action: ${action}` };
    }
  } catch (error) {
    return { error: error.message };
  }
}

// ============== Tab Management ==============

async function listTabs() {
  const tabs = await chrome.tabs.query({});
  return {
    success: true,
    tabs: tabs.map(t => ({
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
    // Note: Input domain doesn't need enabling - dispatch events work directly

    console.log(`[Relay] Attached to tab ${tabId}`);
    updateBadge(tabId, "ON");

    return { success: true, tabId };
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
  if (!state.attachedTabs.has(tabId)) {
    return { error: "Tab not attached. Call attach first." };
  }

  try {
    const result = await chrome.debugger.sendCommand({ tabId }, method, params);
    return { success: true, result };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

async function navigate(tabId, url) {
  return executeCommand(tabId, "Page.navigate", { url });
}

async function evaluate(tabId, expression) {
  const result = await executeCommand(tabId, "Runtime.evaluate", {
    expression,
    returnByValue: true,
    awaitPromise: true
  });
  return result;
}

async function screenshot(tabId) {
  return executeCommand(tabId, "Page.captureScreenshot", { format: "png" });
}

async function click(tabId, x, y) {
  // Dispatch mouse events
  await executeCommand(tabId, "Input.dispatchMouseEvent", {
    type: "mousePressed",
    x, y,
    button: "left",
    clickCount: 1
  });

  await executeCommand(tabId, "Input.dispatchMouseEvent", {
    type: "mouseReleased",
    x, y,
    button: "left",
    clickCount: 1
  });

  return { success: true };
}

async function typeText(tabId, text) {
  for (const char of text) {
    await executeCommand(tabId, "Input.dispatchKeyEvent", {
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

  if (evalResult.success && evalResult.result?.result?.value) {
    try {
      return { success: true, ...JSON.parse(evalResult.result.result.value) };
    } catch {
      return evalResult;
    }
  }
  return evalResult;
}

// ============== Event Handlers ==============

chrome.debugger.onDetach.addListener((source, reason) => {
  const tabId = source.tabId;
  state.attachedTabs.delete(tabId);
  updateBadge(tabId, "");
  console.log(`[Relay] Tab ${tabId} detached: ${reason}`);
  sendToRelay({ type: "tabDetached", tabId, reason });
});

chrome.tabs.onRemoved.addListener((tabId) => {
  if (state.attachedTabs.has(tabId)) {
    state.attachedTabs.delete(tabId);
    sendToRelay({ type: "tabClosed", tabId });
  }
});

// ============== Popup Message Handler ==============

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
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

// Use chrome.alarms to keep service worker alive
chrome.alarms.create("keepAlive", { periodInMinutes: 0.4 }); // ~24 seconds

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === "keepAlive") {
    // Send ping to keep WebSocket alive
    if (state.wsConnection?.readyState === WebSocket.OPEN) {
      state.wsConnection.send(JSON.stringify({ type: "ping" }));
    }
  }
});

// ============== Initialization ==============

console.log("[Relay] Background service worker started");
connectToRelay();
