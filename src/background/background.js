// Import telemetry module, unified search engine, and romanizer helper
importScripts('storage.js', 'analytics.js', 'romanizer.js', 'searchEngine.js');

// Detect unpacked developer environment (!update_url in manifest)
const IS_DEV_MODE = !('update_url' in chrome.runtime.getManifest());

chrome.runtime.onInstalled.addListener((details) => {
    chrome.runtime.setUninstallURL("https://forms.gle/QW6mLFdV1JnkVuzx9");

    FLYING_LYRICS.storage.get({ devSuppressOnboarding: true }, (items) => {
        const shouldSuppress = IS_DEV_MODE && items.devSuppressOnboarding !== false;

        if (details.reason === 'install') {
            FLYING_LYRICS.storage.set({ 
                telemetryConsent: true,
                needsOnboardingTour: !shouldSuppress,
                onboardingTourStep: 0,
                firstInstalledAt: Date.now()
            }, () => {
                if (!shouldSuppress) {
                    chrome.tabs.create({
                        url: chrome.runtime.getURL('src/pages/welcome.html')
                    }, (tab) => {
                        if (tab && tab.id) {
                            FLYING_LYRICS.storage.set({ welcomeTabId: tab.id });
                        }
                    });
                } else {
                    console.log('[Flying Lyrics:Dev] Clean install detected — Welcome tab and auto-tour suppressed.');
                }
            });
        } else if (details.reason === 'update') {
            if (!shouldSuppress) {
                chrome.tabs.create({
                    url: chrome.runtime.getURL('src/pages/welcome.html?reason=update')
                });
            } else {
                console.log('[Flying Lyrics:Dev] Extension reload/update detected — Welcome tab and auto-tour suppressed.');
            }

            FLYING_LYRICS.storage.set({
                needsOnboardingTour: !shouldSuppress,
                onboardingTourStep: 0,
                hasReviewed: false,
                popupOpenCount: 0,
                snoozeUntilCount: 0,
                milestone7DayShown: false,
                reviewToastPending: false,
                reviewToastBaseTime: Date.now()
            });
        }
    });
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
            .then(res => {
                const lyric = typeof res === 'string' ? res : (res?.lyric || '');
                const tlyric = typeof res === 'object' ? (res?.tlyric || '') : '';
                const romalrc = typeof res === 'object' ? (res?.romalrc || '') : '';
                sendResponse({ lyric, tlyric, romalrc, id });
            })
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
        if (!IS_DEV_MODE) {
            manualSearch(query, duration || 0, cleanArtist || '', cleanTitle || '', timeoutMs)
                .then(({ results, hasTimeout }) => sendResponse({ results, hasTimeout }))
                .catch(() => sendResponse({ results: [], hasTimeout: false }));
            return true;
        }
        chrome.storage.local.get({ devSimulateSearch: 'none' }, (items) => {
            const sim = items.devSimulateSearch || 'none';
            if (sim === 'force_all_down') {
                sendResponse({ results: [], hasTimeout: false });
                return;
            }
            const delay = (sim === 'simulate_latency') ? 5000 : 0;
            setTimeout(() => {
                manualSearch(query, duration || 0, cleanArtist || '', cleanTitle || '', timeoutMs, sim)
                    .then(({ results, hasTimeout }) => sendResponse({ results, hasTimeout }))
                    .catch(() => sendResponse({ results: [], hasTimeout: false }));
            }, delay);
        });
        return true;
    }

    // ── Unified Auto Search (called by services.js) ───────────────────────────
    if (message.type === 'UNIFIED_AUTO_SEARCH') {
        const { rawArtist, rawTitle, duration, timeoutMs } = message.payload;
        if (!IS_DEV_MODE) {
            getBestAutoMatch(rawArtist || '', rawTitle || '', duration || 0, timeoutMs)
                .then(result => sendResponse({ result }))
                .catch(() => sendResponse({ result: null }));
            return true;
        }
        chrome.storage.local.get({ devSimulateSearch: 'none' }, (items) => {
            const sim = items.devSimulateSearch || 'none';
            if (sim === 'force_all_down') {
                sendResponse({ result: null });
                return;
            }
            const delay = (sim === 'simulate_latency') ? 5000 : 0;
            setTimeout(() => {
                getBestAutoMatch(rawArtist || '', rawTitle || '', duration || 0, timeoutMs, sim)
                    .then(result => sendResponse({ result }))
                    .catch(() => sendResponse({ result: null }));
            }, delay);
        });
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
