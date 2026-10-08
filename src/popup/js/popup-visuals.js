// =========================================================
//  popup-visuals.js - Visual Customization Coordinator
//  Range sliders, glow toggles, album cover mode, sub-tabs,
//  collapsible accordions, and reset defaults buttons.
//
//  Depends on: popup-state.js, popup-ui.js,
//              popup-visuals-fonts.js, popup-visuals-colors.js
// =========================================================

document.addEventListener('DOMContentLoaded', () => {
    const popup   = window.FLYING_LYRICS.popup;
    const el      = popup.el;
    const storage = window.FLYING_LYRICS.storage;

    // Use helpers exposed from popup namespace by other modules
    const notifyTab           = popup.notifyTab;
    const saveAndNotify       = popup.saveAndNotify;
    const fontStepToPx        = popup.fontStepToPx;
    const spacingStepToActual = popup.spacingStepToActual;
    const darkStepToPct       = popup.darkStepToPct;
    const blurStepToPx        = popup.blurStepToPx;

    // =========================================================
    //  SLIDERS & BASIC SETTINGS
    // =========================================================
    function bindVisualSlider(slider, display, stepToVal, key, onPreview) {
        if (!slider) return;
        slider.addEventListener('input', () => {
            const step = parseInt(slider.value, 10);
            if (display) display.textContent = step;
            const val = stepToVal ? stepToVal(step) : step;
            if (onPreview) onPreview(val, step);
            notifyTab({ [key]: val });
        });
        slider.addEventListener('change', () => {
            const step = parseInt(slider.value, 10);
            saveAndNotify({ [key]: stepToVal ? stepToVal(step) : step });
        });
    }

    bindVisualSlider(el.fontSizeSlider, el.fontSizeValue, fontStepToPx, 'fontSize', (val, step) => {
        if (el.glowPreview) el.glowPreview.style.fontSize = `${val}px`;
        if (el.fontSizeWarning) el.fontSizeWarning.style.display = step >= 7 ? 'inline-block' : 'none';
    });
    bindVisualSlider(el.blurSlider, el.blurValue, blurStepToPx, 'bgBlur');
    bindVisualSlider(el.darknessSlider, el.darknessValue, darkStepToPct, 'bgDarkness');
    bindVisualSlider(el.lineSpacingSlider, el.lineSpacingValue, spacingStepToActual, 'lineSpacing');
    bindVisualSlider(el.anchorSlider, el.anchorValue, null, 'verticalAnchor');

    // =========================================================
    //  ALBUM COVER MODE & GLOW
    // =========================================================
    function applyAlbumCoverModeState(enabled) {
        if (el.visualControlsWrapper) el.visualControlsWrapper.classList.toggle('controls-disabled', enabled);
        if (el.albumCoverToggleCard) el.albumCoverToggleCard.classList.toggle('active', enabled);
    }
    popup.applyAlbumCoverModeState = applyAlbumCoverModeState; // expose for init

    if (el.toggleAlbumCoverMode) {
        el.toggleAlbumCoverMode.addEventListener('change', () => {
            const enabled = el.toggleAlbumCoverMode.checked;
            applyAlbumCoverModeState(enabled);
            saveAndNotify({ albumCoverMode: enabled });
        });
    }

    if (el.coverModeGroup) {
        el.coverModeGroup.addEventListener('click', (e) => {
            const option = e.target.closest('.cover-mode-option');
            if (!option) return;
            document.querySelectorAll('.cover-mode-option').forEach(o => o.classList.remove('selected'));
            option.classList.add('selected');
            saveAndNotify({ coverMode: option.dataset.mode });
        });
    }

    if (el.toggleGlow) {
        el.toggleGlow.addEventListener('change', () => {
            if (el.glowPreview) el.glowPreview.classList.toggle('active', el.toggleGlow.checked);
            if (el.glowStyleContainer) el.glowStyleContainer.style.display = el.toggleGlow.checked ? 'flex' : 'none';
            if (el.glowPerfWarning) el.glowPerfWarning.style.display = el.toggleGlow.checked ? 'block' : 'none';
            saveAndNotify({ glowEnabled: el.toggleGlow.checked });
        });
    }

    if (el.toggleSpotlight) {
        el.toggleSpotlight.addEventListener('change', () => {
            if (el.glowPreview) el.glowPreview.classList.toggle('highlighted', el.toggleSpotlight.checked);
            saveAndNotify({ spotlightEnabled: el.toggleSpotlight.checked });
        });
    }

    if (el.toggleLyricShadow) {
        el.toggleLyricShadow.addEventListener('change', () => {
            if (el.glowPreview) el.glowPreview.classList.toggle('shadow-disabled', !el.toggleLyricShadow.checked);
            saveAndNotify({ lyricShadowEnabled: el.toggleLyricShadow.checked });
        });
    }

    if (el.glowStyleSelect) {
        el.glowStyleSelect.addEventListener('change', () => {
            const val = el.glowStyleSelect.value;
            if (el.glowPreview) el.glowPreview.classList.toggle('rainbow', val === 'rainbow');
            saveAndNotify({ glowStyle: val });
        });
    }

    if (el.alignSelect) {
        el.alignSelect.addEventListener('change', () => {
            saveAndNotify({ lyricAlignment: el.alignSelect.value });
        });
    }

    // =========================================================
    //  GALAXY / BACKGROUND ANIMATION TOGGLES
    // =========================================================
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

    // =========================================================
    //  SUB-TAB LOGIC (PiP vs Popup Styling)
    // =========================================================
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

    // =========================================================
    //  COLLAPSIBLE GROUPS (ACCORDIONS) LOGIC
    // =========================================================
    const collapsibleGroups = document.querySelectorAll('.collapsible-group');
    collapsibleGroups.forEach(group => {
        const header = group.querySelector('.collapsible-header');
        if (!header) return;

        const storageKey = `collapsed_${group.id}`;
        
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

    // =========================================================
    //  INLINE RESET BUTTON HELPER (Non-blocking confirmation)
    // =========================================================
    function setupInlineResetButton(btn, defaultText, confirmText, onConfirm) {
        if (!btn) return;
        const span = btn.querySelector('span') || btn;
        let confirmTimer = null;

        function resetToDefault() {
            if (confirmTimer) {
                clearTimeout(confirmTimer);
                confirmTimer = null;
            }
            btn.classList.remove('is-confirming');
            span.textContent = defaultText;
        }

        btn.addEventListener('click', (e) => {
            e.stopPropagation();

            if (!btn.classList.contains('is-confirming')) {
                btn.classList.add('is-confirming');
                span.textContent = confirmText;
                confirmTimer = setTimeout(resetToDefault, 4000);
                return;
            }

            resetToDefault();
            onConfirm();

            span.textContent = "Reset!";
            setTimeout(() => {
                span.textContent = defaultText;
            }, 1200);
        });

        document.addEventListener('click', (e) => {
            if (!btn.contains(e.target) && btn.classList.contains('is-confirming')) {
                resetToDefault();
            }
        });
    }

    if (el.btnResetPipSettings) {
        setupInlineResetButton(
            el.btnResetPipSettings,
            'Reset Floating Defaults',
            'Confirm Reset?',
            () => {
                const pipDefaults = {
                    customFont: "'Fredoka', sans-serif", fontSize: 26, bgBlur: 2, bgDarkness: 40,
                    coverMode: 'fill', glowEnabled: false, glowStyle: 'theme', spotlightEnabled: false, lyricShadowEnabled: true, lyricAlignment: 'center',
                    lineSpacing: 4, verticalAnchor: 5, albumCoverMode: false,
                    lastPipWidth: 200, lastPipHeight: 250
                };

                if (el.fontFamilySelect) el.fontFamilySelect.value = pipDefaults.customFont;
                if (el.customFontContainer) el.customFontContainer.style.display = 'none';
                if (el.glowPreview) el.glowPreview.style.fontFamily = pipDefaults.customFont;
                if (popup.clearCustomFontSelection) popup.clearCustomFontSelection();

                if (el.fontSizeSlider) el.fontSizeSlider.value = 5;
                if (el.fontSizeValue) el.fontSizeValue.textContent = 5;
                if (el.glowPreview) el.glowPreview.style.fontSize = `${fontStepToPx(5)}px`;

                if (el.lineSpacingSlider) el.lineSpacingSlider.value = 5;
                if (el.lineSpacingValue) el.lineSpacingValue.textContent = 5;

                if (el.anchorSlider) el.anchorSlider.value = 5;
                if (el.anchorValue) el.anchorValue.textContent = 5;

                if (el.blurSlider) el.blurSlider.value = 5;
                if (el.blurValue) el.blurValue.textContent = 5;

                if (el.darknessSlider) el.darknessSlider.value = 5;
                if (el.darknessValue) el.darknessValue.textContent = 5;

                document.querySelectorAll('.cover-mode-option').forEach(o => {
                    o.classList.toggle('selected', o.dataset.mode === 'fill');
                });

                if (el.toggleAlbumCoverMode) el.toggleAlbumCoverMode.checked = false;
                applyAlbumCoverModeState(false);

                if (el.alignSelect) el.alignSelect.value = 'center';

                if (el.toggleGlow) el.toggleGlow.checked = false;
                if (el.glowPerfWarning) el.glowPerfWarning.style.display = 'none';
                if (el.toggleSpotlight) el.toggleSpotlight.checked = false;
                if (el.toggleLyricShadow) el.toggleLyricShadow.checked = true;
                if (el.glowPreview) el.glowPreview.classList.remove('active', 'rainbow', 'highlighted', 'shadow-disabled');
                if (el.glowStyleContainer) el.glowStyleContainer.style.display = 'none';
                if (el.glowStyleSelect) el.glowStyleSelect.value = 'theme';

                saveAndNotify(pipDefaults);
            }
        );
    }

    if (el.btnResetPopupSettings) {
        setupInlineResetButton(
            el.btnResetPopupSettings,
            'Reset Interface Defaults',
            'Confirm Reset?',
            () => {
                const popupDefaults = {
                    popupBgAnimation: false,
                    galaxyMode: false,
                    popupColor1: '#ff007f',
                    popupColor2: '#00b4d8',
                    popupColor3: '#1DB954'
                };

                if (el.toggleBgAnimation) el.toggleBgAnimation.checked = popupDefaults.popupBgAnimation;
                if (el.popupWindowContainer) el.popupWindowContainer.classList.add('bg-frozen');

                if (el.toggleGalaxyMode) {
                    el.toggleGalaxyMode.checked = popupDefaults.galaxyMode;
                    applyGalaxyModeState(popupDefaults.galaxyMode);
                }

                if (popup.slotColors) {
                    popup.slotColors[1] = popupDefaults.popupColor1;
                    popup.slotColors[2] = popupDefaults.popupColor2;
                    popup.slotColors[3] = popupDefaults.popupColor3;
                }

                if (popup.updateCustomColors) popup.updateCustomColors();
                if (popup.selectColorSlot) popup.selectColorSlot(1);

                saveAndNotify(popupDefaults);
            }
        );
    }
});
