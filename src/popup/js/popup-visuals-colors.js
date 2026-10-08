// =========================================================
//  popup-visuals-colors.js
//  HSL color customization, dynamic accent palette derivation,
//  slot selection, and preset color theme grids.
//
//  Depends on: popup-state.js, presets.js (colorPresets)
// =========================================================

document.addEventListener('DOMContentLoaded', () => {
    const popup   = window.FLYING_LYRICS.popup;
    const el      = popup.el;
    const saveAndNotify = popup.saveAndNotify;
    const notifyTab     = popup.notifyTab;

    let activeColorSlot = 1;
    let slotColors = {
        1: '#ff007f',
        2: '#00b4d8',
        3: '#1DB954'
    };
    popup.slotColors = slotColors;

    // =========================================================
    //  COLOR MATH UTILITIES
    // =========================================================
    function hexToRgba(hex, alpha) {
        let r = parseInt(hex.slice(1, 3), 16);
        let g = parseInt(hex.slice(3, 5), 16);
        let b = parseInt(hex.slice(5, 7), 16);
        return `rgba(${r}, ${g}, ${b}, ${alpha})`;
    }
    popup.hexToRgba = hexToRgba;

    function hexToHsl(hex) {
        let r = parseInt(hex.slice(1, 3), 16) / 255;
        let g = parseInt(hex.slice(3, 5), 16) / 255;
        let b = parseInt(hex.slice(5, 7), 16) / 255;
        let max = Math.max(r, g, b), min = Math.min(r, g, b);
        let h, s, l = (max + min) / 2;
        if (max === min) {
            h = s = 0;
        } else {
            let d = max - min;
            s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
            switch (max) {
                case r: h = (g - b) / d + (g < b ? 6 : 0); break;
                case g: h = (b - r) / d + 2; break;
                case b: h = (r - g) / d + 4; break;
            }
            h /= 6;
        }
        return [Math.round(h * 360), Math.round(s * 100), Math.round(l * 100)];
    }

    function hslToHex(h, s, l) {
        s /= 100;
        l /= 100;
        let c = (1 - Math.abs(2 * l - 1)) * s;
        let x = c * (1 - Math.abs((h / 60) % 2 - 1));
        let m = l - c / 2;
        let r = 0, g = 0, b = 0;
        if (0 <= h && h < 60) { r = c; g = x; b = 0; }
        else if (60 <= h && h < 120) { r = x; g = c; b = 0; }
        else if (120 <= h && h < 180) { r = 0; g = c; b = x; }
        else if (180 <= h && h < 240) { r = 0; g = x; b = c; }
        else if (240 <= h && h < 300) { r = x; g = 0; b = c; }
        else if (300 <= h && h < 360) { r = c; g = 0; b = x; }
        r = Math.round((r + m) * 255).toString(16).padStart(2, '0');
        g = Math.round((g + m) * 255).toString(16).padStart(2, '0');
        b = Math.round((b + m) * 255).toString(16).padStart(2, '0');
        return `#${r}${g}${b}`;
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

    // =========================================================
    //  THEME ACCENT / GALAXY HSL LOGIC
    // =========================================================
    function updateCustomColors() {
        const c1 = slotColors[1];
        const c2 = slotColors[2];
        const c3 = slotColors[3];

        const f1 = c1;
        const f2 = c2;
        const f3 = c3;

        const contrast1 = getContrastColor(f1);
        const contrast2 = getContrastColor(f2);
        const contrast3 = getContrastColor(f3);

        const fore1 = getReadableForeground(f1);
        const fore2 = getReadableForeground(f2);
        const fore3 = getReadableForeground(f3);

        if (document.getElementById('swatch-color-1')) {
            document.getElementById('swatch-color-1').style.backgroundColor = f1;
            document.getElementById('swatch-color-2').style.backgroundColor = f2;
            document.getElementById('swatch-color-3').style.backgroundColor = f3;
        }

        document.documentElement.style.setProperty('--accent-1', f1);
        document.documentElement.style.setProperty('--accent-2', f2);
        document.documentElement.style.setProperty('--accent-3', f3);
        
        document.documentElement.style.setProperty('--accent-1-contrast', contrast1);
        document.documentElement.style.setProperty('--accent-2-contrast', contrast2);
        document.documentElement.style.setProperty('--accent-3-contrast', contrast3);
        document.documentElement.style.setProperty('--accent-contrast', contrast1);
        document.documentElement.style.setProperty('--accent-blue-contrast', contrast2);
        document.documentElement.style.setProperty('--accent-green-contrast', contrast3);

        document.documentElement.style.setProperty('--accent-1-foreground', fore1);
        document.documentElement.style.setProperty('--accent-2-foreground', fore2);
        document.documentElement.style.setProperty('--accent-3-foreground', fore3);
        document.documentElement.style.setProperty('--accent-foreground', fore1);
        document.documentElement.style.setProperty('--accent-blue-foreground', fore2);
        document.documentElement.style.setProperty('--accent-green-foreground', fore3);

        document.documentElement.style.setProperty('--raw-accent-1', c1);
        document.documentElement.style.setProperty('--raw-accent-2', c2);
        document.documentElement.style.setProperty('--raw-accent-3', c3);
        document.documentElement.style.setProperty('--raw-accent', c1);
        document.documentElement.style.setProperty('--raw-accent-blue', c2);
        document.documentElement.style.setProperty('--raw-accent-green', c3);
        
        document.documentElement.style.setProperty('--accent-bg', hexToRgba(f1, 0.08));
        document.documentElement.style.setProperty('--accent-glow', hexToRgba(f1, 0.45));

        const logo = document.querySelector('.logo-row h2');
        if (logo) logo.style.textShadow = `0 0 8px ${hexToRgba(f1, 0.45)}`;
    }
    popup.updateCustomColors = updateCustomColors;

    function updateSliderBackgrounds(h, s, l) {
        if (el.hslSatSlider && el.hslLightSlider) {
            el.hslSatSlider.style.background = `linear-gradient(to right, ${hslToHex(h, 0, l)}, ${hslToHex(h, 100, l)})`;
            el.hslLightSlider.style.background = `linear-gradient(to right, #000000, ${hslToHex(h, s, 50)}, #ffffff)`;
        }
    }

    function selectColorSlot(slotId) {
        activeColorSlot = slotId;
        document.querySelectorAll('.color-swatch-btn').forEach((btn, idx) => {
            btn.classList.toggle('active', idx + 1 === slotId);
        });
        
        const hex = slotColors[slotId];
        const [h, s, l] = hexToHsl(hex);
        
        if (el.hslHueSlider) el.hslHueSlider.value = h;
        if (el.hslSatSlider) el.hslSatSlider.value = s;
        if (el.hslLightSlider) el.hslLightSlider.value = l;
        
        if (el.hueValDisplay) el.hueValDisplay.textContent = h + '°';
        if (el.satValDisplay) el.satValDisplay.textContent = s + '%';
        if (el.lightValDisplay) el.lightValDisplay.textContent = l + '%';
        
        updateSliderBackgrounds(h, s, l);
    }
    popup.selectColorSlot = selectColorSlot;

    function onHslSliderInput() {
        const h = parseInt(el.hslHueSlider.value);
        const s = parseInt(el.hslSatSlider.value);
        const l = parseInt(el.hslLightSlider.value);
        
        if (el.hueValDisplay) el.hueValDisplay.textContent = h + '°';
        if (el.satValDisplay) el.satValDisplay.textContent = s + '%';
        if (el.lightValDisplay) el.lightValDisplay.textContent = l + '%';
        
        const hex = hslToHex(h, s, l);
        slotColors[activeColorSlot] = hex;
        
        const swatch = document.getElementById('swatch-color-' + activeColorSlot);
        if (swatch) swatch.style.backgroundColor = hex;
        
        updateCustomColors();
        updateSliderBackgrounds(h, s, l);

        notifyTab({ [`popupColor${activeColorSlot}`]: hex });
    }

    function onHslSliderChange() {
        const h = parseInt(el.hslHueSlider.value);
        const s = parseInt(el.hslSatSlider.value);
        const l = parseInt(el.hslLightSlider.value);
        const hex = hslToHex(h, s, l);
        saveAndNotify({ [`popupColor${activeColorSlot}`]: hex });
    }

    if (el.hslHueSlider && el.hslSatSlider && el.hslLightSlider) {
        el.hslHueSlider.addEventListener('input', onHslSliderInput);
        el.hslSatSlider.addEventListener('input', onHslSliderInput);
        el.hslLightSlider.addEventListener('input', onHslSliderInput);

        el.hslHueSlider.addEventListener('change', onHslSliderChange);
        el.hslSatSlider.addEventListener('change', onHslSliderChange);
        el.hslLightSlider.addEventListener('change', onHslSliderChange);
    }

    const swatch1 = document.getElementById('swatch-btn-1');
    const swatch2 = document.getElementById('swatch-btn-2');
    const swatch3 = document.getElementById('swatch-btn-3');
    if (swatch1) swatch1.addEventListener('click', () => selectColorSlot(1));
    if (swatch2) swatch2.addEventListener('click', () => selectColorSlot(2));
    if (swatch3) swatch3.addEventListener('click', () => selectColorSlot(3));

    function applyPreset(c1, c2, c3) {
        slotColors[1] = c1;
        slotColors[2] = c2;
        slotColors[3] = c3;
        updateCustomColors();
        selectColorSlot(activeColorSlot);
        saveAndNotify({
            popupColor1: c1,
            popupColor2: c2,
            popupColor3: c3
        });
    }
    popup.applyPreset = applyPreset;

    function renderColorPresets() {
        const presets = window.FLYING_LYRICS.colorPresets;
        if (!presets) return;

        for (const [category, items] of Object.entries(presets)) {
            const grid = document.getElementById(`presets-grid-${category}`);
            if (!grid) continue;

            grid.innerHTML = '';
            const fragment = document.createDocumentFragment();
            items.forEach(preset => {
                const btn = document.createElement('button');
                btn.className = 'preset-btn';
                btn.type = 'button';
                btn.dataset.c1 = preset.colors[0];
                btn.dataset.c2 = preset.colors[1];
                btn.dataset.c3 = preset.colors[2];

                const colorsDiv = document.createElement('div');
                colorsDiv.className = 'preset-colors';

                preset.colors.forEach(color => {
                    const span = document.createElement('span');
                    span.style.background = color;
                    colorsDiv.appendChild(span);
                });

                const nameSpan = document.createElement('span');
                nameSpan.textContent = preset.name;

                btn.appendChild(colorsDiv);
                btn.appendChild(nameSpan);

                btn.addEventListener('click', () => {
                    applyPreset(preset.colors[0], preset.colors[1], preset.colors[2]);
                });

                fragment.appendChild(btn);
            });
            grid.appendChild(fragment);
        }
    }

    renderColorPresets();
});
