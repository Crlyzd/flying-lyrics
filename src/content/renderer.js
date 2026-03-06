// --- RENDERER ---

// Layout cache state — tracks what we last computed so we can skip redundant math
let lastW = -1, lastH = -1;     // Last known PiP window dimensions (-1 forces first-frame resize)
let lastActiveIdx = -1;          // Last active lyric line index
let lastLyricsLen = 0;           // Last known lyric count
let needsLayoutUpdate = true;    // Dirty flag (true on first run)
let cachedLayout = [];           // Pre-computed Y offsets for each lyric line

function renderLoop() {
    if (!pipWin || pipWin.closed) return;

    const meta = navigator.mediaSession.metadata;
    const nowTitle = meta?.title || "";
    if (nowTitle !== currentTrack) {
        currentTrack = nowTitle;

        // --- INSTANT FLUSH: Clear old lyrics immediately ---
        lyricLines = [{ time: 0, text: "Wait for it...", romaji: "", translation: "" }];
        isCurrentLyricSynced = false;
        needsLayoutUpdate = true;
        if (typeof updateSyncIndicator === 'function') updateSyncIndicator();

        fetchLyrics();
    }

    // --- CONTINUOUS BACKGROUND IMAGE SYNC ---
    const art = getCoverArt();
    const bg = pipWin.document.getElementById('bg-cover');

    if (bg && art) {
        const newBg = `url("${art}")`;
        // Only trigger a DOM repaint if the image actually changed
        if (bg.style.backgroundImage !== newBg) {
            bg.style.backgroundImage = newBg;
            extractPalette(art); // Trigger color extraction

            // Also update the centered art (if in centered mode)
            if (typeof updateCenteredArt === 'function') {
                updateCenteredArt(art);
            }
        }
    }

    if (!canvas || !pipWin.document.body.contains(canvas)) {
        canvas = pipWin.document.getElementById('lyricCanvas');
        ctx = null;
        lastW = -1; // Force resize for the new canvas
        lastH = -1;
    }
    if (!canvas) return pipWin.requestAnimationFrame(renderLoop);
    if (!ctx) ctx = canvas.getContext('2d');

    const w = pipWin.innerWidth;
    const h = pipWin.innerHeight;

    // Bail out if the PiP window hasn't finished laying out yet (can happen on the very first frame).
    // Re-queuing the loop is cheaper than drawing garbage into a 0x0 canvas.
    if (w <= 0 || h <= 0) return pipWin.requestAnimationFrame(renderLoop);

    // --- CANVAS RESIZE GUARD ---
    // Only resize when dimensions actually changed. Assigning canvas.width/height
    // every frame thrashes memory and is the single biggest CPU culprit.
    if (w !== lastW || h !== lastH) {
        canvas.width = w;
        canvas.height = h;
        lastW = w; lastH = h;
        needsLayoutUpdate = true; // Window changed — recompute all offsets
    }

    const vmin = Math.min(w, h) / 100;
    const maxWidth = w * 0.94;

    const state = getPlayerState();
    // Apply Sync Offset
    if (!state.paused) {
        state.currentTime += (syncOffset / 1000);
    }

    const seeker = pipWin.document.getElementById('seeker-bar');
    if (seeker) seeker.style.width = `${(state.currentTime / state.duration) * 100}%`;

    const ppBtn = pipWin.document.getElementById('playpause');
    if (ppBtn) {
        const targetState = state.paused ? 'paused' : 'playing';
        if (ppBtn.dataset.state !== targetState) {
            ppBtn.dataset.state = targetState;
            ppBtn.innerHTML = state.paused ? ICON_PLAY : ICON_PAUSE;
        }
    }

    // Update mute button icon if changed externally (or by our toggle)
    const muteBtn = pipWin.document.getElementById('mute-btn');
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
        const targetMuteIcon = isMuted ? ICON_VOL_MUTE : ICON_VOL_HIGH;
        if (muteBtn.innerHTML !== targetMuteIcon) muteBtn.innerHTML = targetMuteIcon;
    }

    // --- Optimization / Bounds Checking ---
    // If the window is too small, the CSS overlay is showing and the canvas is hidden.
    if (w < 200 || h < 200) {
        pipWin.requestAnimationFrame(renderLoop);
        return;
    }

    ctx.clearRect(0, 0, w, h);

    let activeIdx = lyricLines.findIndex((l, i) =>
        state.currentTime >= l.time && (!lyricLines[i + 1] || state.currentTime < lyricLines[i + 1].time)
    );
    if (activeIdx === -1) activeIdx = 0;

    // --- LAYOUT CACHE ---
    // Recompute line offsets only when something meaningful changes:
    // song loaded/changed, window resized, or active line moved (different font size).
    if (needsLayoutUpdate || activeIdx !== lastActiveIdx || lyricLines.length !== lastLyricsLen) {
        const defaultSpacing = vmin * 3;
        let currentYOffset = 0;
        const lineOffsets = [];

        // Scale factor derived from the user font size slider.
        // Default slider value (18) yields scale = 1.0.
        // Range 10–36 gives roughly 0.56x to 2.0x.
        const fontScale = userFontSize / 18;

        // Target width for the active line fit
        const fitWidth = maxWidth * 0.75;
        const activeSizeMin = vmin * 6.5 * fontScale;
        const activeSizeMax = vmin * 9.5 * fontScale;

        for (let i = 0; i < lyricLines.length; i++) {
            const line = lyricLines[i];

            // Inactive lines: fixed vmin-based size (unchanged behaviour).
            // Active line: scale to fill horizontal space, then clamp.
            let mainSize;
            if (i === activeIdx) {
                mainSize = calculateFitSize(
                    ctx,
                    line.text,
                    `700 {SIZE}px ${userFontFamily}`,
                    fitWidth,
                    vmin * 7.5 * fontScale, // baseline measurement size
                    activeSizeMin,
                    activeSizeMax
                );
            } else {
                mainSize = vmin * 5.2 * fontScale;
            }

            // Romaji and translation for the active line scale with mainSize
            // so they feel proportionally cohesive rather than jumping to a
            // fixed vmin value that may be much smaller than the main text.
            const romajiSize = (i === activeIdx) ? mainSize * 0.86 : vmin * 5.2;
            const transSize = (i === activeIdx) ? mainSize * 0.86 : vmin * 5.2;

            let romajiHeight = 0;
            if (line.romaji) {
                ctx.font = `italic 600 ${romajiSize}px ${userFontFamily}`;
                romajiHeight = getWrapLines(ctx, line.romaji, maxWidth).length * (romajiSize * 1.2);
            }

            ctx.font = (i === activeIdx) ? `700 ${mainSize}px ${userFontFamily}` : `600 ${mainSize}px ${userFontFamily}`;
            let mainHeight = getWrapLines(ctx, line.text, maxWidth).length * (mainSize * 1.2);

            let transHeight = 0;
            if (showTranslation && line.translation) {
                ctx.font = `600 ${transSize}px ${userFontFamily}`;
                transHeight = getWrapLines(ctx, `(${line.translation})`, maxWidth).length * (transSize * 1.2);
            }

            // --- ASYMMETRIC BOUNDARY CALCULATION ---
            // Text always grows DOWNWARD when it wraps, never upward.
            // So topBoundary is fixed to a single-line anchor, and
            // bottomBoundary expands to cover any extra wrapped rows.
            ctx.font = (i === activeIdx) ? `700 ${mainSize}px ${userFontFamily}` : `600 ${mainSize}px ${userFontFamily}`;
            const mainLineCount = getWrapLines(ctx, line.text, maxWidth).length;
            // Extra downward shift when the main lyric wraps beyond one line
            const mainWrapShift = (mainLineCount > 1 ? mainLineCount - 1 : 0) * (mainSize * 1.2);

            // Top boundary: fixed at half a single line height (anchors the drawn Y position).
            // When romaji is present, it uses a proportional gap from romajiSize instead of a fixed vmin offset.
            const singleLineHalf = mainSize * 0.6;
            const topBoundary = line.romaji
                ? (romajiSize * 1.5) + romajiHeight
                : singleLineHalf;

            // Bottom boundary: extends downward to cover wrapped rows + translation gap.
            let bottomBoundary = singleLineHalf + mainWrapShift;
            if (showTranslation && line.translation) {
                bottomBoundary = mainWrapShift + (transSize * 1.5) + transHeight;
            }

            const baseY = currentYOffset + topBoundary;
            lineOffsets.push(baseY);

            const totalBlockHeight = topBoundary + bottomBoundary;
            currentYOffset += totalBlockHeight + defaultSpacing;
        }

        cachedLayout = lineOffsets;
        // Update scroll target inside the invalidation block so the lerp always
        // chases the new position, even when scrollPos is mid-animation.
        targetScroll = cachedLayout[activeIdx] || 0;
        lastActiveIdx = activeIdx;
        lastLyricsLen = lyricLines.length;
        needsLayoutUpdate = false;
    }
    scrollPos += (targetScroll - scrollPos) * 0.1;

    ctx.save();
    ctx.translate(w / 2, (h / 2) - scrollPos);

    if (userShowLyrics) {
        lyricLines.forEach((line, i) => {
            const y = cachedLayout[i];

            // --- CULLING: Skip drawing off-screen lines ---
            // Calculate where this line will actually render on the screen
            const screenY = (h / 2) - scrollPos + y;

            // If it's more than half a full screen-height above or below the view, ignore it.
            // We give it a generous buffer window so shadows don't abruptly pop in.
            if (screenY < -h * 0.5 || screenY > h * 1.5) {
                return;
            }

            const dist = Math.abs(i - activeIdx);
            // Increase alpha floor from 0.1 to 0.3 for better visibility of distant lines
            ctx.globalAlpha = Math.max(0.3, 1 - dist * 0.3);

            let drawX = 0;
            if (userLyricAlignment === 'left') {
                ctx.textAlign = 'left';
                drawX = -(maxWidth / 2);
            } else if (userLyricAlignment === 'right') {
                ctx.textAlign = 'right';
                drawX = maxWidth / 2;
            } else {
                ctx.textAlign = 'center';
            }

            const isCurrent = (i === activeIdx);

            // Universal Dark Shadow for all text
            ctx.shadowColor = "rgba(0, 0, 0, 0.8)";
            ctx.shadowBlur = 8;

            // Mirror the layout block's sizing logic exactly so draw positions
            // match the pre-computed offsets in cachedLayout.
            // fontScale is computed in the layout block above and also needed in the draw pass.
            const fontScale = userFontSize / 18;

            let mainSize;
            if (isCurrent) {
                mainSize = calculateFitSize(
                    ctx,
                    line.text,
                    `700 {SIZE}px ${userFontFamily}`,
                    maxWidth * 0.75,
                    vmin * 7.5 * fontScale,
                    vmin * 6.5 * fontScale,
                    vmin * 9.5 * fontScale
                );
            } else {
                mainSize = vmin * 5.2 * fontScale;
            }
            const romajiSize = isCurrent ? mainSize * 0.86 : vmin * 5.2 * fontScale;
            const transSize = isCurrent ? mainSize * 0.86 : vmin * 5.2 * fontScale;

            // 1. Romaji (Top)
            if (line.romaji) {
                ctx.font = `italic 600 ${romajiSize}px ${userFontFamily}`;
                // Revert inactive romaji to light gray for readability
                ctx.fillStyle = isCurrent ? currentPalette.romaji : "#DDDDDD";
                // Shift up to make room
                wrapText(ctx, line.romaji, drawX, y - (romajiSize * 1.5), maxWidth, romajiSize * 1.2, true);
            }

            // 2. Original Text (Middle)
            ctx.font = isCurrent ? `700 ${mainSize}px ${userFontFamily}` : `600 ${mainSize}px ${userFontFamily}`;
            // Inactive main text stays white
            ctx.fillStyle = isCurrent ? currentPalette.vibrant : "#FFFFFF";

            // Draw main text
            wrapText(ctx, line.text, drawX, y, maxWidth, mainSize * 1.2, false);

            // Draw glow pass for the active line:
            // If glowEnabled, pulse the shadowBlur via a sine wave; otherwise use the
            // fixed vibrant glow that already existed (subtle, palette-matched).
            if (isCurrent) {
                if (userGlowEnabled && userGlowStyle === 'rainbow') {
                    const timeSec = performance.now() / 1000;
                    const hue = (timeSec * 60) % 360;
                    ctx.shadowColor = `hsl(${hue}, 100%, 65%)`;
                } else {
                    ctx.shadowColor = currentPalette.vibrant;
                }

                if (userGlowEnabled) {
                    // Pulse between 10 and 40 shadow blur over ~2s cycle
                    const glowTime = performance.now() / 1000;
                    const pulsedBlur = 10 + 30 * (0.5 + 0.5 * Math.sin(glowTime * Math.PI));
                    ctx.shadowBlur = pulsedBlur;
                    // Request a re-render next frame so the animation is continuous
                    // (handled by the outer requestAnimationFrame loop in renderLoop)
                } else {
                    ctx.shadowBlur = 15;
                }
                wrapText(ctx, line.text, drawX, y, maxWidth, mainSize * 1.2, false);
            }

            // 3. Translation (Bottom)
            if (showTranslation && line.translation) {
                // Calculate downward baseline shift for wrapped lyrics
                ctx.font = isCurrent ? `700 ${mainSize}px ${userFontFamily}` : `600 ${mainSize}px ${userFontFamily}`;
                const mainLineCount = getWrapLines(ctx, line.text, maxWidth).length;
                const mainWrapShift = (mainLineCount > 1 ? mainLineCount - 1 : 0) * (mainSize * 1.2);

                ctx.shadowColor = "rgba(0, 0, 0, 0.8)";
                ctx.shadowBlur = 8;

                ctx.font = `600 ${transSize}px ${userFontFamily}`;
                ctx.fillStyle = isCurrent ? currentPalette.trans : "#CCCCCC";

                wrapText(ctx, `(${line.translation})`, drawX, y + mainWrapShift + (transSize * 1.5), maxWidth, transSize * 1.2, false);
            }
        });
    }

    ctx.restore();

    pipWin.requestAnimationFrame(renderLoop);
}
