// ─────────────────────────────────────────────────────────────────────────────
//  FLYING LYRICS — NETEASE PROVIDER ADAPTER (background context)
// ─────────────────────────────────────────────────────────────────────────────

function normalizeNetease(song) {
    return {
        source:     'netease',
        id:         song.id,
        trackName:  song.name                              || '',
        artistName: song.ar ? song.ar.map(a => a.name).join(', ') : '',
        albumName:  song.al ? song.al.name                 : '',
        duration:   song.dt ? Math.floor(song.dt / 1000)  : 0,
        // Unknown until we lazily fetch the raw lyric string
        synced:     null,
        rawLyric:   null,
    };
}

/** Fetches the raw Netease lyric data (main lrc, tlyric, romalrc) for a specific song ID. */
function fetchNeteaseRaw(id, timeoutMs) {
    const fetchFn = typeof fetchWithTimeout === 'function' ? fetchWithTimeout : fetch;
    const defaultMs = typeof DEFAULT_TIMEOUT_MS !== 'undefined' ? DEFAULT_TIMEOUT_MS : 5000;
    return fetchFn(`https://music.163.com/api/song/lyric?id=${id}&lv=1&tv=-1`, timeoutMs || defaultMs)
        .then(r => r.json())
        .then(data => ({
            lyric: data?.lrc?.lyric || '',
            tlyric: data?.tlyric?.lyric || '',
            romalrc: data?.romalrc?.lyric || ''
        }))
        .catch(() => ({ lyric: '', tlyric: '', romalrc: '' }));
}

// Global scope export for MV3 Service Worker importScripts compatibility
globalThis.NETEASE_PROVIDER = {
    normalizeNetease,
    fetchNeteaseRaw
};
