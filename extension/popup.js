/**
 * Popup UI for Browser Relay Extension
 */

let currentTabId = null;
let isAttached = false;

async function init() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  currentTabId = tab.id;
  document.getElementById("tabUrl").textContent = tab.url.slice(0, 50) + (tab.url.length > 50 ? "..." : "");

  try {
    const response = await chrome.runtime.sendMessage({
      action: "status",
      tabId: currentTabId
    });
    if (chrome.runtime.lastError || !response) {
      document.getElementById("status").textContent = "Extension not ready — try reopening popup";
      document.getElementById("status").className = "status detached";
      return;
    }
    isAttached = response.attached ?? false;
  } catch {
    document.getElementById("status").textContent = "Cannot reach extension background";
    document.getElementById("status").className = "status detached";
    return;
  }

  updateUI();
  document.getElementById("toggleBtn").addEventListener("click", toggleAttachment);
}

function updateUI() {
  const statusEl = document.getElementById("status");
  const btnEl = document.getElementById("toggleBtn");

  if (isAttached) {
    statusEl.textContent = "✓ Attached - Ready for control";
    statusEl.className = "status attached";
    btnEl.textContent = "Detach from Tab";
    btnEl.className = "detach";
  } else {
    statusEl.textContent = "○ Not attached";
    statusEl.className = "status detached";
    btnEl.textContent = "Attach to Tab";
    btnEl.className = "attach";
  }
}

async function toggleAttachment() {
  const action = isAttached ? "detach" : "attach";

  try {
    const response = await chrome.runtime.sendMessage({
      action,
      tabId: currentTabId
    });
    if (chrome.runtime.lastError || !response) {
      alert(`Failed to ${action}: extension not responding`);
      return;
    }
    if (response.success) {
      isAttached = !isAttached;
      updateUI();
    } else {
      alert(`Failed to ${action}: ${response.error}`);
    }
  } catch {
    alert(`Failed to ${action}: cannot reach extension background`);
  }
}

init();
