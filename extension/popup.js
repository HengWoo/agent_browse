/**
 * Popup UI for Browser Relay Extension
 */

let currentTabId = null;
let isAttached = false;

async function init() {
  // Get current tab
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  currentTabId = tab.id;

  // Update UI with tab info
  document.getElementById("tabUrl").textContent = tab.url.slice(0, 50) + (tab.url.length > 50 ? "..." : "");

  // Check if already attached
  const response = await chrome.runtime.sendMessage({
    action: "status",
    tabId: currentTabId
  });

  isAttached = response.attached;
  updateUI();

  // Set up button handler
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

  const response = await chrome.runtime.sendMessage({
    action,
    tabId: currentTabId
  });

  if (response.success) {
    isAttached = !isAttached;
    updateUI();
  } else {
    alert(`Failed to ${action}: ${response.error}`);
  }
}

// Initialize when popup opens
init();
