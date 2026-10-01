#!/usr/bin/env node

/**
 * ============================================================================
 * Flying Lyrics — Cross-Browser Version Bump Utility
 * Zero-dependency utility for atomically updating extension versions across
 * Chromium, Gecko templates, active unpacked manifest, and tooling fallbacks.
 * ============================================================================
 */

const fs = require('fs');
const path = require('path');

const ROOT_DIR = path.resolve(__dirname, '..');
const CHROME_MANIFEST = path.join(ROOT_DIR, 'manifest.chrome.json');
const FIREFOX_MANIFEST = path.join(ROOT_DIR, 'manifest.firefox.json');
const ROOT_MANIFEST = path.join(ROOT_DIR, 'manifest.json');
const REPORTER_PATH = path.join(ROOT_DIR, 'tools', 'benchmark', 'src', 'reporter.js');

function readJson(filePath) {
    if (!fs.existsSync(filePath)) {
        throw new Error(`File not found: ${filePath}`);
    }
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function writeJson(filePath, data) {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + '\n', 'utf8');
}

function bumpVersion(newVersion) {
    if (!newVersion || !/^\d+(\.\d+)+$/.test(newVersion)) {
        console.error('\x1b[31m✖ Error: Invalid version format. Expected format like "5.0" or "5.0.0".\x1b[0m');
        process.exit(1);
    }

    console.log('====================================================');
    console.log(` 🚀 Flying Lyrics — Bumping Version to v${newVersion}`);
    console.log('====================================================');

    // 1. Update manifest.chrome.json
    if (fs.existsSync(CHROME_MANIFEST)) {
        const chromeManifest = readJson(CHROME_MANIFEST);
        const oldVersion = chromeManifest.version;
        chromeManifest.version = newVersion;
        writeJson(CHROME_MANIFEST, chromeManifest);
        console.log(` ✔ manifest.chrome.json  : v${oldVersion} -> \x1b[32mv${newVersion}\x1b[0m`);
    } else {
        console.warn(` ⚠ manifest.chrome.json not found.`);
    }

    // 2. Update manifest.firefox.json
    if (fs.existsSync(FIREFOX_MANIFEST)) {
        const ffManifest = readJson(FIREFOX_MANIFEST);
        const oldVersion = ffManifest.version;
        ffManifest.version = newVersion;
        writeJson(FIREFOX_MANIFEST, ffManifest);
        console.log(` ✔ manifest.firefox.json : v${oldVersion} -> \x1b[32mv${newVersion}\x1b[0m`);
    } else {
        console.warn(` ⚠ manifest.firefox.json not found.`);
    }

    // 3. Update root manifest.json
    if (fs.existsSync(ROOT_MANIFEST)) {
        const rootManifest = readJson(ROOT_MANIFEST);
        const oldVersion = rootManifest.version;
        rootManifest.version = newVersion;
        writeJson(ROOT_MANIFEST, rootManifest);
        console.log(` ✔ manifest.json (root)  : v${oldVersion} -> \x1b[32mv${newVersion}\x1b[0m`);
    }

    // 4. Update benchmark reporter fallback if present
    if (fs.existsSync(REPORTER_PATH)) {
        const reporterContent = fs.readFileSync(REPORTER_PATH, 'utf8');
        const updatedContent = reporterContent.replace(
            /return\s+['"]v\d+(\.\d+)+['"];/,
            `return 'v${newVersion}';`
        );
        if (updatedContent !== reporterContent) {
            fs.writeFileSync(REPORTER_PATH, updatedContent, 'utf8');
            console.log(` ✔ reporter.js fallback  : -> \x1b[32mv${newVersion}\x1b[0m`);
        }
    }

    console.log('====================================================');
    console.log(`\x1b[32m✨ Version bump to v${newVersion} completed successfully across all targets!\x1b[0m\n`);
}

const targetVersion = process.argv[2];
if (!targetVersion) {
    console.log('Usage: node tools/bump-version.js <version>');
    console.log('Example: node tools/bump-version.js 5.0');
    process.exit(1);
}

bumpVersion(targetVersion);
