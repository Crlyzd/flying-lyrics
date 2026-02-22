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
        }
    }

    if (!canvas || !pipWin.document.body.contains(canvas)) {
        canvas = pipWin.document.getElementById('lyricCanvas');
        ctx = null;
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
        const targetIcon = (state.paused) ? ICON_PLAY : ICON_PAUSE;
        if (ppBtn.innerHTML !== targetIcon) ppBtn.innerHTML = targetIcon;
    }

    // Update mute button icon if changed externally
    const muteBtn = pipWin.document.getElementById('mute-btn');
    if (muteBtn) {
        const media = document.querySelector('video, audio');
        const isMuted = media ? media.muted : false;
        const targetMuteIcon = isMuted ? ICON_VOL_MUTE : ICON_VOL_HIGH;
        if (muteBtn.innerHTML !== targetMuteIcon) muteBtn.innerHTML = targetMuteIcon;
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

        for (let i = 0; i < lyricLines.length; i++) {
            const line = lyricLines[i];

            const mainSize = (i === activeIdx) ? vmin * 7.2 : vmin * 4.2;
            const romajiSize = (i === activeIdx) ? vmin * 6.2 : vmin * 3.6;
            const transSize = (i === activeIdx) ? vmin * 6.2 : vmin * 3.6;

            let romajiHeight = 0;
            if (line.romaji) {
                ctx.font = `italic 600 ${romajiSize}px 'Segoe UI', sans-serif`;
                romajiHeight = getWrapLines(ctx, line.romaji, maxWidth).length * (romajiSize * 1.2);
            }

            ctx.font = (i === activeIdx) ? `700 ${mainSize}px 'Segoe UI', sans-serif` : `600 ${mainSize}px 'Segoe UI', sans-serif`;
            let mainHeight = getWrapLines(ctx, line.text, maxWidth).length * (mainSize * 1.2);

            let transHeight = 0;
            if (showTranslation && line.translation) {
                ctx.font = `600 ${transSize}px 'Segoe UI', sans-serif`;
                transHeight = getWrapLines(ctx, `(${line.translation})`, maxWidth).length * (transSize * 1.2);
            }

            // --- ASYMMETRIC BOUNDARY CALCULATION ---
            // Text always grows DOWNWARD when it wraps, never upward.
            // So topBoundary is fixed to a single-line anchor, and
            // bottomBoundary expands to cover any extra wrapped rows.
            ctx.font = (i === activeIdx) ? `700 ${mainSize}px 'Segoe UI', sans-serif` : `600 ${mainSize}px 'Segoe UI', sans-serif`;
            const mainLineCount = getWrapLines(ctx, line.text, maxWidth).length;
            // Extra downward shift when the main lyric wraps beyond one line
            const mainWrapShift = (mainLineCount > 1 ? mainLineCount - 1 : 0) * (mainSize * 1.2);

            // Top boundary: fixed at half a single line height (anchors the drawn Y position).
            // When romaji is present, it uses the existing anchored offset instead.
            const singleLineHalf = mainSize * 0.6;
            const topBoundary = line.romaji
                ? (vmin * 9.2) + romajiHeight
                : singleLineHalf;

            // Bottom boundary: extends downward to cover wrapped rows + translation gap.
            let bottomBoundary = singleLineHalf + mainWrapShift;
            if (showTranslation && line.translation) {
                bottomBoundary = mainWrapShift + (vmin * 8.2) + transHeight;
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

    lyricLines.forEach((line, i) => {
        const dist = Math.abs(i - activeIdx);
        // Increase alpha floor from 0.1 to 0.3 for better visibility of distant lines
        ctx.globalAlpha = Math.max(0.3, 1 - dist * 0.3);
        ctx.textAlign = "center";

        const y = cachedLayout[i];
        const isCurrent = (i === activeIdx);

        // Universal Dark Shadow for all text
        ctx.shadowColor = "rgba(0, 0, 0, 0.8)";
        ctx.shadowBlur = 8;

        const mainSize = isCurrent ? vmin * 7.2 : vmin * 4.2;
        const romajiSize = isCurrent ? vmin * 6.2 : vmin * 3.6;
        const transSize = isCurrent ? vmin * 6.2 : vmin * 3.6;

        // 1. Romaji (Top)
        if (line.romaji) {
            ctx.font = `italic 600 ${romajiSize}px 'Segoe UI', sans-serif`;
            // Revert inactive romaji to light gray for readability
            ctx.fillStyle = isCurrent ? currentPalette.romaji : "#DDDDDD";
            // Shift up to make room
            wrapText(ctx, line.romaji, 0, y - (vmin * 9.2), maxWidth, romajiSize * 1.2, true);
        }

        // 2. Original Text (Middle)
        ctx.font = isCurrent ? `700 ${mainSize}px 'Segoe UI', sans-serif` : `600 ${mainSize}px 'Segoe UI', sans-serif`;
        // Inactive main text stays white
        ctx.fillStyle = isCurrent ? currentPalette.vibrant : "#FFFFFF";

        // Draw main text
        wrapText(ctx, line.text, 0, y, maxWidth, mainSize * 1.2, false);

        // If current, draw a second pass with the vibrant glow to ensure both contrast and vibrancy
        if (isCurrent) {
            ctx.shadowColor = currentPalette.vibrant;
            ctx.shadowBlur = 15;
            wrapText(ctx, line.text, 0, y, maxWidth, mainSize * 1.2, false);
        }

        // 3. Translation (Bottom)
        if (showTranslation && line.translation) {
            // Calculate downward baseline shift for wrapped lyrics
            ctx.font = isCurrent ? `700 ${mainSize}px 'Segoe UI', sans-serif` : `600 ${mainSize}px 'Segoe UI', sans-serif`;
            const mainLineCount = getWrapLines(ctx, line.text, maxWidth).length;
            const mainWrapShift = (mainLineCount > 1 ? mainLineCount - 1 : 0) * (mainSize * 1.2);

            ctx.shadowColor = "rgba(0, 0, 0, 0.8)";
            ctx.shadowBlur = 8;

            ctx.font = `600 ${transSize}px 'Segoe UI', sans-serif`;
            ctx.fillStyle = isCurrent ? currentPalette.trans : "#CCCCCC";

            wrapText(ctx, `(${line.translation})`, 0, y + mainWrapShift + (vmin * 8.2), maxWidth, transSize * 1.2, false);
        }
    });

    ctx.restore();

    pipWin.requestAnimationFrame(renderLoop);
}
