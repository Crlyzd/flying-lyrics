(() => {
    const fl = window.FLYING_LYRICS;

    // ─────────────────────────────────────────────────────────────────────────────
    //  FLYING LYRICS — COLOR UTILITIES & PALETTE DERIVATION (content UI context)
    // ─────────────────────────────────────────────────────────────────────────────

    function hexToRgba(hex, alpha) {
        if (!hex) return 'rgba(0,0,0,0)';
        hex = hex.replace('#', '');
        if (hex.length === 3) {
            hex = hex.split('').map(c => c + c).join('');
        }
        const r = parseInt(hex.substring(0, 2), 16);
        const g = parseInt(hex.substring(2, 4), 16);
        const b = parseInt(hex.substring(4, 6), 16);
        return `rgba(${r}, ${g}, ${b}, ${alpha})`;
    }

    function applyPeachFilterAndClamp(hex) {
        return hex; // Simply return the raw color, no more clamping or peach blending!
    }

    function getContrastColor(hex) {
        if (!hex) return '#ffffff';
        let r = parseInt(hex.slice(1, 3), 16);
        let g = parseInt(hex.slice(3, 5), 16);
        let b = parseInt(hex.slice(5, 7), 16);
        let yiq = ((r * 299) + (g * 587) + (b * 114)) / 1000;
        return (yiq >= 140) ? '#000000' : '#ffffff';
    }

    function getReadableForeground(hex) {
        if (!hex) return '#ffffff';
        let r = parseInt(hex.slice(1, 3), 16);
        let g = parseInt(hex.slice(3, 5), 16);
        let b = parseInt(hex.slice(5, 7), 16);
        let yiq = ((r * 299) + (g * 587) + (b * 114)) / 1000;

        if (yiq < 90) {
            // Boost brightness for readability on dark backgrounds
            // Mix 30% of raw color with 70% white to boost lightness while preserving hue
            let brR = Math.min(255, Math.round(r * 0.3 + 255 * 0.7));
            let brG = Math.min(255, Math.round(g * 0.3 + 255 * 0.7));
            let brB = Math.min(255, Math.round(b * 0.3 + 255 * 0.7));

            let outR = brR.toString(16).padStart(2, '0');
            let outG = brG.toString(16).padStart(2, '0');
            let outB = brB.toString(16).padStart(2, '0');
            return `#${outR}${outG}${outB}`;
        }
        return hex;
    }

    fl.deriveDarkBg = function (vibrantColorStr) {
        if (!vibrantColorStr) return '#121212';
        const match = vibrantColorStr.match(/\d+/g);
        if (!match || match.length < 3) return '#121212';
        const [r, g, b] = match.map(Number);
        const hsl = fl.rgbToHsl(r, g, b);
        // If the cover is essentially monochromatic (B&W), skip colorizing
        if (hsl.s < 0.17) return '#181818';

        // Check if hue falls in the warm/sludge range (yellows, olives, oranges)
        const isWarmSludgeHue = hsl.h >= 0.08 && hsl.h <= 0.25;
        const targetS = isWarmSludgeHue ? Math.min(hsl.s, 0.40) : Math.max(hsl.s, 0.20);
        const targetL = isWarmSludgeHue ? 0.24 : 0.40;

        return fl.hslToRgb(hsl.h, targetS, targetL);
    };

    fl.deriveLightBg = function (vibrantColorStr) {
        if (!vibrantColorStr) return '#2a2a2a';
        const match = vibrantColorStr.match(/\d+/g);
        if (!match || match.length < 3) return '#2a2a2a';
        const [r, g, b] = match.map(Number);
        const hsl = fl.rgbToHsl(r, g, b);
        // If the cover is essentially monochromatic (B&W), skip colorizing
        if (hsl.s < 0.17) return '#2d2d2d';

        // Check if hue falls in the warm/sludge range (yellows, olives, oranges)
        const isWarmSludgeHue = hsl.h >= 0.08 && hsl.h <= 0.25;
        const targetS = isWarmSludgeHue ? Math.min(hsl.s, 0.40) : Math.max(hsl.s, 0.15);
        const targetL = isWarmSludgeHue ? 0.46 : 0.60;

        return fl.hslToRgb(hsl.h, targetS, targetL);
    };

    fl.hexToRgba = hexToRgba;
    fl.applyPeachFilterAndClamp = applyPeachFilterAndClamp;
    fl.getContrastColor = getContrastColor;
    fl.getReadableForeground = getReadableForeground;

})();
