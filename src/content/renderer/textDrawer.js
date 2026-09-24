(() => {
    const fl = window.FLYING_LYRICS;

    // ─────────────────────────────────────────────────────────────────────────────
    //  FLYING LYRICS — CANVAS LYRIC LINES & SHADER TEXT DRAWER
    // ─────────────────────────────────────────────────────────────────────────────

    /**
     * Renders visible lyric lines onto the 2D canvas context including Romaji,
     * translated text, glow shaders, shadow blur passes, and text wrapping.
     *
     * @param {number} w - Canvas width
     * @param {number} h - Canvas height
     * @param {number} vmin - Viewport minimum dimension unit (Math.min(w, h) / 100)
     * @param {number} maxWidth - Maximum text draw width
     * @param {number} activeIdx - Index of currently active lyric line
     * @param {number} anchorOffset - Vertical anchoring offset
     * @param {boolean} isFastScroll - True when scroll delta exceeds fast threshold
     */
    fl.drawLyricLines = function (w, h, vmin, maxWidth, activeIdx, anchorOffset, isFastScroll) {
        if (!fl.lyricLines || fl.albumCoverMode) return;

        fl.lyricLines.forEach((line, i) => {
            const entry = fl.cachedLayout[i];
            if (!entry) return;
            const y = entry.y;

            // Culling: Skip drawing off-screen lines
            const screenY = (h / 2) - fl.scrollPos + anchorOffset + y;
            if (screenY < -h * 0.5 || screenY > h * 1.5) return;

            const dist = Math.abs(i - activeIdx);
            fl.ctx.globalAlpha = Math.max(0.3, 1 - dist * 0.3);

            const isSystemMessage = fl.lyricLines.length === 1 && (fl.SYSTEM_MSG_SET ? fl.SYSTEM_MSG_SET.has(line.text) : false);
            const isWaitForIt = fl.lyricLines.length === 1 && line.text === "Wait for it...";
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
            const displayFontFamily = (isSystemMessage && !isWaitForIt) ? "'Noto Sans', 'Segoe UI', sans-serif" : fl.userFontFamily;
            const fontScale = isSystemMessage ? 1 : (fl.userFontSize / 18);

            const mainSize = entry.mainSize || (isCurrent ? vmin * 7.5 * fontScale : vmin * 6.0 * fontScale);
            const romajiSize = isCurrent ? mainSize * 0.86 : vmin * 5.2 * fontScale;
            const transSize = isCurrent ? mainSize * 0.86 : vmin * 5.2 * fontScale;

            if (fl.userLyricShadowEnabled) {
                fl.ctx.shadowColor = "rgba(0, 0, 0, 0.8)";
                fl.ctx.shadowBlur = 8;
            } else {
                fl.ctx.shadowBlur = 0;
                fl.ctx.shadowColor = 'transparent';
            }

            // 1. Draw Romaji (Top)
            if (line.romaji) {
                fl.ctx.font = `italic 600 ${romajiSize}px ${displayFontFamily}`;
                fl.ctx.fillStyle = isCurrent ? (fl.currentPalette?.romaji || "#FFEAA7") : "#DDDDDD";
                fl.wrapText(fl.ctx, line.romaji, drawX, y - (romajiSize * 1.5), maxWidth, romajiSize * 1.2, true);
            }

            // 2. Draw Main Lyric (Middle)
            fl.ctx.font = isCurrent ? `700 ${mainSize}px ${displayFontFamily}` : `600 ${mainSize}px ${displayFontFamily}`;
            fl.ctx.fillStyle = isCurrent ? (fl.userSpotlightEnabled ? "#FFFFFF" : (fl.currentPalette?.vibrant || "#FFFFFF")) : "#FFFFFF";
            fl.wrapText(fl.ctx, line.text, drawX, y, maxWidth, mainSize * 1.2, false);

            // Draw glow pass for the active line
            if (isCurrent) {
                if (fl.userGlowEnabled && fl.userGlowStyle === 'rainbow') {
                    const timeSec = performance.now() / 1000;
                    const hue = (timeSec * 60) % 360;
                    if (fl.userLyricShadowEnabled) fl.ctx.shadowColor = `hsl(${hue}, 100%, 65%)`;
                    fl.ctx.strokeStyle = `hsl(${hue}, 100%, 65%)`;
                } else {
                    const vibrant = fl.currentPalette?.vibrant || "rgba(0, 210, 255, 0.8)";
                    if (fl.userLyricShadowEnabled) fl.ctx.shadowColor = vibrant;
                    fl.ctx.strokeStyle = vibrant;
                }

                if (fl.userGlowEnabled && !isFastScroll) {
                    fl.ctx.lineWidth = Math.max(2, mainSize * 0.04);
                    if (!fl.userLyricShadowEnabled) {
                        fl.ctx.shadowBlur = 0;
                        fl.wrapText(fl.ctx, line.text, drawX, y, maxWidth, mainSize * 1.2, false, true);
                    } else if (fl.ecoMode) {
                        fl.ctx.shadowBlur = 15;
                        fl.wrapText(fl.ctx, line.text, drawX, y, maxWidth, mainSize * 1.2, false, true);
                    } else {
                        const glowTime = performance.now() / 1000;
                        const pulsedBlur = 10 + 30 * (0.5 + 0.5 * Math.sin(glowTime * Math.PI));
                        fl.ctx.shadowBlur = pulsedBlur;
                        fl.wrapText(fl.ctx, line.text, drawX, y, maxWidth, mainSize * 1.2, false, true);
                    }
                } else if (fl.userLyricShadowEnabled) {
                    fl.ctx.shadowBlur = 15;
                    fl.wrapText(fl.ctx, line.text, drawX, y, maxWidth, mainSize * 1.2, false, false);
                }
            }

            // 3. Draw Translation (Bottom)
            if (fl.showTranslation && line.translation) {
                const mainLineCount = fl.getWrapLines(fl.ctx, line.text, maxWidth).length;
                const mainWrapShift = (mainLineCount > 1 ? mainLineCount - 1 : 0) * (mainSize * 1.2);

                if (fl.userLyricShadowEnabled) {
                    fl.ctx.shadowColor = "rgba(0, 0, 0, 0.8)";
                    fl.ctx.shadowBlur = 8;
                } else {
                    fl.ctx.shadowBlur = 0;
                    fl.ctx.shadowColor = 'transparent';
                }

                fl.ctx.font = `600 ${transSize}px ${displayFontFamily}`;
                fl.ctx.fillStyle = isCurrent ? (fl.currentPalette?.trans || "#81ECEC") : "#CCCCCC";

                fl.wrapText(fl.ctx, `(${line.translation})`, drawX, y + mainWrapShift + (transSize * 1.5), maxWidth, transSize * 1.2, false);
            }

            fl.ctx.shadowBlur = 0;
        });
    };

})();
