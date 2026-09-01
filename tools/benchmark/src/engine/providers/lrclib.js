/**
 * LRCLIB Provider Client
 */

export async function searchLrclib(title, artist, durationSec) {
    const url = new URL('https://lrclib.net/api/search');
    url.searchParams.set('track_name', title);
    if (artist) url.searchParams.set('artist_name', artist);

    try {
        const res = await fetch(url.toString(), {
            headers: {
                'User-Agent': 'FlyingLyrics-Benchmark/1.0 (https://github.com/Crlyzd/flying-lyrics)'
            },
            signal: AbortSignal.timeout(6000)
        });

        if (!res.ok) return [];

        const data = await res.json();
        if (!Array.isArray(data)) return [];

        return data.map(item => ({
            source: 'lrclib',
            id: item.id,
            trackName: item.trackName || item.name || '',
            artistName: item.artistName || '',
            albumName: item.albumName || '',
            duration: item.duration ? Math.round(item.duration) : 0,
            synced: !!item.syncedLyrics,
            rawLyric: item.syncedLyrics || item.plainLyrics || '',
            instrumental: !!item.instrumental
        }));
    } catch (e) {
        return [];
    }
}
