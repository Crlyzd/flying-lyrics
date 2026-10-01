/**
 * ============================================================================
 * Flying Lyrics — Standalone Pop-out Window Controller (pip.js)
 * High-performance kinetic lyric renderer and media controller for Firefox
 * and Window PiP mode. (Pure Vanilla JS, ≤ 350 lines).
 * ============================================================================
 */

(() => {
    'use strict';

    // ── DOM Elements ──────────────────────────────────────────────────────────
    const bgCover = document.getElementById('bg-cover');
    const bgDarkness = document.getElementById('bg-darkness');
    const centerArt = document.getElementById('center-art');
    const canvas = document.getElementById('lyricCanvas');
    const ctx = canvas ? canvas.getContext('2d') : null;

    const uiContainer = document.getElementById('ui-container');
    const seekerContainer = document.getElementById('seeker-container');
    const seekerBar = document.getElementById('seeker-bar');
    const seekerTooltip = document.getElementById('seeker-tooltip');

    const muteBtn = document.getElementById('mute-btn');
    const prevBtn = document.getElementById('prev');
    const playPauseBtn = document.getElementById('playpause');
    const nextBtn = document.getElementById('next');
    const ccBtn = document.getElementById('cc-btn');

    // ── Icons ─────────────────────────────────────────────────────────────────
    const ICON_PLAY = `<svg viewBox="0 0 25 27" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="butt" stroke-linejoin="round"><path d="M20.1,11.2 C21.5,12 21.5,13.9 20.1,14.7 L5.9,22.9 C4.6,23.7 2.9,22.7 2.9,21.2 L2.9,4.7 C2.9,3.2 4.6,2.2 5.9,3 L20.1,11.2 Z"/></svg>`;
    const ICON_PAUSE = `<svg viewBox="0 0 27 29" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="butt" stroke-linejoin="miter"><rect x="2.7" y="2.3" width="6.8" height="23.2" rx="3.4"/><rect x="16.5" y="2.3" width="6.8" height="23.2" rx="3.4"/></svg>`;
    const ICON_VOL_HIGH = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"></path></svg>`;
    const ICON_VOL_MUTE = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon><line x1="23" y1="9" x2="17" y2="15"></line><line x1="17" y1="9" x2="23" y2="15"></line></svg>`;

    // ── Local State ───────────────────────────────────────────────────────────
    let musicTabId = null;
    let trackState = {
        title: '',
        artist: '',
        currentTime: 0,
        duration: 1,
        paused: true,
        isMuted: false,
        coverArt: '',
        lyricLines: [],
        isSynced: false,
        currentPalette: null,
        syncOffset: 0,
        lastTickPerf: performance.now()
    };

    let scrollPos = 0;
    let targetScroll = 0;
    let activeLineIndex = -1;

    // ── Communication Helpers ─────────────────────────────────────────────────
    async function findMusicTab() {
        try {
            const tabs = await new Promise(resolve => {
                chrome.tabs.query({ url: ['*://open.spotify.com/*', '*://music.youtube.com/*'] }, resolve);
            });
            if (tabs && tabs.length > 0) {
                musicTabId = tabs[0].id;
                return tabs[0].id;
            }
        } catch {}
        return null;
    }

    async function sendCommand(action, payload = {}) {
        const tabId = musicTabId || await findMusicTab();
        if (!tabId) return;
        try {
            chrome.tabs.sendMessage(tabId, { type: 'PLAYER_COMMAND', action, payload });
        } catch {
            musicTabId = null;
        }
    }

    async function syncStateFromHost() {
        const tabId = musicTabId || await findMusicTab();
        if (!tabId) return;

        try {
            chrome.tabs.sendMessage(tabId, { type: 'GET_PIP_STREAM_STATE' }, (res) => {
                if (chrome.runtime.lastError || !res) {
                    musicTabId = null;
                    return;
                }
                applyStateUpdate(res);
            });
        } catch {
            musicTabId = null;
        }
    }

    function applyStateUpdate(data) {
        trackState.title = data.title || '';
        trackState.artist = data.artist || '';
        trackState.currentTime = data.currentTime || 0;
        trackState.duration = Math.max(1, data.duration || 1);
        trackState.paused = !!data.paused;
        trackState.isMuted = !!data.isMuted;
        trackState.lyricLines = data.lyricLines || [];
        trackState.isSynced = !!data.isSynced;
        trackState.currentPalette = data.currentPalette || null;
        trackState.syncOffset = data.syncOffset || 0;
        trackState.lastTickPerf = performance.now();

        // Update Album Art
        if (data.coverArt && data.coverArt !== trackState.coverArt) {
            trackState.coverArt = data.coverArt;
            if (bgCover) bgCover.style.backgroundImage = `url("${data.coverArt}")`;
            if (centerArt) centerArt.src = data.coverArt;
        }

        // Update Play/Pause & Mute Button Icons
        if (playPauseBtn) playPauseBtn.innerHTML = trackState.paused ? ICON_PLAY : ICON_PAUSE;
        if (muteBtn) muteBtn.innerHTML = trackState.isMuted ? ICON_VOL_MUTE : ICON_VOL_HIGH;

        // Update Seeker visibility
        if (seekerContainer && trackState.duration > 5) {
            seekerContainer.style.display = 'block';
        }
    }

    // ── Canvas Layout & Resize ────────────────────────────────────────────────
    function resizeCanvas() {
        if (!canvas) return;
        const dpr = window.devicePixelRatio || 1;
        const w = window.innerWidth;
        const h = window.innerHeight;

        if (canvas.width !== w * dpr || canvas.height !== h * dpr) {
            canvas.width = w * dpr;
            canvas.height = h * dpr;
            canvas.style.width = `${w}px`;
            canvas.style.height = `${h}px`;
            if (ctx) ctx.scale(dpr, dpr);
        }
    }

    window.addEventListener('resize', () => {
        resizeCanvas();
        saveWindowSize();
    });

    let resizeTimer = null;
    function saveWindowSize() {
        if (resizeTimer) clearTimeout(resizeTimer);
        resizeTimer = setTimeout(() => {
            const w = window.outerWidth;
            const h = window.outerHeight;
            if (typeof chrome !== 'undefined' && chrome.storage?.local) {
                chrome.storage.local.set({ lastPipWidth: w, lastPipHeight: h });
            }
        }, 500);
    }

    // ── Kinetic Render Loop ───────────────────────────────────────────────────
    function getInterpolatedTime() {
        if (trackState.paused) return trackState.currentTime;
        const elapsed = (performance.now() - trackState.lastTickPerf) / 1000;
        return Math.min(trackState.duration, trackState.currentTime + elapsed);
    }

    function renderLoop() {
        resizeCanvas();
        if (!ctx) return;

        const w = window.innerWidth;
        const h = window.innerHeight;
        ctx.clearRect(0, 0, w, h);

        const curTime = getInterpolatedTime();
        const lines = trackState.lyricLines;

        // Update progress bar
        if (seekerBar && trackState.duration > 0) {
            const pct = Math.min(100, Math.max(0, (curTime / trackState.duration) * 100));
            seekerBar.style.width = `${pct}%`;
        }

        if (!lines || lines.length === 0) {
            requestAnimationFrame(renderLoop);
            return;
        }

        // Determine active line index
        let newActiveIdx = 0;
        const offsetSec = (trackState.syncOffset || 0) / 1000;
        const syncedTime = curTime + offsetSec;

        if (trackState.isSynced) {
            for (let i = 0; i < lines.length; i++) {
                if (lines[i].time <= syncedTime) newActiveIdx = i;
                else break;
            }
        }
        activeLineIndex = newActiveIdx;

        // Kinetic smooth scroll interpolation
        const lineHeight = Math.max(28, Math.min(52, h * 0.1));
        targetScroll = activeLineIndex * lineHeight;
        scrollPos += (targetScroll - scrollPos) * 0.12;

        const centerY = h * 0.42;

        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        const vibrantColor = trackState.currentPalette?.vibrant || '#1DB954';
        const transColor = trackState.currentPalette?.trans || '#A0C0E0';

        lines.forEach((line, idx) => {
            const lineY = centerY + (idx * lineHeight) - scrollPos;
            if (lineY < -60 || lineY > h + 60) return;

            const isActive = idx === activeLineIndex;
            const dist = Math.abs(idx - activeLineIndex);
            const alpha = isActive ? 1.0 : Math.max(0.2, 0.7 - dist * 0.18);

            ctx.save();
            ctx.globalAlpha = alpha;

            // Main lyric line
            ctx.font = isActive ? `bold ${Math.round(lineHeight * 0.52)}px 'Segoe UI', sans-serif` : `${Math.round(lineHeight * 0.44)}px 'Segoe UI', sans-serif`;
            ctx.fillStyle = isActive ? vibrantColor : '#FFFFFF';

            if (isActive) {
                ctx.shadowColor = vibrantColor;
                ctx.shadowBlur = 12;
            }

            ctx.fillText(line.text || '', w / 2, lineY);

            // Translated sub-line if present
            if (line.translation && isActive) {
                ctx.font = `italic ${Math.round(lineHeight * 0.36)}px 'Segoe UI', sans-serif`;
                ctx.fillStyle = transColor;
                ctx.shadowBlur = 0;
                ctx.fillText(line.translation, w / 2, lineY + (lineHeight * 0.42));
            }

            ctx.restore();
        });

        requestAnimationFrame(renderLoop);
    }

    // ── Controls Event Listeners ──────────────────────────────────────────────
    if (playPauseBtn) playPauseBtn.addEventListener('click', () => sendCommand('playpause'));
    if (prevBtn) prevBtn.addEventListener('click', () => sendCommand('prev'));
    if (nextBtn) nextBtn.addEventListener('click', () => sendCommand('next'));
    if (muteBtn) muteBtn.addEventListener('click', () => sendCommand('mute'));
    if (ccBtn) ccBtn.addEventListener('click', () => sendCommand('toggle_translation'));

    if (seekerContainer) {
        seekerContainer.addEventListener('click', (e) => {
            const rect = seekerContainer.getBoundingClientRect();
            const percent = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
            sendCommand('seek', { percent });
        });
    }

    // ── Initialization & Polling ──────────────────────────────────────────────
    resizeCanvas();
    syncStateFromHost();
    setInterval(syncStateFromHost, 500);
    requestAnimationFrame(renderLoop);
})();
