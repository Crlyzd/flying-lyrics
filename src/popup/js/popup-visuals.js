// =========================================================
//  popup-visuals.js
//  Visual customization: font search/loading, range sliders,
//  glow toggles, HSL pickers, preset palettes, and reset buttons.
//
//  Depends on: popup-state.js, popup-ui.js (for saveAndNotify,
//  notifyTab, checkIfPipOpen).
// =========================================================

document.addEventListener('DOMContentLoaded', () => {
    const popup   = window.FLYING_LYRICS.popup;
    const el      = popup.el;
    const state   = popup.state;
    const storage = window.FLYING_LYRICS.storage;

    // Use helpers exposed from popup namespace by other modules
    const notifyTab = popup.notifyTab;
    const saveAndNotify = popup.saveAndNotify;
    const fontStepToPx = popup.fontStepToPx;
    const spacingStepToActual = popup.spacingStepToActual;
    const darkStepToPct = popup.darkStepToPct;
    const blurStepToPx = popup.blurStepToPx;

    // Local module state
    let currentlyLoadingFont = "";
    let currentlyAppliedFont = "";
    let activeColorSlot = 1;
    let slotColors = {
        1: '#ff007f',
        2: '#00b4d8',
        3: '#1DB954'
    };

    /**
     * Helper to check if PIP is open.
     */
    function checkIfPipOpen() {
        return new Promise(resolve => {
            chrome.tabs.query({ url: ["*://open.spotify.com/*", "*://music.youtube.com/*"] }, (tabs) => {
                if (!tabs || tabs.length === 0) {
                    resolve(false);
                    return;
                }
                let resolved = false;
                let checkedCount = 0;
                tabs.forEach(tab => {
                    if (!tab.id) {
                        checkedCount++;
                        if (checkedCount === tabs.length && !resolved) {
                            resolved = true;
                            resolve(false);
                        }
                        return;
                    }
                    chrome.tabs.sendMessage(tab.id, { type: 'IS_PIP_OPEN' }, (response) => {
                        checkedCount++;
                        if (chrome.runtime.lastError) {
                            if (checkedCount === tabs.length && !resolved) {
                                resolved = true;
                                resolve(false);
                            }
                            return;
                        }
                        if (response && response.isOpen) {
                            if (!resolved) {
                                resolved = true;
                                resolve(true);
                            }
                        } else {
                            if (checkedCount === tabs.length && !resolved) {
                                resolved = true;
                                resolve(false);
                            }
                        }
                    });
                });
            });
        });
    }

    // =========================================================
    //  FONT FUZZY SEARCH / SUGGESTION ENGINE
    // =========================================================
    function fuzzyFontScore(font, query) {
        const f = font.toLowerCase();
        const q = query.toLowerCase();
        if (f === q) return 100;
        if (f.startsWith(q)) return 80;
        if (f.includes(q)) return 50;

        let fi = 0;
        let penalty = 0;
        let lastIdx = -1;
        for (const ch of q) {
            const idx = f.indexOf(ch, fi);
            if (idx === -1) return 0;
            penalty += (idx - lastIdx - 1);
            lastIdx = idx;
            fi = idx + 1;
        }
        return Math.max(1, 30 - penalty);
    }

    function onFontFinishedLoading(fontName, success = true) {
        if (currentlyLoadingFont === fontName) {
            currentlyLoadingFont = "";
            
            if (success) {
                currentlyAppliedFont = fontName;
            } else {
                if (el.fontFamilySelect) {
                    const matchedOption = Array.from(el.fontFamilySelect.options).find(opt => opt.value === currentlyAppliedFont);
                    if (matchedOption) {
                        el.fontFamilySelect.value = currentlyAppliedFont;
                    } else {
                        el.fontFamilySelect.value = 'custom';
                        el.customFontInput.value = currentlyAppliedFont;
                    }
                }
            }

            el.fontResultsContainer.querySelectorAll('.google-font-item').forEach(card => {
                const nameSpan = card.querySelector('span:first-child');
                const checkSpan = card.querySelector('.google-font-check');
                if (nameSpan && checkSpan) {
                    if (nameSpan.textContent === fontName) {
                        if (success) {
                            checkSpan.textContent = '✓';
                            checkSpan.className = 'google-font-check active';
                            checkSpan.removeAttribute('title');
                        } else {
                            checkSpan.textContent = '⚠️';
                            checkSpan.className = 'google-font-check active error';
                            checkSpan.title = 'Failed to load font. Using system fallback.';
                        }
                    } else if (nameSpan.textContent === currentlyAppliedFont) {
                        checkSpan.textContent = '✓';
                        checkSpan.className = 'google-font-check active';
                        checkSpan.removeAttribute('title');
                    } else {
                        checkSpan.className = 'google-font-check';
                        checkSpan.textContent = '✓';
                        checkSpan.removeAttribute('title');
                    }
                }
            });
        }
    }
    popup.onFontFinishedLoading = onFontFinishedLoading;

    function applyFontByName(fontName) {
        if (!fontName) return;
        currentlyLoadingFont = fontName;

        el.fontResultsContainer.querySelectorAll('.google-font-item').forEach(card => {
            const nameSpan = card.querySelector('span:first-child');
            const checkSpan = card.querySelector('.google-font-check');
            if (nameSpan && checkSpan) {
                if (nameSpan.textContent === fontName) {
                    checkSpan.className = 'google-font-check active loading';
                } else {
                    checkSpan.className = 'google-font-check';
                }
            }
        });

        const formattedFontName = fontName.replace(/ /g, '+');
        const fontUrl = `https://fonts.googleapis.com/css2?family=${formattedFontName}:wght@400;600;700&display=swap`;

        let link = document.getElementById('fl-custom-font-preview');
        if (!link) {
            link = document.createElement('link');
            link.id = 'fl-custom-font-preview';
            link.rel = 'stylesheet';
            document.head.appendChild(link);
        }

        const familyValue = `"${fontName}", sans-serif`;
        el.glowPreview.style.fontFamily = familyValue;
        saveAndNotify({ customFont: familyValue });

        checkIfPipOpen().then(isOpen => {
            if (isOpen) {
                if (link.href !== fontUrl) {
                    link.href = fontUrl;
                }
            } else {
                if (link.href === fontUrl) {
                    document.fonts.load(`1em "${fontName}"`).then(() => {
                        onFontFinishedLoading(fontName, true);
                    }).catch(() => {
                        onFontFinishedLoading(fontName, false);
                    });
                } else {
                    link.onload = () => {
                        requestAnimationFrame(() => {
                            document.fonts.load(`1em "${fontName}"`).then(() => {
                                onFontFinishedLoading(fontName, true);
                            }).catch(() => {
                                onFontFinishedLoading(fontName, false);
                            });
                        });
                    };
                    link.onerror = () => {
                        onFontFinishedLoading(fontName, false);
                    };
                    link.href = fontUrl;
                }
            }
        });

        storage.get({ recentFonts: [] }, ({ recentFonts }) => {
            const updated = [fontName, ...recentFonts.filter(f => f !== fontName)].slice(0, 10);
            storage.set({ recentFonts: updated });
        });

        return familyValue;
    }

    function clearCustomFontSelection() {
        currentlyAppliedFont = "";
        currentlyLoadingFont = "";
        el.fontResultsContainer.querySelectorAll('.google-font-item').forEach(card => {
            const checkSpan = card.querySelector('.google-font-check');
            if (checkSpan) {
                checkSpan.className = 'google-font-check';
            }
        });
    }

    function renderFontResults(results) {
        el.fontResultsContainer.innerHTML = '';
        if (results.length === 0) {
            el.fontResultsContainer.innerHTML = '<div class="status-msg">No fonts found</div>';
            el.fontResultsContainer.style.display = 'block';
            return;
        }

        results.forEach(name => {
            const card = document.createElement('div');
            card.className = 'google-font-item';

            const nameSpan = document.createElement('span');
            nameSpan.textContent = name;

            const checkSpan = document.createElement('span');
            checkSpan.textContent = '✓';
            if (currentlyLoadingFont === name) {
                checkSpan.className = 'google-font-check active loading';
            } else if (currentlyAppliedFont === name) {
                checkSpan.className = 'google-font-check active';
            } else {
                checkSpan.className = 'google-font-check';
            }

            card.appendChild(nameSpan);
            card.appendChild(checkSpan);

            card.onclick = () => {
                applyFontByName(name);
                el.customFontInput.value = name;
            };

            el.fontResultsContainer.appendChild(card);
        });
        el.fontResultsContainer.style.display = 'block';
    }

    function searchFonts() {
        const query = el.customFontInput.value.trim();
        if (!query) return;

        const fontList = typeof GOOGLE_FONTS !== 'undefined' ? GOOGLE_FONTS : [];
        const scored = fontList
            .map(name => ({ name, score: fuzzyFontScore(name, query) }))
            .filter(x => x.score > 0)
            .sort((a, b) => b.score - a.score)
            .slice(0, 20)
            .map(x => x.name);

        renderFontResults(scored);
    }

    function generateFontSuggestions() {
        const fontList = typeof GOOGLE_FONTS !== 'undefined' ? GOOGLE_FONTS : [];
        const picked = new Set();
        while (picked.size < 5 && picked.size < fontList.length) {
            picked.add(Math.floor(Math.random() * fontList.length));
        }
        const shuffled = [...picked].map(i => fontList[i]);

        el.fontChipsContainer.innerHTML = '';
        shuffled.forEach(name => {
            const chip = document.createElement('button');
            chip.textContent = name;
            chip.className = 'font-chip';
            chip.onclick = () => {
                el.customFontInput.value = name;
                applyFontByName(name);
                searchFonts();
            };
            el.fontChipsContainer.appendChild(chip);
        });
        el.fontChipsContainer.style.display = 'flex';
    }

    el.applyCustomFontBtn.addEventListener('click', searchFonts);
    el.customFontInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') searchFonts();
    });
    el.suggestFontsBtn.addEventListener('click', generateFontSuggestions);

    el.fontFamilySelect.addEventListener('change', () => {
        const val = el.fontFamilySelect.value;
        if (val === 'custom') {
            el.customFontContainer.style.display = 'block';
            el.customFontInput.focus();
        } else {
            el.customFontContainer.style.display = 'none';
            el.glowPreview.style.fontFamily = val;
            saveAndNotify({ customFont: val });
            clearCustomFontSelection();
        }
    });

    // Recent Fonts
    function renderRecentFontsPanel(recentFonts) {
        el.recentFontsPanel.innerHTML = '';
        if (!recentFonts || recentFonts.length === 0) {
            el.recentFontsPanel.innerHTML = '<div class="status-msg--dim">No recent fonts yet</div>';
            return;
        }
        recentFonts.forEach(name => {
            const card = document.createElement('div');
            card.className = 'recent-font-item';
            card.textContent = name;
            card.onclick = () => {
                el.customFontInput.value = name;
                applyFontByName(name);
                searchFonts();
                el.recentFontsPanel.style.display = 'none';
                el.recentFontsBtn.classList.remove('active');
            };
            el.recentFontsPanel.appendChild(card);
        });
    }

    el.recentFontsBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const isVisible = el.recentFontsPanel.style.display !== 'none';
        if (isVisible) {
            el.recentFontsPanel.style.display = 'none';
            el.recentFontsBtn.classList.remove('active');
        } else {
            storage.get({ recentFonts: [] }, ({ recentFonts }) => {
                renderRecentFontsPanel(recentFonts);
                el.recentFontsPanel.style.display = 'block';
                el.recentFontsBtn.classList.add('active');
            });
        }
    });

    document.addEventListener('click', () => {
        if (el.recentFontsPanel) {
            el.recentFontsPanel.style.display = 'none';
            el.recentFontsBtn.classList.remove('active');
        }
    });

    // =========================================================
    //  SLIDERS & BASIC SETTINGS
    // =========================================================
    el.fontSizeSlider.addEventListener('input', () => {
        const step = parseInt(el.fontSizeSlider.value, 10);
        el.fontSizeValue.textContent = step;
        const realPx = fontStepToPx(step);
        el.glowPreview.style.fontSize = `${realPx}px`;

        if (el.fontSizeWarning) {
            el.fontSizeWarning.style.display = step >= 7 ? 'inline-block' : 'none';
        }
        notifyTab({ fontSize: realPx });
    });
    el.fontSizeSlider.addEventListener('change', () => {
        const step = parseInt(el.fontSizeSlider.value, 10);
        saveAndNotify({ fontSize: fontStepToPx(step) });
    });

    el.blurSlider.addEventListener('input', () => {
        const step = parseInt(el.blurSlider.value, 10);
        el.blurValue.textContent = step;
        notifyTab({ bgBlur: blurStepToPx(step) });
    });
    el.blurSlider.addEventListener('change', () => {
        const step = parseInt(el.blurSlider.value, 10);
        saveAndNotify({ bgBlur: blurStepToPx(step) });
    });

    el.darknessSlider.addEventListener('input', () => {
        const step = parseInt(el.darknessSlider.value, 10);
        el.darknessValue.textContent = step;
        notifyTab({ bgDarkness: darkStepToPct(step) });
    });
    el.darknessSlider.addEventListener('change', () => {
        const step = parseInt(el.darknessSlider.value, 10);
        saveAndNotify({ bgDarkness: darkStepToPct(step) });
    });

    el.lineSpacingSlider.addEventListener('input', () => {
        const step = parseInt(el.lineSpacingSlider.value, 10);
        el.lineSpacingValue.textContent = step;
        notifyTab({ lineSpacing: spacingStepToActual(step) });
    });
    el.lineSpacingSlider.addEventListener('change', () => {
        const step = parseInt(el.lineSpacingSlider.value, 10);
        saveAndNotify({ lineSpacing: spacingStepToActual(step) });
    });

    el.anchorSlider.addEventListener('input', () => {
        const step = parseInt(el.anchorSlider.value, 10);
        el.anchorValue.textContent = step;
        notifyTab({ verticalAnchor: step });
    });
    el.anchorSlider.addEventListener('change', () => {
        const step = parseInt(el.anchorSlider.value, 10);
        saveAndNotify({ verticalAnchor: step });
    });

    // =========================================================
    //  ALBUM COVER MODE & GLOW
    // =========================================================
    function applyAlbumCoverModeState(enabled) {
        el.visualControlsWrapper.classList.toggle('controls-disabled', enabled);
        el.albumCoverToggleCard.classList.toggle('active', enabled);
    }
    popup.applyAlbumCoverModeState = applyAlbumCoverModeState; // expose for init

    el.toggleAlbumCoverMode.addEventListener('change', () => {
        const enabled = el.toggleAlbumCoverMode.checked;
        applyAlbumCoverModeState(enabled);
        saveAndNotify({ albumCoverMode: enabled });
    });

    el.coverModeGroup.addEventListener('click', (e) => {
        const option = e.target.closest('.cover-mode-option');
        if (!option) return;
        document.querySelectorAll('.cover-mode-option').forEach(o => o.classList.remove('selected'));
        option.classList.add('selected');
        saveAndNotify({ coverMode: option.dataset.mode });
    });

    el.toggleGlow.addEventListener('change', () => {
        el.glowPreview.classList.toggle('active', el.toggleGlow.checked);
        el.glowStyleContainer.style.display = el.toggleGlow.checked ? 'flex' : 'none';
        el.glowPerfWarning.style.display = el.toggleGlow.checked ? 'block' : 'none';
        saveAndNotify({ glowEnabled: el.toggleGlow.checked });
    });

    el.toggleSpotlight.addEventListener('change', () => {
        el.glowPreview.classList.toggle('highlighted', el.toggleSpotlight.checked);
        saveAndNotify({ spotlightEnabled: el.toggleSpotlight.checked });
    });

    el.toggleLyricShadow.addEventListener('change', () => {
        el.glowPreview.classList.toggle('shadow-disabled', !el.toggleLyricShadow.checked);
        saveAndNotify({ lyricShadowEnabled: el.toggleLyricShadow.checked });
    });

    el.glowStyleSelect.addEventListener('change', () => {
        const val = el.glowStyleSelect.value;
        el.glowPreview.classList.toggle('rainbow', val === 'rainbow');
        saveAndNotify({ glowStyle: val });
    });

    el.alignSelect.addEventListener('change', () => {
        saveAndNotify({ lyricAlignment: el.alignSelect.value });
    });

    // =========================================================
    //  THEME ACCENT / GALAXY HSL LOGIC
    // =========================================================
    function hexToRgba(hex, alpha) {
        let r = parseInt(hex.slice(1, 3), 16);
        let g = parseInt(hex.slice(3, 5), 16);
        let b = parseInt(hex.slice(5, 7), 16);
        return `rgba(${r}, ${g}, ${b}, ${alpha})`;
    }

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

    function updateCustomColors() {
        const c1 = slotColors[1];
        const c2 = slotColors[2];
        const c3 = slotColors[3];

        const f1 = applyPeachFilterAndClamp(c1);
        const f2 = applyPeachFilterAndClamp(c2);
        const f3 = applyPeachFilterAndClamp(c3);

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
    popup.updateCustomColors = updateCustomColors; // expose for init

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
        
        el.hslHueSlider.value = h;
        el.hslSatSlider.value = s;
        el.hslLightSlider.value = l;
        
        el.hueValDisplay.textContent = h + '°';
        el.satValDisplay.textContent = s + '%';
        el.lightValDisplay.textContent = l + '%';
        
        updateSliderBackgrounds(h, s, l);
    }
    popup.selectColorSlot = selectColorSlot; // expose for init
    popup.slotColors = slotColors; // Expose slot storage for init

    function onHslSliderInput() {
        const h = parseInt(el.hslHueSlider.value);
        const s = parseInt(el.hslSatSlider.value);
        const l = parseInt(el.hslLightSlider.value);
        
        el.hueValDisplay.textContent = h + '°';
        el.satValDisplay.textContent = s + '%';
        el.lightValDisplay.textContent = l + '%';
        
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
    if (swatch1 && swatch2 && swatch3) {
        swatch1.addEventListener('click', () => selectColorSlot(1));
        swatch2.addEventListener('click', () => selectColorSlot(2));
        swatch3.addEventListener('click', () => selectColorSlot(3));
    }

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

    document.querySelectorAll('.preset-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            applyPreset(btn.dataset.c1, btn.dataset.c2, btn.dataset.c3);
        });
    });

    // Galaxy / Animations
    function applyGalaxyModeState(enabled) {
        if (el.popupWindowContainer) {
            el.popupWindowContainer.classList.toggle('theme-classic', !enabled);
        }
    }
    popup.applyGalaxyModeState = applyGalaxyModeState;

    if (el.toggleGalaxyMode) {
        el.toggleGalaxyMode.addEventListener('change', () => {
            const enabled = el.toggleGalaxyMode.checked;
            applyGalaxyModeState(enabled);
            saveAndNotify({ galaxyMode: enabled });
        });
    }

    if (el.toggleBgAnimation) {
        el.toggleBgAnimation.addEventListener('change', () => {
            const animated = el.toggleBgAnimation.checked;
            if (el.popupWindowContainer) el.popupWindowContainer.classList.toggle('bg-frozen', !animated);
            saveAndNotify({ popupBgAnimation: animated });
        });
    }

    // Sub-tab logic
    if (el.subTabPipBtn && el.subTabPopupBtn) {
        el.subTabPipBtn.addEventListener('click', () => {
            el.subTabPipBtn.classList.add('active');
            el.subTabPopupBtn.classList.remove('active');
            el.subTabPipPane.classList.add('active');
            el.subTabPopupPane.classList.remove('active');
        });

        el.subTabPopupBtn.addEventListener('click', () => {
            el.subTabPopupBtn.classList.add('active');
            el.subTabPipBtn.classList.remove('active');
            el.subTabPopupPane.classList.add('active');
            el.subTabPipPane.classList.remove('active');
        });
    }

    // Collapsible Groups (Accordions) Logic
    const collapsibleGroups = document.querySelectorAll('.collapsible-group');
    collapsibleGroups.forEach(group => {
        const header = group.querySelector('.collapsible-header');
        if (!header) return;

        const storageKey = `collapsed_${group.id}`;
        
        // Load initial state (Default both to collapsed: true)
        storage.get({ [storageKey]: true }, (res) => {
            const isCollapsed = res[storageKey];
            if (isCollapsed) {
                group.classList.add('collapsed');
                header.setAttribute('aria-expanded', 'false');
            } else {
                group.classList.remove('collapsed');
                header.setAttribute('aria-expanded', 'true');
            }
        });

        header.addEventListener('click', () => {
            const isCollapsedNow = group.classList.toggle('collapsed');
            header.setAttribute('aria-expanded', !isCollapsedNow ? 'true' : 'false');
            saveAndNotify({ [storageKey]: isCollapsedNow });
        });
    });

    // Resets
    if (el.btnResetPipSettings) {
        el.btnResetPipSettings.addEventListener('click', () => {
            if (!confirm('Reset Floating Window visual settings to default?')) return;

            const pipDefaults = {
                customFont: "'Noto Sans', 'Segoe UI', sans-serif", fontSize: 26, bgBlur: 2, bgDarkness: 40,
                coverMode: 'centered', glowEnabled: false, glowStyle: 'theme', spotlightEnabled: false, lyricShadowEnabled: true, lyricAlignment: 'center',
                lineSpacing: 4, verticalAnchor: 5, albumCoverMode: false,
                lastPipWidth: 200, lastPipHeight: 250
            };

            el.fontFamilySelect.value = pipDefaults.customFont;
            el.customFontContainer.style.display = 'none';
            el.glowPreview.style.fontFamily = pipDefaults.customFont;
            clearCustomFontSelection();

            el.fontSizeSlider.value = 5;
            el.fontSizeValue.textContent = 5;
            el.glowPreview.style.fontSize = `${fontStepToPx(5)}px`;

            el.lineSpacingSlider.value = 5;
            el.lineSpacingValue.textContent = 5;

            el.anchorSlider.value = 5;
            el.anchorValue.textContent = 5;

            el.blurSlider.value = 5;
            el.blurValue.textContent = 5;

            el.darknessSlider.value = 5;
            el.darknessValue.textContent = 5;

            document.querySelectorAll('.cover-mode-option').forEach(o => {
                o.classList.toggle('selected', o.dataset.mode === 'default');
            });

            el.toggleAlbumCoverMode.checked = false;
            applyAlbumCoverModeState(false);

            el.alignSelect.value = 'center';

            el.toggleGlow.checked = false;
            el.glowPerfWarning.style.display = 'none';
            el.toggleSpotlight.checked = false;
            el.toggleLyricShadow.checked = true;
            el.glowPreview.classList.remove('active', 'rainbow', 'highlighted', 'shadow-disabled');
            el.glowStyleContainer.style.display = 'none';
            el.glowStyleSelect.value = 'theme';

            saveAndNotify(pipDefaults);

            el.btnResetPipSettings.querySelector('span').textContent = "Reset!";
            setTimeout(() => {
                el.btnResetPipSettings.querySelector('span').textContent = 'Reset Floating Defaults';
            }, 1000);
        });
    }

    if (el.btnResetPopupSettings) {
        el.btnResetPopupSettings.addEventListener('click', () => {
            if (!confirm('Reset settings popup interface visuals to default?')) return;

            const popupDefaults = {
                popupBgAnimation: false,
                galaxyMode: false,
                popupColor1: '#ff007f',
                popupColor2: '#00b4d8',
                popupColor3: '#1DB954'
            };

            el.toggleBgAnimation.checked = popupDefaults.popupBgAnimation;
            if (el.popupWindowContainer) el.popupWindowContainer.classList.remove('bg-frozen');

            if (el.toggleGalaxyMode) {
                el.toggleGalaxyMode.checked = popupDefaults.galaxyMode;
                applyGalaxyModeState(popupDefaults.galaxyMode);
            }

            slotColors[1] = popupDefaults.popupColor1;
            slotColors[2] = popupDefaults.popupColor2;
            slotColors[3] = popupDefaults.popupColor3;

            updateCustomColors();
            selectColorSlot(activeColorSlot);

            saveAndNotify(popupDefaults);

            el.btnResetPopupSettings.querySelector('span').textContent = "Reset!";
            setTimeout(() => {
                el.btnResetPopupSettings.querySelector('span').textContent = 'Reset Interface Defaults';
            }, 1000);
        });
    }
});
