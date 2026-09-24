// Import telemetry module, romanizer helper, and modular search engine components
importScripts(
    'storage.js',
    'analytics.js',
    'romanizer.js',
    'search/sanitizer.js',
    'search/scoring.js',
    'search/network.js',
    'search/providers/lrclib.js',
    'search/providers/netease.js',
    'search/providers/kugou.js',
    'searchEngine.js'
);

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

    // ── Helper: Resolve search simulator config (pills or legacy fallback) ──
    function getDevSearchSimulatorConfig(callback) {
        chrome.storage.local.get({
            devSearchProviders: null,
            devSearchLatency: false,
            devSimulateSearch: 'none'
        }, (items) => {
            let providers = items.devSearchProviders;
            let latency = !!items.devSearchLatency;

            if (!providers && items.devSimulateSearch) {
                const sim = items.devSimulateSearch;
                providers = {
                    lrclib: sim !== 'force_lrclib_down' && sim !== 'force_lrclib_netease_down' && sim !== 'force_all_down',
                    netease: sim !== 'force_netease_down' && sim !== 'force_lrclib_netease_down' && sim !== 'force_all_down',
                    kugou: sim !== 'force_kugou_down' && sim !== 'force_all_down'
                };
                if (sim === 'simulate_latency') latency = true;
            }

            callback({
                providers: {
                    lrclib: providers?.lrclib !== false,
                    netease: providers?.netease !== false,
                    kugou: providers?.kugou !== false
                },
                latency
            });
        });
    }

    // ── Direct Netease ID lookup (used by manual override resolution in services.js) ──
    if (message.type === 'FETCH_NETEASE') {
        const { id, timeoutMs } = message.payload;
        if (!id) { sendResponse(null); return false; }

        if (IS_DEV_MODE) {
            getDevSearchSimulatorConfig(({ providers }) => {
                if (!providers.netease) {
                    sendResponse(null);
                    return;
                }
                fetchNeteaseRaw(id, timeoutMs)
                    .then(res => {
                        const lyric = typeof res === 'string' ? res : (res?.lyric || '');
                        const tlyric = typeof res === 'object' ? (res?.tlyric || '') : '';
                        const romalrc = typeof res === 'object' ? (res?.romalrc || '') : '';
                        sendResponse({ lyric, tlyric, romalrc, id });
                    })
                    .catch(() => sendResponse(null));
            });
            return true;
        }

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

        if (IS_DEV_MODE) {
            getDevSearchSimulatorConfig(({ providers }) => {
                if (!providers.lrclib) {
                    sendResponse(null);
                    return;
                }
                fetchLrcLibRaw(id, timeoutMs)
                    .then(data => sendResponse(data))
                    .catch(() => sendResponse(null));
            });
            return true;
        }

        fetchLrcLibRaw(id, timeoutMs)
            .then(data => sendResponse(data))
            .catch(() => sendResponse(null));
        return true;
    }

    // ── Direct KuGou lookup (used by manual override resolution in services.js) ──
    if (message.type === 'FETCH_KUGOU') {
        const { id, accesskey, timeoutMs } = message.payload;
        if (!id || !accesskey) { sendResponse(null); return false; }

        if (IS_DEV_MODE) {
            getDevSearchSimulatorConfig(({ providers }) => {
                if (!providers.kugou) {
                    sendResponse(null);
                    return;
                }
                fetchKugouRaw(id, accesskey, timeoutMs)
                    .then(res => sendResponse(res))
                    .catch(() => sendResponse(null));
            });
            return true;
        }

        fetchKugouRaw(id, accesskey, timeoutMs)
            .then(res => sendResponse(res))
            .catch(() => sendResponse(null));
        return true;
    }

    // ── Unified Manual Search (called by popup.js) ────────────────────────────
    if (message.type === 'UNIFIED_SEARCH') {
        const { query, duration, cleanArtist, cleanTitle, timeoutMs } = message.payload;
        if (!IS_DEV_MODE) {
            manualSearch(query, duration || 0, cleanArtist || '', cleanTitle || '', timeoutMs)
                .then(({ results, hasTimeout, isNetworkError }) => sendResponse({ results, hasTimeout, isNetworkError }))
                .catch(() => sendResponse({ results: [], hasTimeout: false, isNetworkError: true }));
            return true;
        }
        getDevSearchSimulatorConfig(({ providers, latency }) => {
            if (!providers.lrclib && !providers.netease && !providers.kugou) {
                sendResponse({ results: [], hasTimeout: false, isNetworkError: true });
                return;
            }
            const delay = latency ? 5000 : 0;
            setTimeout(() => {
                manualSearch(query, duration || 0, cleanArtist || '', cleanTitle || '', timeoutMs, providers)
                    .then(({ results, hasTimeout, isNetworkError }) => sendResponse({ results, hasTimeout, isNetworkError }))
                    .catch(() => sendResponse({ results: [], hasTimeout: false, isNetworkError: true }));
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
                .catch(() => sendResponse({ result: { rawLyric: null, source: null, synced: false, isNetworkError: true } }));
            return true;
        }
        getDevSearchSimulatorConfig(({ providers, latency }) => {
            if (!providers.lrclib && !providers.netease && !providers.kugou) {
                sendResponse({ result: { rawLyric: null, source: null, synced: false, isNetworkError: true } });
                return;
            }
            const delay = latency ? 5000 : 0;
            setTimeout(() => {
                getBestAutoMatch(rawArtist || '', rawTitle || '', duration || 0, timeoutMs, providers)
                    .then(result => sendResponse({ result }))
                    .catch(() => sendResponse({ result: { rawLyric: null, source: null, synced: false, isNetworkError: true } }));
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
