// ─────────────────────────────────────────────────────────────────────────────
//  FLYING LYRICS — LRCLIB PROVIDER ADAPTER (background context)
// ─────────────────────────────────────────────────────────────────────────────

function normalizeLrcLib(item) {
    const hasLyrics = !!(item.syncedLyrics || item.plainLyrics);
    const isEmpty = !hasLyrics || !!item.instrumental;
    let rawLyric = item.syncedLyrics || item.plainLyrics || '';
    if (isEmpty && !rawLyric) {
        rawLyric = "[00:00.00] ♫ (Empty) ♫";
    }
    return {
        source:       'lrclib',
        id:           item.id,
        trackName:    item.trackName  || '',
        artistName:   item.artistName || '',
        albumName:    item.albumName  || '',
        duration:     item.duration   || 0,
        // Pre-resolved: LRCLIB always returns the full lyric text in the search response
        synced:       !!item.syncedLyrics || !!item.instrumental,
        rawLyric:     rawLyric,
        instrumental: !!item.instrumental,
        isEmpty:      isEmpty
    };
}

function fetchLrcLibRaw(id, timeoutMs) {
    const fetchFn = typeof fetchWithTimeout === 'function' ? fetchWithTimeout : fetch;
    const defaultMs = typeof DEFAULT_TIMEOUT_MS !== 'undefined' ? DEFAULT_TIMEOUT_MS : 5000;
    return fetchFn(`https://lrclib.net/api/get/${id}`, timeoutMs || defaultMs)
        .then(r => r.ok ? r.json() : null)
        .catch(() => null);
}

// Global scope export for MV3 Service Worker importScripts compatibility
globalThis.LRCLIB_PROVIDER = {
    normalizeLrcLib,
    fetchLrcLibRaw
};
