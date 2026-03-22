const serverUrlInput = document.getElementById('serverUrl');
const userIdInput = document.getElementById('userId');
const tokenInput = document.getElementById('token');
const saveButton = document.getElementById('save');
const statusDiv = document.getElementById('status');

// Load saved settings
chrome.storage.sync.get(['serverUrl', 'userId', 'token'], (result) => {
  if (chrome.runtime.lastError) {
    console.error('Failed to load settings:', chrome.runtime.lastError.message);
  }
  serverUrlInput.value = result.serverUrl || '';
  userIdInput.value = result.userId || '';
  tokenInput.value = result.token || '';
});

// Save settings
saveButton.addEventListener('click', () => {
  const config = {
    serverUrl: serverUrlInput.value.trim() || 'ws://127.0.0.1:18800',
    userId: userIdInput.value.trim(),
    token: tokenInput.value.trim(),
  };
  chrome.storage.sync.set(config, () => {
    if (chrome.runtime.lastError) {
      statusDiv.textContent = 'Failed to save: ' + chrome.runtime.lastError.message;
      statusDiv.className = 'status disconnected';
      return;
    }
    statusDiv.textContent = 'Settings saved. Extension will reconnect...';
    statusDiv.className = 'status saved';
    setTimeout(checkConnection, 2000);
  });
});

// Check connection status by querying the background service worker
function checkConnection() {
  chrome.runtime.sendMessage({ type: 'status' }, (response) => {
    if (chrome.runtime.lastError) {
      statusDiv.textContent = 'Extension not running';
      statusDiv.className = 'status disconnected';
      return;
    }
    if (response?.connected) {
      const userId = response.userId || 'local';
      statusDiv.textContent = `Connected as "${userId}" to ${response.serverUrl || 'relay server'}`;
      statusDiv.className = 'status connected';
    } else {
      statusDiv.textContent = 'Not connected — check server URL and credentials';
      statusDiv.className = 'status disconnected';
    }
  });
}

// Check on load
setTimeout(checkConnection, 500);
