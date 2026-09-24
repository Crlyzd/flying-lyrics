// ─────────────────────────────────────────────────────────────────────────────
//  FLYING LYRICS — KUGOU PROVIDER ADAPTER (background context)
// ─────────────────────────────────────────────────────────────────────────────

function normalizeKugou(item) {
    return {
        source:       'kugou',
        id:           String(item.id || ''),
        accesskey:    String(item.accesskey || ''),
        trackName:    item.song || '',
        artistName:   item.singer || '',
        albumName:    '',
        duration:     item.duration ? Math.floor(item.duration / 1000) : 0,
        synced:       null,
        rawLyric:     null,
        isEmpty:      false,
        instrumental: false
    };
}

function decodeBase64Utf8(base64Str) {
    if (!base64Str) return '';
    try {
        const binary = atob(base64Str);
        const bytes = Uint8Array.from(binary, ch => ch.charCodeAt(0));
        return new TextDecoder('utf-8').decode(bytes);
    } catch {
        return '';
    }
}

/** Fetches the raw KuGou lyric data (decoded from Base64 UTF-8) for a specific song ID and access key. */
function fetchKugouRaw(id, accesskey, timeoutMs) {
    if (!id || !accesskey) return Promise.resolve({ lyric: '', id });
    const fetchFn = typeof fetchWithTimeout === 'function' ? fetchWithTimeout : fetch;
    const defaultMs = typeof DEFAULT_TIMEOUT_MS !== 'undefined' ? DEFAULT_TIMEOUT_MS : 5000;

    return fetchFn(
        `https://lyrics.kugou.com/download?ver=1&client=pc&id=${encodeURIComponent(id)}&accesskey=${encodeURIComponent(accesskey)}&fmt=lrc&charset=utf8`,
        timeoutMs || defaultMs
    )
        .then(r => r.json())
        .then(data => ({
            lyric: decodeBase64Utf8(data?.content || ''),
            id: id
        }))
        .catch(() => ({ lyric: '', id }));
}

/**
 * Two-tier search for KuGou:
 * Tier 1: Direct lyric keyword lookup via lyrics.kugou.com/search (fast path for exact matches)
 * Tier 2: Fuzzy song search via msearch.kugou.com/api/v3/search/song -> hash lookup via lyrics.kugou.com/search?hash=
 * Concurrently executes both tiers and deduplicates results by candidate ID.
 */
async function searchKugouCandidates(query, timeoutMs) {
    if (!query) return { candidates: [], ok: false, timedOut: false };

    let anyOk = false;
    let anyTimeout = false;
    const fetchFn = typeof fetchWithTimeout === 'function' ? fetchWithTimeout : fetch;

    // Tier 1: Direct lyric search (fast path for exact matches)
    const directSearchPromise = fetchFn(
        `https://lyrics.kugou.com/search?ver=1&man=yes&client=pc&keyword=${encodeURIComponent(query)}&hash=`,
        timeoutMs
    )
        .then(r => {
            if (r.ok) anyOk = true;
            return r.ok ? r.json() : { candidates: [] };
        })
        .then(d => (Array.isArray(d?.candidates) ? d.candidates : []))
        .catch(err => {
            if (err?.name === 'AbortError' || err?.message?.includes('timeout')) {
                anyTimeout = true;
            }
            return [];
        });

    // Tier 2: Fuzzy song search -> hash lookup
    const songSearchPromise = fetchFn(
        `https://msearch.kugou.com/api/v3/search/song?keyword=${encodeURIComponent(query)}&page=1&pagesize=4`,
        timeoutMs
    )
        .then(r => {
            if (r.ok) anyOk = true;
            return r.ok ? r.json() : null;
        })
        .then(async data => {
            const songs = data?.data?.info || [];
            const hashes = [];
            for (const s of songs) {
                if (s?.hash && !hashes.includes(s.hash)) {
                    hashes.push(s.hash);
                    if (hashes.length >= 2) break;
                }
            }
            if (hashes.length === 0) return [];

            const hashPromises = hashes.map(hash =>
                fetchFn(
                    `https://lyrics.kugou.com/search?ver=1&man=yes&client=pc&keyword=&hash=${encodeURIComponent(hash)}`,
                    timeoutMs
                )
                    .then(r => {
                        if (r.ok) anyOk = true;
                        return r.ok ? r.json() : { candidates: [] };
                    })
                    .then(d => (Array.isArray(d?.candidates) ? d.candidates : []))
                    .catch(err => {
                        if (err?.name === 'AbortError' || err?.message?.includes('timeout')) {
                            anyTimeout = true;
                        }
                        return [];
                    })
            );

            const hashResults = await Promise.all(hashPromises);
            return hashResults.flat();
        })
        .catch(err => {
            if (err?.name === 'AbortError' || err?.message?.includes('timeout')) {
                anyTimeout = true;
            }
            return [];
        });

    const [directRes, songRes] = await Promise.allSettled([directSearchPromise, songSearchPromise]);

    const candidates = [];
    const seen = new Set();
    const lists = [
        directRes.status === 'fulfilled' ? directRes.value : [],
        songRes.status === 'fulfilled' ? songRes.value : []
    ];

    for (const list of lists) {
        if (Array.isArray(list)) {
            for (const item of list) {
                const key = String(item.id || '');
                if (key && !seen.has(key)) {
                    seen.add(key);
                    candidates.push(item);
                }
            }
        }
    }

    return { candidates, ok: anyOk, timedOut: anyTimeout && !anyOk };
}

// Global scope export for MV3 Service Worker importScripts compatibility
globalThis.KUGOU_PROVIDER = {
    normalizeKugou,
    decodeBase64Utf8,
    fetchKugouRaw,
    searchKugouCandidates
};
