(() => {
    const fl = window.FLYING_LYRICS;

    // ─────────────────────────────────────────────────────────────────────────────
    //  FLYING LYRICS — LYRIC LAYOUT ENGINE & CACHE (content script context)
    // ─────────────────────────────────────────────────────────────────────────────

    fl.updateLyricLayout = function (w, h, vmin, maxWidth, activeIdx) {
        if (!fl.needsLayoutUpdate && activeIdx === fl.lastActiveIdx && fl.lyricLines.length === fl.lastLyricsLen) {
            return;
        }

        const baseSpacing = vmin * (fl.userLineSpacing ?? 8);
        let currentYOffset = 0;
        const lineOffsets = [];

        const isSystemMessage = fl.lyricLines.length === 1 && (fl.SYSTEM_MSG_SET ? fl.SYSTEM_MSG_SET.has(fl.lyricLines[0].text) : false);
        const isWaitForIt = fl.lyricLines.length === 1 && fl.lyricLines[0].text === "Wait for it...";
        const fontScale = isSystemMessage ? 1 : (fl.userFontSize / 18);

        const fitWidth = maxWidth * 0.75;
        const displayFontFamily = ((isSystemMessage && !isWaitForIt) || (fl.galaxyMode === false && !isWaitForIt))
            ? "'Noto Sans', 'Segoe UI', sans-serif"
            : fl.userFontFamily;
        const activeSizeMin = vmin * 6.5 * fontScale;
        const activeSizeMax = vmin * 9.5 * fontScale;

        for (let i = 0; i < fl.lyricLines.length; i++) {
            const line = fl.lyricLines[i];

            let mainSize;
            if (i === activeIdx) {
                mainSize = fl.calculateFitSize(
                    fl.ctx,
                    line.text,
                    `700 {SIZE}px ${displayFontFamily}`,
                    fitWidth,
                    vmin * 7.5 * fontScale,
                    activeSizeMin,
                    activeSizeMax
                );
            } else {
                mainSize = vmin * 6.0 * fontScale;
            }

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

            // Asymmetric Boundary Calculation
            fl.ctx.font = (i === activeIdx) ? `700 ${mainSize}px ${displayFontFamily}` : `600 ${mainSize}px ${displayFontFamily}`;
            const mainLineCount = fl.getWrapLines(fl.ctx, line.text, maxWidth).length;
            const mainWrapShift = (mainLineCount > 1 ? mainLineCount - 1 : 0) * (mainSize * 1.2);

            const singleLineHalf = mainSize * 0.45;
            const topBoundary = line.romaji
                ? (romajiSize * 1.5) + romajiHeight
                : singleLineHalf;

            let bottomBoundary = singleLineHalf + mainWrapShift;
            if (fl.showTranslation && line.translation) {
                bottomBoundary = mainWrapShift + (transSize * 1.5) + transHeight;
            }

            const baseY = currentYOffset + topBoundary;
            lineOffsets.push({ y: baseY, mainSize });

            const totalBlockHeight = topBoundary + bottomBoundary;

            const hasRomaji = !!line.romaji;
            const hasTl = fl.showTranslation && !!line.translation;
            const layerCount = 1 + (hasRomaji ? 1 : 0) + (hasTl ? 1 : 0);

            let dynamicGap = baseSpacing;
            if (layerCount === 2) dynamicGap = baseSpacing * 2.0;
            if (layerCount === 1) dynamicGap = baseSpacing * 3.0;

            currentYOffset += totalBlockHeight + dynamicGap;
        }

        fl.cachedLayout = lineOffsets;
        fl.targetScroll = (fl.cachedLayout[activeIdx]?.y) || 0;

        if (fl.needsLayoutUpdate && (fl.scrollPos === 0 || fl.lyricLines.length === 1)) {
            fl.scrollPos = fl.targetScroll;
            fl.lastAnimationTimeMs = null;
        }

        fl.lastActiveIdx = activeIdx;
        fl.lastLyricsLen = fl.lyricLines.length;
        fl.needsLayoutUpdate = false;
    };

})();
