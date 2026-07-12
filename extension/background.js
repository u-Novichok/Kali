// Background service worker for Kali extension.
// Responsible for fetching and caching the blocklist, and refreshing it periodically.

const BLOCKLIST_URL = 'https://raw.githubusercontent.com/u-Novichok/Kali/main/blocklist/blocklist.json';
const REFRESH_INTERVAL_HOURS = 6;
const STORAGE_KEY = 'kali_blocklist';

// Initialize: fetch on install/startup and set up alarm.
chrome.runtime.onInstalled.addListener(async () => {
  await fetchBlocklist();
  scheduleNextRefresh();
});

chrome.runtime.onStartup.addListener(async () => {
  await fetchBlocklist();
  scheduleNextRefresh();
});

// Listen for messages from popup to manually sync.
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'syncBlocklist') {
    fetchBlocklist().then(() => {
      sendResponse({ success: true });
    }).catch((error) => {
      sendResponse({ success: false, error: error.message });
    });
    return true; // keep message channel open for async response
  }
});

// Fetch the blocklist from GitHub and store locally.
async function fetchBlocklist() {
  try {
    const response = await fetch(BLOCKLIST_URL, { cache: 'no-store' });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    const data = await response.json();
    // Validate minimal structure
    if (!data.accounts || !Array.isArray(data.accounts)) {
      throw new Error('Invalid blocklist format: missing "accounts" array');
    }
    // Store with timestamp of this fetch
    const payload = {
      ...data,
      lastFetched: new Date().toISOString()
    };
    await chrome.storage.local.set({ [STORAGE_KEY]: payload });
    console.log(`[Kali] Blocklist updated: ${data.accounts.length} accounts`);
  } catch (error) {
    console.error('[Kali] Failed to fetch blocklist:', error);
    // Keep existing cached list if any – we do not clear it.
  }
}

// Set up a repeating alarm to refresh the list.
function scheduleNextRefresh() {
  const intervalMinutes = REFRESH_INTERVAL_HOURS * 60;
  chrome.alarms.create('refreshBlocklist', {
    periodInMinutes: intervalMinutes,
    delayInMinutes: intervalMinutes // first run after interval
  });
}

// Listen for alarm and refresh.
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'refreshBlocklist') {
    fetchBlocklist();
  }
});

// Provide the blocklist to content scripts (they can fetch from storage directly,
// but we also expose a helper to get it on demand via messaging if needed).
// Content script will read from chrome.storage.local directly to avoid extra overhead.
