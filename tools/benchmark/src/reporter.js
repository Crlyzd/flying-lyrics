import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPORTS_DIR = path.join(__dirname, '../reports');
const MANIFEST_PATH = path.resolve(__dirname, '../../../manifest.json');

if (!fs.existsSync(REPORTS_DIR)) {
    fs.mkdirSync(REPORTS_DIR, { recursive: true });
}

/**
 * Dynamically resolves extension version from root manifest.json.
 * Falls back safely if manifest is unavailable.
 */
function getExtensionVersion() {
    try {
        if (fs.existsSync(MANIFEST_PATH)) {
            const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));
            if (manifest && manifest.version) {
                return `v${manifest.version}`;
            }
        }
    } catch {
        // Fallback safely if running in an isolated environment
    }
    return 'v4.9';
}

function formatDuration(sec) {
    if (!sec || sec < 0) return '0s';
    if (sec >= 60) {
        const mins = Math.floor(sec / 60);
        const remSec = Math.round(sec % 60);
        return `${mins}m ${remSec}s`;
    }
    return `${sec}s`;
}

/**
 * Generates a formatted Markdown table matching the benchmark report format.
 */
export function generateMarkdownReport(results, metadata = {}) {
    const dateStr = metadata.date || new Date().toLocaleDateString('en-US', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric'
    });
    const version = metadata.version || getExtensionVersion();

    let md = `# Match Success Rate\n\n`;
    md += `Spotify, ${version}, ${dateStr}\n\n`;
    md += `| Playlist Name | Success rate | Success | No Match | No Lyrics | Avg Latency | Total Time | LRCLIB / NetEase / KuGou |\n`;
    md += `| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |\n`;

    for (const r of results) {
        const timeStr = formatDuration(r.playlistDurationSec);
        const providerRatio = `${r.lrclibCount || 0} / ${r.neteaseCount || 0} / ${r.kugouCount || 0}`;
        md += `| ${r.name} | ${r.successRate}% | ${r.success} | ${r.noMatch} | ${r.noLyrics} | ${r.avgLatencyMs || 0}ms | ${timeStr} | ${providerRatio} |\n`;
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const filename = `benchmark_${timestamp}.md`;
    const filepath = path.join(REPORTS_DIR, filename);
    const latestPath = path.join(REPORTS_DIR, 'latest.md');

    fs.writeFileSync(filepath, md, 'utf8');
    fs.writeFileSync(latestPath, md, 'utf8');

    return { md, filepath, latestPath };
}

/**
 * Prints the results neatly into the terminal console.
 */
export function printConsoleReport(results, metadata = {}) {
    const version = metadata.version || getExtensionVersion();
    console.log('\n================================================================');
    console.log(` 🎵 MATCH SUCCESS RATE BENCHMARK`);
    console.log(` Spotify, ${version}, ${new Date().toLocaleDateString()}`);
    console.log('================================================================\n');

    console.table(results.map(r => ({
        'Playlist Name': r.name,
        'Success rate': `${r.successRate}%`,
        'Success': r.success,
        'No Match': r.noMatch,
        'No Lyrics': r.noLyrics,
        'Avg Latency': `${r.avgLatencyMs || 0}ms`,
        'Total Time': formatDuration(r.playlistDurationSec),
        'LRC / Net / Ku': `${r.lrclibCount || 0} / ${r.neteaseCount || 0} / ${r.kugouCount || 0}`,
        'Total': r.total
    })));

    const totalTracks = results.reduce((sum, r) => sum + r.total, 0);
    const totalSuccess = results.reduce((sum, r) => sum + r.success, 0);
    const totalLrc = results.reduce((sum, r) => sum + (r.lrclibCount || 0), 0);
    const totalNet = results.reduce((sum, r) => sum + (r.neteaseCount || 0), 0);
    const totalKu = results.reduce((sum, r) => sum + (r.kugouCount || 0), 0);
    const overallRate = totalTracks > 0 ? Math.round((totalSuccess / totalTracks) * 100) : 0;
    const avgLatency = totalTracks > 0 ? Math.round(results.reduce((sum, r) => sum + ((r.avgLatencyMs || 0) * r.total), 0) / totalTracks) : 0;

    console.log(`\n✨ Overall Success Rate: ${overallRate}% (${totalSuccess}/${totalTracks} songs)`);
    console.log(`⚡ Mean Fetch Latency: ${avgLatency}ms | Total Sources: ${totalLrc} LRCLIB, ${totalNet} NetEase, ${totalKu} KuGou\n`);
}
