// ─────────────────────────────────────────────────────────────────────────────
//  FLYING LYRICS — SEARCH NETWORK UTILITIES & INSTRUMENTATION (background context)
// ─────────────────────────────────────────────────────────────────────────────

const DEFAULT_TIMEOUT_MS = 5000;

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

function fetchWithTimeout(url, timeoutMs) {
    const startTime = performance.now();
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeoutMs || DEFAULT_TIMEOUT_MS);
    const endpoint = getCanonicalEndpoint(url);

    return fetch(url, { signal: controller.signal })
        .then(res => {
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
