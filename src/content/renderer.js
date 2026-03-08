(() => {
    const fl = window.FLYING_LYRICS;

    // --- RENDERER ---

    // Layout cache state — tracks what we last computed so we can skip redundant math
    fl.lastW = -1;
    fl.lastH = -1;     // Last known PiP window dimensions (-1 forces first-frame resize)
    fl.lastActiveIdx = -1;          // Last active lyric line index
    fl.lastLyricsLen = 0;           // Last known lyric count
    fl.needsLayoutUpdate = true;    // Dirty flag (true on first run)
    fl.cachedLayout = [];           // Pre-computed Y offsets for each lyric line

    fl.renderLoop = function () {
        if (!fl.pipWin || fl.pipWin.closed) return;

        fl.isRenderLoopRunning = true;

        const meta = navigator.mediaSession.metadata;
        const nowTitle = meta?.title || "";
        if (nowTitle !== fl.currentTrack) {
            fl.currentTrack = nowTitle;

            // --- INSTANT FLUSH: Clear old lyrics immediately ---
            fl.lyricLines = [{ time: 0, text: "Wait for it...", romaji: "", translation: "" }];
            fl.isCurrentLyricSynced = false;
            fl.needsLayoutUpdate = true;
            if (typeof fl.updateSyncIndicator === 'function') fl.updateSyncIndicator();

            fl.fetchLyrics();
        }

        // --- CONTINUOUS BACKGROUND IMAGE SYNC ---
        const art = fl.getCoverArt();
        const bg = fl.pipWin.document.getElementById('bg-cover');

        if (bg && art) {
            const newBg = `url("${art}")`;
            // Only trigger a DOM repaint if the image actually changed
            if (bg.style.backgroundImage !== newBg) {
                bg.style.backgroundImage = newBg;
                fl.extractPalette(art); // Trigger color extraction

                // Also update the centered art (if in centered mode)
                if (typeof fl.updateCenteredArt === 'function') {
                    fl.updateCenteredArt(art);
                }
            }
        } else if (bg && !art) {
            if (bg.style.backgroundImage !== 'none' && bg.style.backgroundImage !== '') {
                bg.style.backgroundImage = 'none';
                if (typeof fl.updateCenteredArt === 'function') {
                    fl.updateCenteredArt("");
                }
            }
        }

        if (!fl.canvas || !fl.pipWin.document.body.contains(fl.canvas)) {
            fl.canvas = fl.pipWin.document.getElementById('lyricCanvas');
            fl.ctx = null;
            fl.lastW = -1; // Force resize for the new canvas
            fl.lastH = -1;
        }
        if (!fl.canvas) return fl.pipWin.requestAnimationFrame(fl.renderLoop);
        if (!fl.ctx) fl.ctx = fl.canvas.getContext('2d');

        const w = fl.pipWin.innerWidth;
        const h = fl.pipWin.innerHeight;

        // Bail out if the PiP window hasn't finished laying out yet (can happen on the very first frame).
        // Re-queuing the loop is cheaper than drawing garbage into a 0x0 canvas.
        if (w <= 0 || h <= 0) return fl.pipWin.requestAnimationFrame(fl.renderLoop);

        // --- CANVAS RESIZE GUARD ---
        // Only resize when dimensions actually changed. Assigning canvas.width/height
        // every frame thrashes memory and is the single biggest CPU culprit.
        if (w !== fl.lastW || h !== fl.lastH) {
            fl.canvas.width = w;
            fl.canvas.height = h;
            fl.lastW = w; fl.lastH = h;
            fl.needsLayoutUpdate = true; // Window changed — recompute all offsets
        }

        const vmin = Math.min(w, h) / 100;
        const maxWidth = w * 0.94;

        const state = fl.getPlayerState();
        // Apply Sync Offset
        if (!state.paused) {
            state.currentTime += (fl.syncOffset / 1000);
        }

        const seeker = fl.pipWin.document.getElementById('seeker-bar');
        if (seeker) seeker.style.width = `${(state.currentTime / state.duration) * 100}%`;

        const ppBtn = fl.pipWin.document.getElementById('playpause');
        if (ppBtn) {
            const targetState = state.paused ? 'paused' : 'playing';
            if (ppBtn.dataset.state !== targetState) {
                ppBtn.dataset.state = targetState;
                ppBtn.innerHTML = state.paused ? fl.ICON_PLAY : fl.ICON_PAUSE;
            }
        }

        // Update mute button icon if changed externally (or by our toggle)
        const muteBtn = fl.pipWin.document.getElementById('mute-btn');
        if (muteBtn) {
            // Empirically verified via live DOM inspection:
            // Mute button aria-label = "Unmute" when muted, "Mute" when unmuted.
            // The volume slider approach was abandoned because [data-testid="volume-bar"]
            // is on a parent div, not the <input> itself — making it unreliable.
            let isMuted = false;
            if (window.location.hostname.includes('spotify')) {
                const muteToggleBtn = document.querySelector('[data-testid="volume-bar-toggle-mute-button"]');
                isMuted = muteToggleBtn?.getAttribute('aria-label') === 'Unmute';
            } else {
                const media = document.querySelector('audio') || document.querySelector('video, audio');
                isMuted = media ? (media.muted || media.volume === 0) : false;
            }
            const targetMuteIcon = isMuted ? fl.ICON_VOL_MUTE : fl.ICON_VOL_HIGH;
            if (muteBtn.innerHTML !== targetMuteIcon) muteBtn.innerHTML = targetMuteIcon;
        }

        // --- Optimization / Bounds Checking ---
        // If the window is too small, the CSS overlay is showing and the canvas is hidden.
        if (w < 200 || h < 200) {
            fl.pipWin.requestAnimationFrame(fl.renderLoop);
            return;
        }

        fl.ctx.clearRect(0, 0, w, h);

        let activeIdx = fl.lyricLines.findIndex((l, i) =>
            state.currentTime >= l.time && (!fl.lyricLines[i + 1] || state.currentTime < fl.lyricLines[i + 1].time)
        );
        if (activeIdx === -1) activeIdx = 0;

        // --- LAYOUT CACHE ---
        // Recompute line offsets only when something meaningful changes:
        // song loaded/changed, window resized, or active line moved (different font size).
        if (fl.needsLayoutUpdate || activeIdx !== fl.lastActiveIdx || fl.lyricLines.length !== fl.lastLyricsLen) {
            const defaultSpacing = vmin * 3;
            let currentYOffset = 0;
            const lineOffsets = [];

            // Scale factor derived from the user font size slider.
            // Default slider value (18) yields scale = 1.0.
            // Range 10–36 gives roughly 0.56x to 2.0x.
            const isSystemMessage = fl.lyricLines.length === 1 && ["Waiting for music...", "No lyrics found", "Network Error", "Wait for it...", "No Lyrics Available"].includes(fl.lyricLines[0].text);
            const fontScale = isSystemMessage ? 1 : (fl.userFontSize / 18);

            // Target width for the active line fit
            const fitWidth = maxWidth * 0.75;
            const displayFontFamily = isSystemMessage ? "'Noto Sans', 'Segoe UI', sans-serif" : fl.userFontFamily;
            const activeSizeMin = vmin * 6.5 * fontScale;
            const activeSizeMax = vmin * 9.5 * fontScale;

            for (let i = 0; i < fl.lyricLines.length; i++) {
                const line = fl.lyricLines[i];

                // Inactive lines: fixed vmin-based size (unchanged behaviour).
                // Active line: scale to fill horizontal space, then clamp.
                let mainSize;
                if (i === activeIdx) {
                    mainSize = fl.calculateFitSize(
                        fl.ctx,
                        line.text,
                        `700 {SIZE}px ${displayFontFamily}`,
                        fitWidth,
                        vmin * 7.5 * fontScale, // baseline measurement size
                        activeSizeMin,
                        activeSizeMax
                    );
                } else {
                    mainSize = vmin * 6.0 * fontScale; // Bumped from 5.2 for better readability
                }

                // Romaji and translation for the active line scale with mainSize
                // so they feel proportionally cohesive rather than jumping to a
                // fixed vmin value that may be much smaller than the main text.
                // NOTE: fontScale applied here to stay in sync with the draw pass.
                const romajiSize = (i === activeIdx) ? mainSize * 0.86 : vmin * 5.2 * fontScale;
                const transSize = (i === activeIdx) ? mainSize * 0.86 : vmin * 5.2 * fontScale;

                let romajiHeight = 0;
                if (line.romaji) {
                    fl.ctx.font = `italic 600 ${romajiSize}px ${displayFontFamily}`;
                    romajiHeight = fl.getWrapLines(fl.ctx, line.romaji, maxWidth).length * (romajiSize * 1.2);
                }

                fl.ctx.font = (i === activeIdx) ? `700 ${mainSize}px ${displayFontFamily}` : `600 ${mainSize}px ${displayFontFamily}`;
                let mainHeight = fl.getWrapLines(fl.ctx, line.text, maxWidth).length * (mainSize * 1.2);

                let transHeight = 0;
                if (fl.showTranslation && line.translation) {
                    fl.ctx.font = `600 ${transSize}px ${displayFontFamily}`;
                    transHeight = fl.getWrapLines(fl.ctx, `(${line.translation})`, maxWidth).length * (transSize * 1.2);
                }

                // --- ASYMMETRIC BOUNDARY CALCULATION ---
                // Text always grows DOWNWARD when it wraps, never upward.
                // So topBoundary is fixed to a single-line anchor, and
                // bottomBoundary expands to cover any extra wrapped rows.
                fl.ctx.font = (i === activeIdx) ? `700 ${mainSize}px ${displayFontFamily}` : `600 ${mainSize}px ${displayFontFamily}`;
                const mainLineCount = fl.getWrapLines(fl.ctx, line.text, maxWidth).length;
                // Extra downward shift when the main lyric wraps beyond one line
                const mainWrapShift = (mainLineCount > 1 ? mainLineCount - 1 : 0) * (mainSize * 1.2);

                // Top boundary: fixed at half a single line height (anchors the drawn Y position).
                // When romaji is present, it uses a proportional gap from romajiSize instead of a fixed vmin offset.
                // Reduced from 0.6 to 0.45 to shift the active line anchor upward
                const singleLineHalf = mainSize * 0.45;
                const topBoundary = line.romaji
                    ? (romajiSize * 1.5) + romajiHeight
                    : singleLineHalf;

                // Bottom boundary: extends downward to cover wrapped rows + translation gap.
                let bottomBoundary = singleLineHalf + mainWrapShift;
                if (fl.showTranslation && line.translation) {
                    bottomBoundary = mainWrapShift + (transSize * 1.5) + transHeight;
                }

                const baseY = currentYOffset + topBoundary;
                lineOffsets.push(baseY);

                const totalBlockHeight = topBoundary + bottomBoundary;
                currentYOffset += totalBlockHeight + defaultSpacing;
            }

            fl.cachedLayout = lineOffsets;
            // Update scroll target inside the invalidation block so the lerp always
            // chases the new position, even when scrollPos is mid-animation.
            fl.targetScroll = fl.cachedLayout[activeIdx] || 0;
            fl.lastActiveIdx = activeIdx;
            fl.lastLyricsLen = fl.lyricLines.length;
            fl.needsLayoutUpdate = false;
        }
        fl.scrollPos += (fl.targetScroll - fl.scrollPos) * 0.1;

        fl.ctx.save();
        fl.ctx.translate(w / 2, (h / 2) - fl.scrollPos);

        if (fl.userShowLyrics) {
            fl.lyricLines.forEach((line, i) => {
                const y = fl.cachedLayout[i];

                // --- CULLING: Skip drawing off-screen lines ---
                // Calculate where this line will actually render on the screen
                const screenY = (h / 2) - fl.scrollPos + y;

                // If it's more than half a full screen-height above or below the view, ignore it.
                // We give it a generous buffer window so shadows don't abruptly pop in.
                if (screenY < -h * 0.5 || screenY > h * 1.5) {
                    return;
                }

                const dist = Math.abs(i - activeIdx);
                // Increase alpha floor from 0.1 to 0.3 for better visibility of distant lines
                fl.ctx.globalAlpha = Math.max(0.3, 1 - dist * 0.3);

                const isSystemMessage = fl.lyricLines.length === 1 && ["Waiting for music...", "No lyrics found", "Network Error", "Wait for it...", "No Lyrics Available"].includes(line.text);
                let drawX = 0;
                if (isSystemMessage) {
                    fl.ctx.textAlign = 'center';
                } else if (fl.userLyricAlignment === 'left') {
                    fl.ctx.textAlign = 'left';
                    drawX = -(maxWidth / 2);
                } else if (fl.userLyricAlignment === 'right') {
                    fl.ctx.textAlign = 'right';
                    drawX = maxWidth / 2;
                } else {
                    fl.ctx.textAlign = 'center';
                }

                const isCurrent = (i === activeIdx);
                const displayFontFamily = isSystemMessage ? "'Noto Sans', 'Segoe UI', sans-serif" : fl.userFontFamily;

                // Universal Dark Shadow for all text
                fl.ctx.shadowColor = "rgba(0, 0, 0, 0.8)";
                fl.ctx.shadowBlur = 8;

                // Mirror the layout block's sizing logic exactly so draw positions
                // match the pre-computed offsets in cachedLayout.
                // fontScale is computed in the layout block above and also needed in the draw pass.
                const fontScale = isSystemMessage ? 1 : (fl.userFontSize / 18);

                let mainSize;
                if (isCurrent) {
                    mainSize = fl.calculateFitSize(
                        fl.ctx,
                        line.text,
                        `700 {SIZE}px ${displayFontFamily}`,
                        maxWidth * 0.75,
                        vmin * 7.5 * fontScale,
                        vmin * 6.5 * fontScale,
                        vmin * 9.5 * fontScale
                    );
                } else {
                    mainSize = vmin * 6.0 * fontScale; // Bumped from 5.2 to match layout pass
                }
                const romajiSize = isCurrent ? mainSize * 0.86 : vmin * 5.2 * fontScale;
                const transSize = isCurrent ? mainSize * 0.86 : vmin * 5.2 * fontScale;

                // 1. Romaji (Top)
                if (line.romaji) {
                    fl.ctx.font = `italic 600 ${romajiSize}px ${displayFontFamily}`;
                    // Revert inactive romaji to light gray for readability
                    fl.ctx.fillStyle = isCurrent ? fl.currentPalette.romaji : "#DDDDDD";
                    // Shift up to make room
                    fl.wrapText(fl.ctx, line.romaji, drawX, y - (romajiSize * 1.5), maxWidth, romajiSize * 1.2, true);
                }

                // 2. Original Text (Middle)
                fl.ctx.font = isCurrent ? `700 ${mainSize}px ${displayFontFamily}` : `600 ${mainSize}px ${displayFontFamily}`;
                // Inactive main text stays white, active main text glows (white core if neon)
                fl.ctx.fillStyle = (isCurrent && !fl.userGlowEnabled) ? fl.currentPalette.vibrant : "#FFFFFF";

                // Draw main text
                fl.wrapText(fl.ctx, line.text, drawX, y, maxWidth, mainSize * 1.2, false);

                // Draw glow pass for the active line:
                // If glowEnabled, pulse the shadowBlur via a sine wave; otherwise use the
                // fixed vibrant glow that already existed (subtle, palette-matched).
                if (isCurrent) {
                    if (fl.userGlowEnabled && fl.userGlowStyle === 'rainbow') {
                        const timeSec = performance.now() / 1000;
                        const hue = (timeSec * 60) % 360;
                        fl.ctx.shadowColor = `hsl(${hue}, 100%, 65%)`;
                        fl.ctx.strokeStyle = `hsl(${hue}, 100%, 65%)`;
                    } else {
                        fl.ctx.shadowColor = fl.currentPalette.vibrant;
                        fl.ctx.strokeStyle = fl.currentPalette.vibrant;
                    }

                    if (fl.userGlowEnabled) {
                        fl.ctx.lineWidth = Math.max(2, mainSize * 0.04);
                        // Pulse between 10 and 40 shadow blur over ~2s cycle
                        const glowTime = performance.now() / 1000;
                        const pulsedBlur = 10 + 30 * (0.5 + 0.5 * Math.sin(glowTime * Math.PI));
                        fl.ctx.shadowBlur = pulsedBlur;
                        // Request a re-render next frame so the animation is continuous
                        // (handled by the outer requestAnimationFrame loop in renderLoop)
                        fl.wrapText(fl.ctx, line.text, drawX, y, maxWidth, mainSize * 1.2, false, true);
                    } else {
                        fl.ctx.shadowBlur = 15;
                        fl.wrapText(fl.ctx, line.text, drawX, y, maxWidth, mainSize * 1.2, false, false);
                    }
                }

                // 3. Translation (Bottom)
                if (fl.showTranslation && line.translation) {
                    // Calculate downward baseline shift for wrapped lyrics
                    fl.ctx.font = isCurrent ? `700 ${mainSize}px ${displayFontFamily}` : `600 ${mainSize}px ${displayFontFamily}`;
                    const mainLineCount = fl.getWrapLines(fl.ctx, line.text, maxWidth).length;
                    const mainWrapShift = (mainLineCount > 1 ? mainLineCount - 1 : 0) * (mainSize * 1.2);

                    fl.ctx.shadowColor = "rgba(0, 0, 0, 0.8)";
                    fl.ctx.shadowBlur = 8;

                    fl.ctx.font = `600 ${transSize}px ${displayFontFamily}`;
                    fl.ctx.fillStyle = isCurrent ? fl.currentPalette.trans : "#CCCCCC";

                    fl.wrapText(fl.ctx, `(${line.translation})`, drawX, y + mainWrapShift + (transSize * 1.5), maxWidth, transSize * 1.2, false);
                }
            });
        }

        fl.ctx.restore();

        fl.pipWin.requestAnimationFrame(fl.renderLoop);
    }

})();
