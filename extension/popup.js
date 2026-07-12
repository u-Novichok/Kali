// Popup script for Kali extension.
// Displays current status, blocklist info, and handles manual sync.

document.addEventListener('DOMContentLoaded', async () => {
  // References to DOM elements
  const statusEl = document.getElementById('status');
  const countEl = document.getElementById('count');
  const lastSyncEl = document.getElementById('lastSync');
  const syncBtn = document.getElementById('syncBtn');
  const syncStatus = document.getElementById('syncStatus');

  // Helper to format date
  function formatDate(isoString) {
    if (!isoString) return 'Never';
    try {
      const date = new Date(isoString);
      return date.toLocaleString();
    } catch {
      return 'Never';
    }
  }

  // Load and display blocklist info from storage
  async function updateUI() {
    try {
      const result = await chrome.storage.local.get('kali_blocklist');
      const data = result.kali_blocklist;
      if (data && data.accounts && Array.isArray(data.accounts)) {
        countEl.textContent = data.accounts.length;
        lastSyncEl.textContent = formatDate(data.lastFetched);
      } else {
        countEl.textContent = '0';
        lastSyncEl.textContent = 'Never';
      }
    } catch (e) {
      countEl.textContent = '?';
      lastSyncEl.textContent = 'Error';
    }
  }

  // Perform manual sync
  async function syncNow() {
    syncBtn.disabled = true;
    syncStatus.textContent = 'Syncing...';
    try {
      const response = await chrome.runtime.sendMessage({ action: 'syncBlocklist' });
      if (response && response.success) {
        syncStatus.textContent = '✅ Sync successful!';
        await updateUI();
      } else {
        syncStatus.textContent = '❌ Sync failed: ' + (response?.error || 'unknown error');
      }
    } catch (error) {
      syncStatus.textContent = '❌ Sync error: ' + error.message;
    } finally {
      syncBtn.disabled = false;
      // Clear status after 5 seconds
      setTimeout(() => {
        if (syncStatus.textContent !== '') {
          syncStatus.textContent = '';
        }
      }, 5000);
    }
  }

  // Initial UI update
  await updateUI();

  // Set up sync button
  syncBtn.addEventListener('click', syncNow);

  // Listen for storage changes to refresh UI (e.g., background updated)
  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName === 'local' && changes.kali_blocklist) {
      updateUI();
    }
  });
});
