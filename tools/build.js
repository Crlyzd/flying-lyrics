#!/usr/bin/env node

/**
 * ============================================================================
 * Flying Lyrics — Cross-Browser Extension Build Pipeline
 * Zero-dependency build utility for packaging Chrome and Firefox extensions.
 * ============================================================================
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync } = require('child_process');

const ROOT_DIR = path.resolve(__dirname, '..');
const DIST_DIR = path.join(ROOT_DIR, 'dist');
const MANIFEST_CHROME = fs.existsSync(path.join(ROOT_DIR, 'manifest.chrome.json'))
    ? path.join(ROOT_DIR, 'manifest.chrome.json')
    : path.join(ROOT_DIR, 'manifest.json');
const MANIFEST_FIREFOX = path.join(ROOT_DIR, 'manifest.firefox.json');

function parseArgs() {
    const args = process.argv.slice(2);
    let target = 'all';

    for (const arg of args) {
        if (arg.startsWith('--target=')) {
            target = arg.split('=')[1].toLowerCase();
        } else if (arg === '--chrome' || arg === '-c') {
            target = 'chrome';
        } else if (arg === '--firefox' || arg === '-f') {
            target = 'firefox';
        } else if (arg === '--all' || arg === '-a') {
            target = 'all';
        }
    }

    return target;
}

function getVersion() {
    try {
        const raw = fs.readFileSync(MANIFEST_CHROME, 'utf8');
        const manifest = JSON.parse(raw);
        return manifest.version || '1.0.0';
    } catch (err) {
        console.error('Failed to read version from manifest.json:', err.message);
        return '1.0.0';
    }
}

function copyRecursiveSync(src, dest) {
    const exists = fs.existsSync(src);
    const stats = exists && fs.statSync(src);
    const isDirectory = exists && stats.isDirectory();

    if (isDirectory) {
        if (!fs.existsSync(dest)) {
            fs.mkdirSync(dest, { recursive: true });
        }
        for (const childItem of fs.readdirSync(src)) {
            copyRecursiveSync(path.join(src, childItem), path.join(dest, childItem));
        }
    } else {
        fs.copyFileSync(src, dest);
    }
}

function removeFileIfExists(filePath) {
    if (fs.existsSync(filePath)) {
        fs.rmSync(filePath, { recursive: true, force: true });
    }
}

function createZipArchive(sourceDir, zipPath) {
    if (fs.existsSync(zipPath)) {
        fs.unlinkSync(zipPath);
    }

    try {
        // Use native bsdtar (available on Windows 10/11, macOS, and Linux)
        execSync(`tar -a -cf "${zipPath}" *`, {
            cwd: sourceDir,
            stdio: 'pipe',
            shell: true
        });
        return;
    } catch (tarErr) {
        // Fallback for older Windows systems without bsdtar
        if (process.platform === 'win32') {
            const psCmd = `powershell.exe -NoProfile -Command "Compress-Archive -Path '${sourceDir}\\*' -DestinationPath '${zipPath}' -Force"`;
            execSync(psCmd, { stdio: 'pipe' });
            return;
        }
        throw new Error(`Failed to create archive at ${zipPath}: ${tarErr.message}`);
    }
}

function formatBytes(bytes) {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1048576).toFixed(2)} MB`;
}

function buildTarget(browser, version) {
    const isFirefox = browser === 'firefox';
    const targetName = isFirefox ? 'Firefox' : 'Chrome';
    const manifestSrc = isFirefox ? MANIFEST_FIREFOX : MANIFEST_CHROME;
    const outputFilename = `flying_lyrics_${browser}_v${version}.zip`;
    const outputPath = path.join(DIST_DIR, outputFilename);

    console.log(`\n📦 Staging clean production build for ${targetName}...`);

    if (!fs.existsSync(manifestSrc)) {
        throw new Error(`Manifest file not found: ${manifestSrc}`);
    }

    const stageDir = path.join(os.tmpdir(), `fly_stage_${browser}_${Date.now()}`);
    fs.mkdirSync(stageDir, { recursive: true });

    try {
        // 1. Copy target manifest as manifest.json
        fs.copyFileSync(manifestSrc, path.join(stageDir, 'manifest.json'));

        // 2. Copy source and asset trees
        copyRecursiveSync(path.join(ROOT_DIR, 'src'), path.join(stageDir, 'src'));
        copyRecursiveSync(path.join(ROOT_DIR, 'assets'), path.join(stageDir, 'assets'));

        // 3. Physically strip developer tools for production store compliance
        const devScriptPath = path.join(stageDir, 'src', 'popup', 'js', 'popup-dev.js');
        const devCssPath = path.join(stageDir, 'src', 'popup', 'css', 'controls-dev.css');
        const devDirPath = path.join(stageDir, 'src', 'popup', 'js', 'dev');

        removeFileIfExists(devScriptPath);
        removeFileIfExists(devCssPath);
        removeFileIfExists(devDirPath);

        // 4. Create destination archive
        if (!fs.existsSync(DIST_DIR)) {
            fs.mkdirSync(DIST_DIR, { recursive: true });
        }

        createZipArchive(stageDir, outputPath);

        const stats = fs.statSync(outputPath);
        console.log(`   ✔ ${targetName} Package: ${outputFilename} (${formatBytes(stats.size)})`);
        console.log(`     Destination: ${outputPath}`);
    } finally {
        // Clean up temporary stage directory
        removeFileIfExists(stageDir);
    }
}

function main() {
    const target = parseArgs();
    const version = getVersion();

    console.log('====================================================');
    console.log(`🚀 Flying Lyrics Build Pipeline (v${version})`);
    console.log(`🎯 Target Browser: ${target.toUpperCase()}`);
    console.log('====================================================');

    const startTime = Date.now();

    try {
        if (target === 'chrome' || target === 'all') {
            buildTarget('chrome', version);
        }
        if (target === 'firefox' || target === 'all') {
            buildTarget('firefox', version);
        }

        const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
        console.log(`\n✨ Build completed successfully in ${elapsed}s!`);
        console.log('   Dev tools physically stripped for Web Store & AMO review compliance.\n');
    } catch (err) {
        console.error(`\n❌ Build failed: ${err.message}\n`);
        process.exit(1);
    }
}

main();
