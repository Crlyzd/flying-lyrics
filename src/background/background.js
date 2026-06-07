// Import unified search engine and romanizer helper
importScripts('romanizer.js', 'searchEngine.js');

chrome.runtime.onInstalled.addListener((details) => {
    chrome.runtime.setUninstallURL("https://forms.gle/QW6mLFdV1JnkVuzx9");

    // Open the update notification page whenever the Web Store pushes an update.
    // ("install" is skipped so first-time installs don't see the review prompt immediately.)
    if (details.reason === 'update') {
        chrome.tabs.create({
            url: chrome.runtime.getURL('src/pages/update.html')
        });
    }
});

// ─────────────────────────────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'FOCUS_TAB' && sender.tab) {
        // 1. Focus the tab itself
        chrome.tabs.update(sender.tab.id, { active: true });

        chrome.windows.update(sender.tab.windowId, { focused: true });

        sendResponse({ status: 'ok' });
    }

    // ── Direct Netease ID lookup (used by manual override resolution in services.js) ──
    if (message.type === 'FETCH_NETEASE') {
        const { id } = message.payload;
        if (!id) { sendResponse({ lyric: '' }); return false; }

        fetchNeteaseRaw(id)
            .then(lyric => sendResponse({ lyric, id }))
            .catch(() => sendResponse({ lyric: '' }));
        return true;
    }

    // ── Direct LRCLIB ID lookup (used by manual override resolution in services.js) ──
    if (message.type === 'FETCH_LRCLIB') {
        const { id } = message.payload;
        if (!id) { sendResponse(null); return false; }

        fetchLrcLibRaw(id)
            .then(data => sendResponse(data))
            .catch(() => sendResponse(null));
        return true;
    }

    // ── Unified Manual Search (called by popup.js) ────────────────────────────
    if (message.type === 'UNIFIED_SEARCH') {
        const { query, duration, cleanArtist, cleanTitle } = message.payload;
        manualSearch(query, duration || 0, cleanArtist || '', cleanTitle || '')
            .then(results => sendResponse({ results }))
            .catch(() => sendResponse({ results: [] }));
        return true;
    }

    // ── Unified Auto Search (called by services.js) ───────────────────────────
    if (message.type === 'UNIFIED_AUTO_SEARCH') {
        const { rawArtist, rawTitle, duration } = message.payload;
        getBestAutoMatch(rawArtist || '', rawTitle || '', duration || 0)
            .then(result => sendResponse({ result }))
            .catch(() => sendResponse({ result: null }));
        return true;
    }
});
