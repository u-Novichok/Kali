// Content script that runs on X/Twitter pages.
// Watches for new posts and hides those from blocked accounts.

// ----- CONFIGURATION (centralized selectors for easy maintenance) -----
const CONFIG = {
  // Selector for individual tweet/article elements.
  TWEET_ARTICLE: 'article[data-testid="tweet"]',
  // Selector for the username link inside a tweet.
  // X often uses a link with @username in a span or inside a div.
  USERNAME_SELECTOR: 'div[data-testid="User-Name"] a[role="link"]',
  // Fallback: if the above doesn't work, we look for any link containing '/'
  // that has an @ in the text (but we'll try the specific one first).
  // We'll also parse the href to get the username.
};

// ----- STATE -----
let blockedUsernames = new Set();
let isObserving = false;
let observer = null;

// ----- HELPERS -----

// Load the blocklist from storage.
async function loadBlocklist() {
  try {
    const result = await chrome.storage.local.get('kali_blocklist');
    const data = result.kali_blocklist;
    if (data && data.accounts && Array.isArray(data.accounts)) {
      blockedUsernames = new Set(data.accounts.map(u => u.toLowerCase()));
      console.log(`[Kali] Loaded ${blockedUsernames.size} blocked usernames.`);
    } else {
      blockedUsernames = new Set();
    }
  } catch (e) {
    console.error('[Kali] Failed to load blocklist:', e);
    blockedUsernames = new Set();
  }
}

// Extract the username from a tweet article.
function getUsernameFromTweet(tweetElement) {
  // Try to find the username link.
  const userLink = tweetElement.querySelector(CONFIG.USERNAME_SELECTOR);
  if (userLink) {
    // The href is like "/username" or "/username/status/..."
    const href = userLink.getAttribute('href');
    if (href && href.startsWith('/')) {
      const parts = href.split('/');
      // Usually the first segment after the leading slash is the username.
      if (parts.length > 1) {
        const username = parts[1].split('?')[0]; // remove any query params
        if (username) return username;
      }
    }
    // Fallback: maybe the text inside is "@username"?
    const text = userLink.textContent.trim();
    if (text.startsWith('@')) {
      return text.substring(1);
    }
  }
  // Alternative: look for any link with "/" and that has @ in text? 
  // We'll try to find a link inside the tweet that points to a user profile.
  // Many tweets have a <a href="/username"> with display name, not always @.
  // But we can also check for a span with data-testid="User-Name" and then extract.
  const nameDiv = tweetElement.querySelector('div[data-testid="User-Name"]');
  if (nameDiv) {
    const links = nameDiv.querySelectorAll('a[role="link"]');
    for (const link of links) {
      const href = link.getAttribute('href');
      if (href && href.startsWith('/') && !href.includes('/status/')) {
        const parts = href.split('/');
        if (parts.length > 1) {
          const username = parts[1].split('?')[0];
          if (username) return username;
        }
      }
    }
  }
  // If all else fails, return null.
  return null;
}

// Hide the tweet if its username is in the blocklist.
function processTweet(tweet) {
  // Check if already hidden to avoid duplicate processing
  if (tweet.dataset.kaliProcessed === 'true') return;
  tweet.dataset.kaliProcessed = 'true';

  const username = getUsernameFromTweet(tweet);
  if (username && blockedUsernames.has(username.toLowerCase())) {
    // Hide the tweet
    tweet.style.display = 'none';
    // Optionally add a class for future styling
    tweet.classList.add('kali-hidden');
  }
}

// Process all currently visible tweets on the page.
function processAllTweets() {
  const tweets = document.querySelectorAll(CONFIG.TWEET_ARTICLE);
  for (const tweet of tweets) {
    processTweet(tweet);
  }
}

// ----- MUTATION OBSERVER -----

function startObserving() {
  if (isObserving) return;
  const targetNode = document.body;
  if (!targetNode) return;

  observer = new MutationObserver((mutations) => {
    // Check if any added nodes contain tweets.
    for (const mutation of mutations) {
      for (const addedNode of mutation.addedNodes) {
        if (addedNode.nodeType === Node.ELEMENT_NODE) {
          // If the added node itself is a tweet, process it.
          if (addedNode.matches && addedNode.matches(CONFIG.TWEET_ARTICLE)) {
            processTweet(addedNode);
          } else {
            // Otherwise, look for tweets inside it.
            const tweets = addedNode.querySelectorAll ? addedNode.querySelectorAll(CONFIG.TWEET_ARTICLE) : [];
            for (const tweet of tweets) {
              processTweet(tweet);
            }
          }
        }
      }
    }
  });

  observer.observe(targetNode, {
    childList: true,
    subtree: true
  });
  isObserving = true;
  console.log('[Kali] MutationObserver started.');
}

// ----- INITIALIZATION -----

async function init() {
  // Load blocklist
  await loadBlocklist();
  // Process existing tweets
  processAllTweets();
  // Start observing new tweets
  startObserving();
}

// Re-initialize when blocklist changes (e.g., after manual sync).
// We can listen for storage changes to reload and re-process.
chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName === 'local' && changes.kali_blocklist) {
    // Reload blocklist and re-process all tweets.
    loadBlocklist().then(() => {
      // Reset processed flag so we re-evaluate all tweets.
      const allTweets = document.querySelectorAll(CONFIG.TWEET_ARTICLE);
      for (const tweet of allTweets) {
        tweet.dataset.kaliProcessed = 'false';
        // Remove any hidden style (we'll re-apply if needed)
        tweet.style.display = '';
        tweet.classList.remove('kali-hidden');
      }
      processAllTweets();
    });
  }
});

// Start when DOM is ready.
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
