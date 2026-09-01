import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const CACHE_DIR = path.join(__dirname, '../data/cache');

if (!fs.existsSync(CACHE_DIR)) {
    fs.mkdirSync(CACHE_DIR, { recursive: true });
}

export async function getPlaylistTracks(playlist, forceRefresh = false, requestedLimit = 50) {
    const isDeepCjk = (playlist.id === 'jp' || playlist.id === 'kr') && requestedLimit > 50;
    const cacheFile = isDeepCjk
        ? path.join(CACHE_DIR, `${playlist.id}_top500.json`)
        : path.join(CACHE_DIR, `${playlist.id}_top50.json`);

    if (!forceRefresh && fs.existsSync(cacheFile)) {
        try {
            const raw = fs.readFileSync(cacheFile, 'utf8');
            const data = JSON.parse(raw);
            if (Array.isArray(data) && data.length > 0) {
                return data.slice(0, requestedLimit);
            }
        } catch (e) {
            // Corrupt cache file, proceed to fetch
        }
    }

    const displayName = isDeepCjk ? playlist.name.replace(/Top 50/i, `Top 500`) : playlist.name;
    console.log(`[Fetcher] Fetching playlist metadata for ${displayName}...`);

    // Strategy 0: Kworb Totals for localized CJK deep benchmark
    if (isDeepCjk) {
        try {
            const tracks = await fetchKworbTotalsTracks(playlist.region, 500);
            if (tracks && tracks.length > 0) {
                fs.writeFileSync(cacheFile, JSON.stringify(tracks, null, 2), 'utf8');
                return tracks.slice(0, requestedLimit);
            }
        } catch (e) {
            console.warn(`[Fetcher] Kworb totals error for ${playlist.region}:`, e.message);
        }
    }

    // Strategy 1: Spotify Embed Page
    if (playlist.spotifyPlaylistId) {
        try {
            const tracks = await fetchSpotifyEmbedTracks(playlist.spotifyPlaylistId);
            if (tracks && tracks.length > 0) {
                fs.writeFileSync(cacheFile, JSON.stringify(tracks, null, 2), 'utf8');
                return tracks.slice(0, requestedLimit);
            }
        } catch (e) {
            // Fall through to Strategy 2
        }
    }

    // Strategy 2: Kworb Spotify Daily Charts Fallback
    if (playlist.region) {
        try {
            const tracks = await fetchKworbSpotifyTracks(playlist.region, 50);
            if (tracks && tracks.length > 0) {
                fs.writeFileSync(cacheFile, JSON.stringify(tracks, null, 2), 'utf8');
                return tracks.slice(0, requestedLimit);
            }
        } catch (e) {
            console.warn(`[Fetcher] Kworb fallback error for ${playlist.region}:`, e.message);
        }
    }

    throw new Error(`Failed to fetch tracks for ${playlist.name}`);
}

async function fetchSpotifyEmbedTracks(playlistId) {
    const url = `https://open.spotify.com/embed/playlist/${playlistId}`;
    const response = await fetch(url, {
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
        }
    });

    if (!response.ok) return [];

    const html = await response.text();
    const nextDataMatch = html.match(/<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/);
    if (nextDataMatch && nextDataMatch[1]) {
        try {
            const json = JSON.parse(nextDataMatch[1]);
            const entity = json.props?.pageProps?.state?.data?.entity;
            const trackList = entity?.trackList || [];

            if (trackList.length > 0) {
                return trackList.map(t => ({
                    title: t.title || t.name,
                    artist: t.subtitle || (t.artists && t.artists[0]?.name) || '',
                    durationSec: Math.round((t.duration || 0) / 1000),
                    spotifyId: t.uri ? t.uri.replace('spotify:track:', '') : (t.id || '')
                })).filter(t => t.title && t.artist);
            }
        } catch (e) {
            // Ignore parse errors
        }
    }

    return [];
}

async function fetchKworbSpotifyTracks(regionCode, maxLimit = 50) {
    const regionKey = regionCode.toLowerCase() === 'global' ? 'global' : regionCode.toLowerCase();
    const url = `https://kworb.net/spotify/country/${regionKey}_daily.html`;

    const response = await fetch(url, {
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
    });

    if (!response.ok) return [];

    const html = await response.text();
    const tracks = [];
    const regex = /<td class="text mp"><div><a[^>]*>(.*?)<\/a>\s*-\s*<a href="\.\.\/track\/([a-zA-Z0-9]+)\.html">(.*?)<\/a><\/div><\/td>/g;

    let match;
    while ((match = regex.exec(html)) !== null && tracks.length < maxLimit) {
        const artist = match[1].replace(/&#(\d+);/g, (_, dec) => String.fromCharCode(dec)).replace(/&amp;/g, '&');
        const spotifyId = match[2];
        const title = match[3].replace(/&#(\d+);/g, (_, dec) => String.fromCharCode(dec)).replace(/&amp;/g, '&');

        tracks.push({
            title,
            artist,
            durationSec: 0, // Will match by title + artist in benchmark
            spotifyId
        });
    }

    return tracks;
}

async function fetchKworbTotalsTracks(regionCode, maxTracks = 500) {
    const regionKey = regionCode.toLowerCase();
    const url = `https://kworb.net/spotify/country/${regionKey}_daily_totals.html`;

    const response = await fetch(url, {
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
    });

    if (!response.ok) return [];

    const html = await response.text();
    const tracks = [];
    const regex = /<td class="text mp"><div><a[^>]*>(.*?)<\/a>\s*-\s*<a href="\.\.\/track\/([a-zA-Z0-9]+)\.html">(.*?)<\/a><\/div><\/td>/g;

    let match;
    while ((match = regex.exec(html)) !== null && tracks.length < maxTracks) {
        const artist = match[1].replace(/&#(\d+);/g, (_, dec) => String.fromCharCode(dec)).replace(/&amp;/g, '&');
        const spotifyId = match[2];
        const title = match[3].replace(/&#(\d+);/g, (_, dec) => String.fromCharCode(dec)).replace(/&amp;/g, '&');

        tracks.push({
            title,
            artist,
            durationSec: 0,
            spotifyId
        });
    }

    return tracks;
}

