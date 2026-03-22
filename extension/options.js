const serverUrlInput = document.getElementById('serverUrl');
const userIdInput = document.getElementById('userId');
const tokenInput = document.getElementById('token');
const saveButton = document.getElementById('save');
const statusDiv = document.getElementById('status');

// Load saved settings
chrome.storage.sync.get(['serverUrl', 'userId', 'token'], (result) => {
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
    statusDiv.textContent = 'Settings saved. Extension will reconnect...';
    statusDiv.className = 'status saved';
    // Check connection after a brief delay
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
