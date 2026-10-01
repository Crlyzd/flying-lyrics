#!/usr/bin/env node

/**
 * ============================================================================
 * Flying Lyrics — Dev Manifest Target Switcher
 * Zero-dependency utility for managing active unpacked manifest targets
 * between Chromium (Edge / Chrome) and Gecko (Firefox).
 * ============================================================================
 */

const fs = require('fs');
const path = require('path');

const ROOT_DIR = path.resolve(__dirname, '..');
const ROOT_MANIFEST = path.join(ROOT_DIR, 'manifest.json');
const CHROME_MANIFEST = path.join(ROOT_DIR, 'manifest.chrome.json');
const FIREFOX_MANIFEST = path.join(ROOT_DIR, 'manifest.firefox.json');

/**
 * Read and parse JSON safely
 * @param {string} filePath 
 * @returns {object|null}
 */
function readJsonSafe(filePath) {
    if (!fs.existsSync(filePath)) return null;
    try {
        const raw = fs.readFileSync(filePath, 'utf8');
        return JSON.parse(raw);
    } catch {
        return null;
    }
}

/**
 * Identify manifest target type from parsed JSON
 * @param {object} manifest 
 * @returns {'chrome'|'firefox'|'unknown'}
 */
function detectTargetType(manifest) {
    if (!manifest || typeof manifest !== 'object') return 'unknown';
    if (manifest.background && manifest.background.service_worker) {
        return 'chrome';
    }
    if (manifest.background && Array.isArray(manifest.background.scripts)) {
        return 'firefox';
    }
    return 'unknown';
}

/**
 * Format target name with color/emoji for terminal
 * @param {'chrome'|'firefox'|'unknown'} target 
 * @returns {string}
 */
function formatTargetName(target) {
    switch (target) {
        case 'chrome':
            return 'Chromium (Microsoft Edge / Google Chrome / Brave)';
        case 'firefox':
            return 'Gecko (Mozilla Firefox / AMO)';
        default:
            return 'Unknown / Custom';
    }
}

/**
 * Verify version synchronization across templates
 */
function verifyVersionParity() {
    const chromeJson = readJsonSafe(CHROME_MANIFEST);
    const firefoxJson = readJsonSafe(FIREFOX_MANIFEST);

    if (chromeJson && firefoxJson && chromeJson.version !== firefoxJson.version) {
        console.warn(`\x1b[33m⚠ Warning: Version mismatch detected!\x1b[0m`);
        console.warn(`  manifest.chrome.json  : v${chromeJson.version}`);
        console.warn(`  manifest.firefox.json : v${firefoxJson.version}`);
    }
}

/**
 * Display current status of active unpacked manifest
 */
function showStatus() {
    const manifest = readJsonSafe(ROOT_MANIFEST);
    if (!manifest) {
        console.error('\x1b[31m✖ Error: manifest.json is missing or invalid JSON.\x1b[0m');
        return;
    }

    const target = detectTargetType(manifest);
    const bgInfo = manifest.background?.service_worker
        ? `Service Worker (${manifest.background.service_worker})`
        : manifest.background?.scripts
            ? `Event Scripts (${manifest.background.scripts.length} files)`
            : 'None';

    console.log('====================================================');
    console.log(' Flying Lyrics — Active Dev Manifest Status');
    console.log('====================================================');
    console.log(` Active Target : \x1b[36m${formatTargetName(target)}\x1b[0m`);
    console.log(` Version       : v${manifest.version || 'unknown'}`);
    console.log(` Background    : ${bgInfo}`);
    console.log(` Manifest File : ${ROOT_MANIFEST}`);
    console.log('====================================================');

    verifyVersionParity();
}

/**
 * Apply target manifest template to root manifest.json
 * @param {'chrome'|'firefox'} target 
 */
function switchTarget(target) {
    const sourcePath = target === 'firefox' ? FIREFOX_MANIFEST : CHROME_MANIFEST;

    if (!fs.existsSync(sourcePath)) {
        console.error(`\x1b[31m✖ Error: Source template not found: ${sourcePath}\x1b[0m`);
        process.exit(1);
    }

    const templateData = readJsonSafe(sourcePath);
    if (!templateData) {
        console.error(`\x1b[31m✖ Error: Failed to parse ${sourcePath}\x1b[0m`);
        process.exit(1);
    }

    // Write formatted JSON to root manifest.json
    fs.copyFileSync(sourcePath, ROOT_MANIFEST);

    console.log(`\x1b[32m✔ Active unpacked manifest successfully switched to:\x1b[0m`);
    console.log(`  \x1b[1m${formatTargetName(target)}\x1b[0m`);
    console.log(`  Source: ${path.basename(sourcePath)} -> manifest.json`);
    console.log(`\n💡 If your browser has the unpacked extension loaded:`);
    if (target === 'chrome') {
        console.log(`   Edge/Chrome: Go to edge://extensions or chrome://extensions and click ↻ (Reload).`);
    } else {
        console.log(`   Firefox: Go to about:debugging#/runtime/this-firefox and click "Reload".`);
    }

    verifyVersionParity();
}

/**
 * CLI Entrypoint
 */
function main() {
    const args = process.argv.slice(2);
    const command = (args[0] || 'status').toLowerCase();

    switch (command) {
        case 'chrome':
        case 'edge':
        case 'chromium':
            switchTarget('chrome');
            break;
        case 'firefox':
        case 'gecko':
        case 'amo':
            switchTarget('firefox');
            break;
        case 'status':
        case '--status':
        case '-s':
            showStatus();
            break;
        default:
            console.log('Usage: node tools/target.js [chrome|firefox|status]');
            console.log('  chrome  : Switch unpacked manifest to Chromium (Edge / Chrome)');
            console.log('  firefox : Switch unpacked manifest to Gecko (Firefox)');
            console.log('  status  : View current active manifest configuration');
            break;
    }
}

main();
