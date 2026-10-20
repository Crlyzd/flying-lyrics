// ─────────────────────────────────────────────────────────────────────────────
//  FLYING LYRICS — SEARCH NETWORK UTILITIES & INSTRUMENTATION (background context)
// ─────────────────────────────────────────────────────────────────────────────

const DEFAULT_TIMEOUT_MS = 5000;

const EXTENSION_VERSION = (typeof chrome !== 'undefined' && chrome.runtime?.getManifest)
    ? (chrome.runtime.getManifest()?.version || '5.3.0') : '5.3.0';

const LRCLIB_CLIENT_HEADERS = {
    'Lrclib-Client': `FlyingLyrics/${EXTENSION_VERSION} (https://github.com/Crlyzd/flying-lyrics)`,
    'X-User-Agent':  `FlyingLyrics/${EXTENSION_VERSION} (https://github.com/Crlyzd/flying-lyrics)`
};

function getCanonicalEndpoint(url) {
    if (!url) return 'unknown';
    if (url.includes('lrclib.net/api/get')) return 'lrclib_get';
    if (url.includes('lrclib.net/api/search')) return 'lrclib_search';
    if (url.includes('music.163.com/api/song/lyric')) return 'netease_lyric';
    if (url.includes('music.163.com/api/cloudsearch')) return 'netease_search';
    if (url.includes('lyrics.kugou.com/download')) return 'kugou_download';
    if (url.includes('lyrics.kugou.com/search')) return 'kugou_search';
    if (url.includes('msearch.kugou.com') || url.includes('/api/v3/search/song')) return 'kugou_song_search';
    if (url.includes('translate.googleapis.com')) return 'google_translate';

    try {
        const parsed = new URL(url);
        return `${parsed.hostname}${parsed.pathname.split('/').slice(0, 3).join('/')}`;
    } catch {
        return url.split('?')[0];
    }
}

function getLatencyRange(ms) {
    if (ms <= 200) return 'under_200ms';
    if (ms <= 500) return '200ms_500ms';
    if (ms <= 1000) return '500ms_1s';
    if (ms <= 2000) return '1s_2s';
    if (ms <= 5000) return '2s_5s';
    return 'over_5s';
}

function fetchWithTimeout(url, timeoutMs, options = {}) {
    const startTime = performance.now();
    const controller = new AbortController();
    const activeTimeout = timeoutMs || DEFAULT_TIMEOUT_MS;
    const id = setTimeout(() => controller.abort(), activeTimeout);
    const endpoint = getCanonicalEndpoint(url);

    const headers = { ...(options.headers || {}) };
    if (url.includes('lrclib.net')) {
        Object.assign(headers, LRCLIB_CLIENT_HEADERS);
    }

    return fetch(url, { ...options, headers, signal: controller.signal })
        .then(async res => {
            clearTimeout(id);
            const latency = Math.round(performance.now() - startTime);
            const latencyRange = getLatencyRange(latency);
            if (typeof trackEvent === 'function') {
                trackEvent('api_latency', {
                    endpoint: endpoint,
                    latency_range: latencyRange,
                    latency_ms: latency,
                    status: res.status
                });
                if (res.status === 429) {
                    trackEvent('rate_limited', { endpoint: endpoint });
                }
            }

            // Resilient single-backoff retry on LRCLIB 503 (ServerOverloaded) or 429
            if ((res.status === 503 || res.status === 429) && url.includes('lrclib.net') && !options._retryCount) {
                const retryAfterHeader = res.headers.get('retry-after');
                const parsedSec = retryAfterHeader ? parseInt(retryAfterHeader, 10) : 1;
                const delayMs = Math.min(Math.max(isNaN(parsedSec) ? 1000 : parsedSec * 1000, 500), 1500);
                const remainingBudget = activeTimeout - (performance.now() - startTime);

                if (remainingBudget > (delayMs + 300)) {
                    await new Promise(r => setTimeout(r, delayMs));
                    return fetchWithTimeout(url, Math.round(remainingBudget - delayMs), {
                        ...options,
                        headers,
                        _retryCount: 1
                    });
                }
            }

            return res;
        })
        .catch(err => {
            clearTimeout(id);
            const latency = Math.round(performance.now() - startTime);
            const latencyRange = getLatencyRange(latency);
            if (typeof trackEvent === 'function') {
                const errName = err.name === 'AbortError' ? 'timeout' : (err.message || err.name || 'network_error');
                trackEvent('api_latency', {
                    endpoint: endpoint,
                    latency_range: latencyRange,
                    latency_ms: latency,
                    error: errName
                });
            }
            throw err;
        });
}

// Global scope export for MV3 Service Worker importScripts compatibility
globalThis.SEARCH_NETWORK = {
    DEFAULT_TIMEOUT_MS,
    getCanonicalEndpoint,
    getLatencyRange,
    fetchWithTimeout
};
