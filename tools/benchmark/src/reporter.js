import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPORTS_DIR = path.join(__dirname, '../reports');

if (!fs.existsSync(REPORTS_DIR)) {
    fs.mkdirSync(REPORTS_DIR, { recursive: true });
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
    const version = metadata.version || 'v4.6';

    let md = `# Match Success Rate\n\n`;
    md += `Spotify, ${version}, ${dateStr}\n\n`;
    md += `| Playlist Name | Success rate | Success | No Match | No Lyrics |\n`;
    md += `| :--- | :--- | :--- | :--- | :--- |\n`;

    for (const r of results) {
        md += `| ${r.name} | ${r.successRate}% | ${r.success} | ${r.noMatch} | ${r.noLyrics} |\n`;
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
    console.log('\n================================================================');
    console.log(` 🎵 MATCH SUCCESS RATE BENCHMARK`);
    console.log(` Spotify, ${metadata.version || 'v4.6'}, ${new Date().toLocaleDateString()}`);
    console.log('================================================================\n');

    console.table(results.map(r => ({
        'Playlist Name': r.name,
        'Success rate': `${r.successRate}%`,
        'Success': r.success,
        'No Match': r.noMatch,
        'No Lyrics': r.noLyrics,
        'Total': r.total
    })));

    const totalTracks = results.reduce((sum, r) => sum + r.total, 0);
    const totalSuccess = results.reduce((sum, r) => sum + r.success, 0);
    const overallRate = totalTracks > 0 ? Math.round((totalSuccess / totalTracks) * 100) : 0;

    console.log(`\n✨ Overall Success Rate: ${overallRate}% (${totalSuccess}/${totalTracks} songs)\n`);
}
