#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getPlaylistTracks } from './fetcher.js';
import { benchmarkSearchTrack } from './engine/searchEngine.js';
import { generateMarkdownReport, printConsoleReport } from './reporter.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PLAYLISTS_FILE = path.join(__dirname, '../data/playlists.json');
const CACHE_DIR = path.join(__dirname, '../data/cache');

function parseArgs() {
    const args = process.argv.slice(2);
    const options = {
        all: false,
        wide: false,
        cjk: false,
        playlist: null,
        limit: null,
        refresh: false,
        clearCache: false,
        delayMs: 150
    };

    for (let i = 0; i < args.length; i++) {
        const arg = args[i];
        if (arg === '--all') options.all = true;
        else if (arg === '--wide') options.wide = true;
        else if (arg === '--cjk') options.cjk = true;
        else if (arg === '--playlist' || arg === '-p') options.playlist = args[++i];
        else if (arg === '--limit' || arg === '-l') options.limit = parseInt(args[++i], 10);
        else if (arg === '--refresh' || arg === '-r') options.refresh = true;
        else if (arg === '--clear-cache') options.clearCache = true;
        else if (arg === '--delay') options.delayMs = parseInt(args[++i], 10);
    }

    return options;
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function main() {
    const options = parseArgs();

    if (options.clearCache) {
        if (fs.existsSync(CACHE_DIR)) {
            fs.rmSync(CACHE_DIR, { recursive: true, force: true });
            console.log('🧹 Cache cleared successfully.');
        }
        return;
    }

    if (!fs.existsSync(PLAYLISTS_FILE)) {
        console.error('❌ Missing data/playlists.json');
        process.exit(1);
    }

    const allPlaylists = JSON.parse(fs.readFileSync(PLAYLISTS_FILE, 'utf8'));
    let targets = [];
    let isWideMode = false;
    let defaultLimit = 50;

    if (options.all || options.wide) {
        isWideMode = true;
        targets = allPlaylists;
        // Strict ceiling: Wide Benchmark mode MUST limit every country to 50 tracks maximum
        defaultLimit = options.limit !== null ? Math.min(options.limit, 50) : 50;
        console.log(`\n🌍 WIDE BENCHMARK MODE: Benchmarking all ${allPlaylists.length} countries (strictly capped at ${defaultLimit} tracks each)`);
    } else if (options.cjk) {
        targets = allPlaylists.filter(p => p.id === 'jp' || p.id === 'kr');
        defaultLimit = options.limit !== null ? options.limit : 500;
        console.log(`\n🗾 LOCALIZED CJK DEEP BENCHMARK: Benchmarking Japan & South Korea (${defaultLimit} tracks each)`);
    } else if (options.playlist) {
        const found = allPlaylists.find(p => p.id.toLowerCase() === options.playlist.toLowerCase());
        if (!found) {
            console.error(`❌ Playlist "${options.playlist}" not found. Available IDs: ${allPlaylists.map(p => p.id).join(', ')}`);
            process.exit(1);
        }
        targets = [found];
        const isCjk = found.id === 'jp' || found.id === 'kr';
        defaultLimit = options.limit !== null ? options.limit : (isCjk ? 500 : 50);
        const displayName = defaultLimit > 50 ? found.name.replace(/Top 50/i, `Top ${defaultLimit}`) : found.name;
        if (isCjk) {
            console.log(`\n🗾 LOCALIZED CJK BENCHMARK: ${displayName} (target: ${defaultLimit} tracks)`);
        }
    } else {
        // Default to Global Top 50 if nothing specified
        targets = [allPlaylists[0]];
        defaultLimit = options.limit !== null ? options.limit : 50;
        console.log(`ℹ️  No playlist specified. Defaulting to "${allPlaylists[0].name}". (Use --all for wide benchmark or --cjk for JP & KR 500)`);
    }

    const benchmarkResults = [];

    for (const playlist of targets) {
        const targetLimit = isWideMode ? Math.min(defaultLimit, 50) : defaultLimit;
        const isCjkTarget = playlist.id === 'jp' || playlist.id === 'kr';
        const displayName = (isCjkTarget && !isWideMode)
            ? playlist.name.replace(/Top 50/i, 'Top 500')
            : (targetLimit !== 50 ? playlist.name.replace(/Top 50/i, `Top ${targetLimit}`) : playlist.name);

        console.log(`\n🎧 Benchmarking: ${displayName}...`);


        let tracks = [];
        try {
            tracks = await getPlaylistTracks(playlist, options.refresh, targetLimit);
        } catch (e) {
            console.error(`⚠️  Failed to fetch ${displayName}: ${e.message}`);
            continue;
        }

        const runTracks = tracks.slice(0, targetLimit);
        const playlistStartTime = performance.now();
        let success = 0;
        let noMatch = 0;
        let noLyrics = 0;
        let totalLatency = 0;
        let lrclibCount = 0;
        let neteaseCount = 0;

        for (let idx = 0; idx < runTracks.length; idx++) {
            const track = runTracks[idx];
            process.stdout.write(`  [${idx + 1}/${runTracks.length}] Testing: "${track.title}" - ${track.artist}... `);

            const t0 = performance.now();
            try {
                const result = await benchmarkSearchTrack(track.title, track.artist, track.durationSec);
                const latencyMs = Math.round(performance.now() - t0);
                totalLatency += latencyMs;

                if (result.status === 'SUCCESS') {
                    success++;
                    if (result.bestMatch?.source === 'netease') neteaseCount++;
                    else lrclibCount++;
                    const passTag = result.pass ? ` [Pass ${result.pass}]` : '';
                    console.log(`\x1b[32m✔ SUCCESS\x1b[0m (${result.bestMatch?.source || 'api'}${passTag} - \x1b[36m${latencyMs}ms\x1b[0m)`);
                } else if (result.status === 'NO_MATCH') {
                    noMatch++;
                    console.log(`\x1b[33m✖ NO MATCH\x1b[0m (Found ${result.candidateCount} candidates - \x1b[36m${latencyMs}ms\x1b[0m)`);
                } else {
                    noLyrics++;
                    console.log(`\x1b[31m✖ NO LYRICS\x1b[0m (0 candidates - \x1b[36m${latencyMs}ms\x1b[0m)`);
                }
            } catch (err) {
                const latencyMs = Math.round(performance.now() - t0);
                totalLatency += latencyMs;
                noMatch++;
                console.log(`\x1b[31m✖ ERROR\x1b[0m (${err.message} - \x1b[36m${latencyMs}ms\x1b[0m)`);
            }

            if (options.delayMs > 0) {
                await sleep(options.delayMs);
            }
        }

        const total = runTracks.length;
        const successRate = total > 0 ? Math.round((success / total) * 100) : 0;
        const playlistDurationSec = ((performance.now() - playlistStartTime) / 1000).toFixed(1);
        const avgLatencyMs = total > 0 ? Math.round(totalLatency / total) : 0;

        benchmarkResults.push({
            id: playlist.id,
            name: displayName,
            successRate,
            success,
            noMatch,
            noLyrics,
            total,
            avgLatencyMs,
            playlistDurationSec: parseFloat(playlistDurationSec),
            lrclibCount,
            neteaseCount
        });
    }


    if (benchmarkResults.length > 0) {
        printConsoleReport(benchmarkResults);
        const { filepath } = generateMarkdownReport(benchmarkResults);
        console.log(`📄 Markdown report saved to: ${filepath}\n`);
    }
}



main().catch(err => {
    console.error('Fatal benchmark error:', err);
    process.exit(1);
});
