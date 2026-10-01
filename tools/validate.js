#!/usr/bin/env node

/**
 * ============================================================================
 * Flying Lyrics — Cross-Browser Parity & Compatibility Validator
 * Zero-dependency, 100% READ-ONLY diagnostic tool.
 * Verifies synchronization between Chromium and Gecko (Firefox) manifests,
 * script load sequence, permissions, and architectural safety guards.
 * ============================================================================
 */

const fs = require('fs');
const path = require('path');

const ROOT_DIR = path.resolve(__dirname, '..');
const CHROME_MANIFEST = path.join(ROOT_DIR, 'manifest.chrome.json');
const FIREFOX_MANIFEST = path.join(ROOT_DIR, 'manifest.firefox.json');
const ROOT_MANIFEST = path.join(ROOT_DIR, 'manifest.json');
const CONTENT_JS = path.join(ROOT_DIR, 'src', 'content', 'content.js');
const PIP_DRIVERS_JS = path.join(ROOT_DIR, 'src', 'content', 'pipDrivers.js');

function readJsonSafe(filePath) {
    if (!fs.existsSync(filePath)) {
        return null;
    }
    try {
        return JSON.parse(fs.readFileSync(filePath, 'utf8'));
    } catch (err) {
        throw new Error(`Failed to parse JSON at ${filePath}: ${err.message}`);
    }
}

function runValidation() {
    console.log('====================================================');
    console.log(' 🔍 Flying Lyrics — Cross-Browser Compatibility Audit');
    console.log('====================================================');

    let errorCount = 0;
    let warningCount = 0;

    const chromeJson = readJsonSafe(CHROME_MANIFEST);
    const ffJson = readJsonSafe(FIREFOX_MANIFEST);
    const rootJson = readJsonSafe(ROOT_MANIFEST);

    if (!chromeJson || !ffJson) {
        console.error('\x1b[31m✖ Error: Missing manifest.chrome.json or manifest.firefox.json.\x1b[0m');
        process.exit(1);
    }

    // 1. Version Parity Check
    if (chromeJson.version !== ffJson.version) {
        console.error(`\x1b[31m✖ Version mismatch:\x1b[0m`);
        console.error(`  manifest.chrome.json  : v${chromeJson.version}`);
        console.error(`  manifest.firefox.json : v${ffJson.version}`);
        errorCount++;
    } else {
        console.log(` ✔ Version Parity: v${chromeJson.version} (Synchronized)`);
    }

    // 2. Content Scripts Parity & Load Order Check
    const chromeBlocks = chromeJson.content_scripts || [];
    const ffBlocks = ffJson.content_scripts || [];

    if (chromeBlocks.length !== ffBlocks.length) {
        console.error(`\x1b[31m✖ Content script blocks mismatch: Chrome has ${chromeBlocks.length} blocks, Firefox has ${ffBlocks.length} blocks.\x1b[0m`);
        errorCount++;
    } else {
        let totalScriptsChecked = 0;
        let scriptMismatch = false;

        for (let b = 0; b < chromeBlocks.length; b++) {
            const cList = chromeBlocks[b].js || [];
            const fList = ffBlocks[b].js || [];

            if (cList.length !== fList.length) {
                console.error(`\x1b[31m✖ Content script count mismatch in block [${b}]: Chrome (${cList.length}) vs Firefox (${fList.length})\x1b[0m`);
                scriptMismatch = true;
                errorCount++;
                continue;
            }

            for (let i = 0; i < cList.length; i++) {
                totalScriptsChecked++;
                if (cList[i] !== fList[i]) {
                    console.error(`\x1b[31m✖ Script mismatch in block [${b}] at index [${i}]:\x1b[0m`);
                    console.error(`  Chrome  : ${cList[i]}`);
                    console.error(`  Firefox : ${fList[i]}`);
                    scriptMismatch = true;
                    errorCount++;
                }
            }
        }

        if (!scriptMismatch) {
            console.log(` ✔ Content Script Parity: ${totalScriptsChecked} scripts across ${chromeBlocks.length} blocks identically sequenced`);
        }
    }

    // 3. Permissions Check
    const chromePerms = (chromeJson.permissions || []).sort().join(',');
    const ffPerms = (ffJson.permissions || []).sort().join(',');
    if (chromePerms !== ffPerms) {
        console.warn(`\x1b[33m⚠ Permissions discrepancy detected:\x1b[0m`);
        console.warn(`  Chrome  : [${chromePerms}]`);
        console.warn(`  Firefox : [${ffPerms}]`);
        warningCount++;
    } else {
        console.log(` ✔ Permissions Parity: Matched`);
    }

    // 4. Firefox Specific Settings Validation
    if (!ffJson.browser_specific_settings?.gecko?.id) {
        console.error(`\x1b[31m✖ Firefox manifest is missing browser_specific_settings.gecko.id\x1b[0m`);
        errorCount++;
    } else {
        console.log(` ✔ Gecko Identity: ${ffJson.browser_specific_settings.gecko.id}`);
    }

    // 5. Code Invariant: Main World Hook Fallback in content.js
    if (fs.existsSync(CONTENT_JS)) {
        const contentSrc = fs.readFileSync(CONTENT_JS, 'utf8');
        if (!contentSrc.includes('ensureMainWorldHook')) {
            console.error(`\x1b[31m✖ Safety invariant violated: ensureMainWorldHook missing in content.js\x1b[0m`);
            errorCount++;
        } else {
            console.log(` ✔ Firefox Main World Fallback: Present in content.js`);
        }
    }

    // 6. Code Invariant: Progressive Capability Check for Document PiP
    if (fs.existsSync(PIP_DRIVERS_JS)) {
        const pipSrc = fs.readFileSync(PIP_DRIVERS_JS, 'utf8');
        if (!pipSrc.includes('documentPictureInPicture')) {
            console.warn(`\x1b[33m⚠ Warning: documentPictureInPicture reference not found in pipDrivers.js\x1b[0m`);
            warningCount++;
        } else if (!pipSrc.includes('window.documentPictureInPicture')) {
            console.error(`\x1b[31m✖ Safety invariant violated: Unguarded documentPictureInPicture call detected!\x1b[0m`);
            errorCount++;
        } else {
            console.log(` ✔ PiP Capability Guard: Progressive window.documentPictureInPicture check intact`);
        }
    }

    console.log('====================================================');
    if (errorCount === 0) {
        console.log(`\x1b[32m✨ All cross-browser parity checks passed successfully! (${warningCount} warnings)\x1b[0m\n`);
        return true;
    } else {
        console.error(`\x1b[31m❌ Validation failed with ${errorCount} error(s) and ${warningCount} warning(s).\x1b[0m\n`);
        return false;
    }
}

if (require.main === module) {
    const passed = runValidation();
    process.exit(passed ? 0 : 1);
}

module.exports = { runValidation };
