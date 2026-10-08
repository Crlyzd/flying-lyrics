// =========================================================
//  popup-visuals-fonts.js
//  Google Font search, fuzzy matching, dynamic font preview,
//  and recent fonts management.
//
//  Depends on: popup-state.js, fonts.js (GOOGLE_FONTS)
// =========================================================

document.addEventListener('DOMContentLoaded', () => {
    const popup   = window.FLYING_LYRICS.popup;
    const el      = popup.el;
    const storage = window.FLYING_LYRICS.storage;
    const saveAndNotify = popup.saveAndNotify;

    let currentlyLoadingFont = "";
    let currentlyAppliedFont = "";

    function checkIfPipOpen() {
        if (typeof popup.checkIfPipOpen === 'function') {
            return popup.checkIfPipOpen();
        }
        return new Promise(resolve => {
            chrome.tabs.query({ url: ["*://open.spotify.com/*", "*://music.youtube.com/*"] }, (tabs) => {
                if (!tabs || tabs.length === 0) { resolve(false); return; }
                let resolved = false;
                let checkedCount = 0;
                tabs.forEach(tab => {
                    if (!tab.id) {
                        checkedCount++;
                        if (checkedCount === tabs.length && !resolved) { resolved = true; resolve(false); }
                        return;
                    }
                    chrome.tabs.sendMessage(tab.id, { type: 'IS_PIP_OPEN' }, (response) => {
                        checkedCount++;
                        if (chrome.runtime.lastError) {
                            if (checkedCount === tabs.length && !resolved) { resolved = true; resolve(false); }
                            return;
                        }
                        if (response && response.isOpen) {
                            if (!resolved) { resolved = true; resolve(true); }
                        } else {
                            if (checkedCount === tabs.length && !resolved) { resolved = true; resolve(false); }
                        }
                    });
                });
            });
        });
    }
    popup.checkIfPipOpen = checkIfPipOpen;

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
                    const cleanFont = (val) => (val || '').replace(/['"]/g, '').trim().toLowerCase();
                    const matchedOption = Array.from(el.fontFamilySelect.options).find(opt => cleanFont(opt.value) === cleanFont(currentlyAppliedFont));
                    if (matchedOption) {
                        el.fontFamilySelect.value = matchedOption.value;
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
    popup.applyFontByName = applyFontByName;

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
    popup.clearCustomFontSelection = clearCustomFontSelection;

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

    if (el.applyCustomFontBtn) el.applyCustomFontBtn.addEventListener('click', searchFonts);
    if (el.customFontInput) {
        el.customFontInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') searchFonts();
        });
    }
    if (el.suggestFontsBtn) el.suggestFontsBtn.addEventListener('click', generateFontSuggestions);

    if (el.fontFamilySelect) {
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
    }

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

    if (el.recentFontsBtn) {
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
    }

    document.addEventListener('click', () => {
        if (el.recentFontsPanel) {
            el.recentFontsPanel.style.display = 'none';
            el.recentFontsBtn.classList.remove('active');
        }
    });
});
