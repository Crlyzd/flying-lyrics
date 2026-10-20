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
const NETWORK_PATH = path.join(ROOT_DIR, 'src', 'background', 'search', 'network.js');

function readJson(filePath) {
    if (!fs.existsSync(filePath)) {
        throw new Error(`File not found: ${filePath}`);
    }
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function writeJson(filePath, data) {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + '\n', 'utf8');
}

function getCurrentVersion() {
    if (fs.existsSync(ROOT_MANIFEST)) {
        try {
            return readJson(ROOT_MANIFEST).version || '5.0.0';
        } catch {}
    }
    if (fs.existsSync(CHROME_MANIFEST)) {
        try {
            return readJson(CHROME_MANIFEST).version || '5.0.0';
        } catch {}
    }
    return '5.0.0';
}

function resolveNextVersion(input) {
    if (!input) return null;
    const current = getCurrentVersion();
    const mode = input.toLowerCase().trim();

    if (['major', 'minor', 'patch'].includes(mode)) {
        const parts = current.split('.').map(n => parseInt(n, 10) || 0);
        while (parts.length < 3) parts.push(0);
        if (mode === 'major') {
            parts[0] += 1;
            parts[1] = 0;
            parts[2] = 0;
        } else if (mode === 'minor') {
            parts[1] += 1;
            parts[2] = 0;
        } else if (mode === 'patch') {
            parts[2] += 1;
        }
        return parts.join('.');
    }

    if (/^\d+(\.\d+)+$/.test(input)) {
        return input;
    }

    return null;
}

function bumpVersion(targetInput) {
    const newVersion = resolveNextVersion(targetInput);
    if (!newVersion) {
        console.error(`\x1b[31m✖ Error: Invalid version or bump keyword "${targetInput}". Expected "patch", "minor", "major", or format like "5.2.2".\x1b[0m`);
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

    // 5. Update network.js fallback if present
    if (fs.existsSync(NETWORK_PATH)) {
        const networkContent = fs.readFileSync(NETWORK_PATH, 'utf8');
        const updatedNetwork = networkContent.replace(
            /\|\|\s*['"]\d+(\.\d+)+['"]\)\s*:\s*['"]\d+(\.\d+)+['"]/,
            `|| '${newVersion}') : '${newVersion}'`
        );
        if (updatedNetwork !== networkContent) {
            fs.writeFileSync(NETWORK_PATH, updatedNetwork, 'utf8');
            console.log(` ✔ network.js fallback   : -> \x1b[32mv${newVersion}\x1b[0m`);
        }
    }

    console.log('====================================================');
    console.log(`\x1b[32m✨ Version bump to v${newVersion} completed successfully across all targets!\x1b[0m\n`);
}

const targetArg = process.argv[2];
if (!targetArg || targetArg === '--help' || targetArg === '-h') {
    const cur = getCurrentVersion();
    console.log(`Current version: v${cur}`);
    console.log('Usage: node tools/bump-version.js <patch | minor | major | version>');
    console.log(`Examples:`);
    console.log(`  node tools/bump-version.js patch    (v${cur} -> v${resolveNextVersion('patch')})`);
    console.log(`  node tools/bump-version.js minor    (v${cur} -> v${resolveNextVersion('minor')})`);
    console.log(`  node tools/bump-version.js major    (v${cur} -> v${resolveNextVersion('major')})`);
    console.log(`  node tools/bump-version.js 5.3.0    (explicit custom version)`);
    process.exit(0);
}

bumpVersion(targetArg);
