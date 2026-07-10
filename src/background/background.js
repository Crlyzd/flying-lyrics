// Import telemetry module, unified search engine, and romanizer helper
importScripts('storage.js', 'analytics.js', 'romanizer.js', 'searchEngine.js');

chrome.runtime.onInstalled.addListener((details) => {
    chrome.runtime.setUninstallURL("https://forms.gle/QW6mLFdV1JnkVuzx9");

    if (details.reason === 'install') {
        // Initialize consent status to true (opt-out default)
        FLYING_LYRICS.storage.set({ telemetryConsent: true }, () => {
            chrome.tabs.create({
                url: chrome.runtime.getURL('src/pages/welcome.html')
            }, (tab) => {
                if (tab && tab.id) {
                    FLYING_LYRICS.storage.set({ welcomeTabId: tab.id });
                }
            });
        });
    } else if (details.reason === 'update') {
        // Open the update notification page whenever the Web Store pushes an update.
        // ("install" is skipped so first-time installs don't see the review prompt immediately.)
        chrome.tabs.create({
            url: chrome.runtime.getURL('src/pages/update.html')
        });
    }
});

// ─────────────────────────────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    // ── Telemetry event routing ──────────────────────────────────────────────
    if (message.type === 'TRACK_EVENT') {
        const { eventName, params } = message.payload;
        trackEvent(eventName, params)
            .then(success => sendResponse({ success }))
            .catch(() => sendResponse({ success: false }));
        return true;
    }

    if (message.type === 'FOCUS_TAB' && sender.tab) {
        // 1. Focus the tab itself
        chrome.tabs.update(sender.tab.id, { active: true });

        chrome.windows.update(sender.tab.windowId, { focused: true });

        sendResponse({ status: 'ok' });
    }

    // ── Direct Netease ID lookup (used by manual override resolution in services.js) ──
    if (message.type === 'FETCH_NETEASE') {
        const { id, timeoutMs } = message.payload;
        if (!id) { sendResponse(null); return false; }

        fetchNeteaseRaw(id, timeoutMs)
            .then(lyric => sendResponse({ lyric, id }))
            .catch(() => sendResponse(null));
        return true;
    }

    // ── Direct LRCLIB ID lookup (used by manual override resolution in services.js) ──
    if (message.type === 'FETCH_LRCLIB') {
        const { id, timeoutMs } = message.payload;
        if (!id) { sendResponse(null); return false; }

        fetchLrcLibRaw(id, timeoutMs)
            .then(data => sendResponse(data))
            .catch(() => sendResponse(null));
        return true;
    }

    // ── Unified Manual Search (called by popup.js) ────────────────────────────
    if (message.type === 'UNIFIED_SEARCH') {
        const { query, duration, cleanArtist, cleanTitle, timeoutMs } = message.payload;
        manualSearch(query, duration || 0, cleanArtist || '', cleanTitle || '', timeoutMs)
            .then(({ results, hasTimeout }) => sendResponse({ results, hasTimeout }))
            .catch(() => sendResponse({ results: [], hasTimeout: false }));
        return true;
    }

    // ── Unified Auto Search (called by services.js) ───────────────────────────
    if (message.type === 'UNIFIED_AUTO_SEARCH') {
        const { rawArtist, rawTitle, duration, timeoutMs } = message.payload;
        getBestAutoMatch(rawArtist || '', rawTitle || '', duration || 0, timeoutMs)
            .then(result => sendResponse({ result }))
            .catch(() => sendResponse({ result: null }));
        return true;
    }
});

// Listen for tab removals to reload music tabs when the welcome page is closed
chrome.tabs.onRemoved.addListener((tabId, removeInfo) => {
    FLYING_LYRICS.storage.get(['welcomeTabId'], (result) => {
        if (result.welcomeTabId === tabId) {
            // Reload any open Spotify or YouTube Music tabs so they load the content scripts
            chrome.tabs.query({}, (tabs) => {
                tabs.forEach(tab => {
                    if (tab.url && (tab.url.includes('open.spotify.com') || tab.url.includes('music.youtube.com'))) {
                        chrome.tabs.reload(tab.id);
                    }
                });
            });
            FLYING_LYRICS.storage.remove('welcomeTabId');
        }
    });
});
