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
        playlist: null,
        limit: 50,
        refresh: false,
        clearCache: false,
        delayMs: 150
    };

    for (let i = 0; i < args.length; i++) {
        const arg = args[i];
        if (arg === '--all') options.all = true;
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

    if (options.playlist) {
        const found = allPlaylists.find(p => p.id.toLowerCase() === options.playlist.toLowerCase());
        if (!found) {
            console.error(`❌ Playlist "${options.playlist}" not found. Available IDs: ${allPlaylists.map(p => p.id).join(', ')}`);
            process.exit(1);
        }
        targets = [found];
    } else if (options.all) {
        targets = allPlaylists;
    } else {
        // Default to Global Top 50 if nothing specified
        targets = [allPlaylists[0]];
        console.log(`ℹ️  No playlist specified. Defaulting to "${allPlaylists[0].name}". (Use --all for all playlists)`);
    }

    const benchmarkResults = [];

    for (const playlist of targets) {
        console.log(`\n🎧 Benchmarking: ${playlist.name}...`);

        let tracks = [];
        try {
            tracks = await getPlaylistTracks(playlist, options.refresh);
        } catch (e) {
            console.error(`⚠️  Failed to fetch ${playlist.name}: ${e.message}`);
            continue;
        }

        const runTracks = tracks.slice(0, options.limit);
        let success = 0;
        let noMatch = 0;
        let noLyrics = 0;

        for (let idx = 0; idx < runTracks.length; idx++) {
            const track = runTracks[idx];
            process.stdout.write(`  [${idx + 1}/${runTracks.length}] Testing: "${track.title}" - ${track.artist}... `);

            try {
                const result = await benchmarkSearchTrack(track.title, track.artist, track.durationSec);

                if (result.status === 'SUCCESS') {
                    success++;
                    console.log(`\x1b[32m✔ SUCCESS\x1b[0m (${result.bestMatch?.source || 'api'})`);
                } else if (result.status === 'NO_MATCH') {
                    noMatch++;
                    console.log(`\x1b[33m✖ NO MATCH\x1b[0m (Found ${result.candidateCount} candidates, score/duration too low)`);
                } else {
                    noLyrics++;
                    console.log(`\x1b[31m✖ NO LYRICS\x1b[0m (0 candidates in provider database)`);
                }
            } catch (err) {
                noMatch++;
                console.log(`\x1b[31m✖ ERROR\x1b[0m (${err.message})`);
            }

            if (options.delayMs > 0) {
                await sleep(options.delayMs);
            }
        }

        const total = runTracks.length;
        const successRate = total > 0 ? Math.round((success / total) * 100) : 0;

        benchmarkResults.push({
            id: playlist.id,
            name: playlist.name,
            successRate,
            success,
            noMatch,
            noLyrics,
            total
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
