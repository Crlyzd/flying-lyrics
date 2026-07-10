// =========================================================
//  popup.js - Main Bootstrapper
//  Hydrates the UI with stored settings and coordinates
//  the initial state push.
//
//  Loads last, after popup-state, ui, lyrics, visuals, settings.
// =========================================================

document.addEventListener('DOMContentLoaded', () => {
    const popup   = window.FLYING_LYRICS.popup;
    const el      = popup.el;
    const storage = window.FLYING_LYRICS.storage;

    // Fallbacks if config.js somehow isn't loaded yet into the background context
    const fallbackDefaults = {
        showTranslation: true, translationLang: popup.getBrowserDefaultLanguage(), globalSyncOffset: 1000, autoLaunch: false,
        customFont: "'Noto Sans', 'Segoe UI', sans-serif", fontSize: 26, bgBlur: 2, bgDarkness: 40,
        coverMode: 'centered', glowEnabled: false, glowStyle: 'theme', spotlightEnabled: false, lyricShadowEnabled: true, lyricAlignment: 'center',
        lineSpacing: 4, verticalAnchor: 5, albumCoverMode: false, telemetryConsent: true,
        pipMode: 'document', cloudSyncEnabled: true, ecoMode: true, fluidScrolling: false,
        lastPipWidth: 200, lastPipHeight: 250,
        
        themeAccent: 'galaxy',
        popupBgAnimation: false,
        galaxyMode: false,
        popupColor1: '#ff007f',
        popupColor2: '#00b4d8',
        popupColor3: '#1DB954'
    };

    storage.get(fallbackDefaults, (items) => {
        // Main settings
        if (el.toggleTrans) el.toggleTrans.checked = items.showTranslation;
        if (el.langSelect) el.langSelect.value = items.translationLang;
        
        popup.state.currentGlobalOffset = items.globalSyncOffset;
        if (el.globalOffsetInput) el.globalOffsetInput.value = popup.state.currentGlobalOffset;
        
        if (el.toggleAutolaunch) el.toggleAutolaunch.checked = items.autoLaunch;
        if (el.toggleBorderlessPip) el.toggleBorderlessPip.checked = items.pipMode === 'video';
        if (el.toggleEcoMode) el.toggleEcoMode.checked = items.ecoMode;
        if (el.toggleFluidScrolling) el.toggleFluidScrolling.checked = items.fluidScrolling;
        if (el.toggleCloudSync) el.toggleCloudSync.checked = items.cloudSyncEnabled;

        // Handle custom fonts correctly on load
        if (el.fontFamilySelect) {
            const matchedOption = Array.from(el.fontFamilySelect.options).find(opt => opt.value === items.customFont);
            if (matchedOption) {
                el.fontFamilySelect.value = items.customFont;
                if (el.customFontContainer) el.customFontContainer.style.display = 'none';
                popup.currentlyAppliedFont = items.customFont; // Let popup-visuals pick it up if needed
            } else {
                // It's a custom font — show the search UI and load it for preview
                el.fontFamilySelect.value = 'custom';
                if (el.customFontContainer) el.customFontContainer.style.display = 'block';

                let rawFontName = items.customFont.split(',')[0].replace(/['"]/g, '').trim();
                if (el.customFontInput) el.customFontInput.value = rawFontName;
                popup.currentlyAppliedFont = rawFontName;

                const formattedFontName = rawFontName.replace(/ /g, '+');
                const link = document.createElement('link');
                link.id = 'fl-custom-font-preview';
                link.rel = 'stylesheet';
                link.href = `https://fonts.googleapis.com/css2?family=${formattedFontName}:wght@400;600;700&display=swap`;
                document.head.appendChild(link);
            }
        }

        // Font Size (1-10 mapped to px)
        const fontStep = Math.max(1, Math.min(10, popup.fontPxToStep(items.fontSize)));
        if (el.fontSizeSlider) el.fontSizeSlider.value = fontStep;
        if (el.fontSizeValue) el.fontSizeValue.textContent = fontStep;
        if (el.fontSizeWarning) el.fontSizeWarning.style.display = fontStep >= 7 ? 'inline-block' : 'none';

        // Line Spacing (1-10 mapped to actual)
        const spacingStep = Math.max(1, Math.min(10, popup.spacingActualToStep(items.lineSpacing ?? 4)));
        if (el.lineSpacingSlider) el.lineSpacingSlider.value = spacingStep;
        if (el.lineSpacingValue) el.lineSpacingValue.textContent = spacingStep;

        // Vertical Anchor mapping (1-10 scale, defaults to 5)
        const anchorStep = Math.max(1, Math.min(10, items.verticalAnchor ?? 5));
        if (el.anchorSlider) el.anchorSlider.value = anchorStep;
        if (el.anchorValue) el.anchorValue.textContent = anchorStep;

        // Blur (0-10px)
        const blurStep = Math.max(1, Math.min(10, popup.blurPxToStep(items.bgBlur)));
        if (el.blurSlider) el.blurSlider.value = blurStep;
        if (el.blurValue) el.blurValue.textContent = blurStep;

        // Darkness (0-10 mapped to %)
        const darkStep = Math.max(1, Math.min(10, popup.darkPctToStep(items.bgDarkness)));
        if (el.darknessSlider) el.darknessSlider.value = darkStep;
        if (el.darknessValue) el.darknessValue.textContent = darkStep;

        if (el.alignSelect) el.alignSelect.value = items.lyricAlignment;
        
        if (el.toggleGlow) el.toggleGlow.checked = items.glowEnabled;
        if (el.glowStyleSelect) el.glowStyleSelect.value = items.glowStyle;
        if (el.glowStyleContainer) el.glowStyleContainer.style.display = items.glowEnabled ? 'flex' : 'none';
        if (el.glowPerfWarning) el.glowPerfWarning.style.display = items.glowEnabled ? 'block' : 'none';
        
        if (el.glowPreview) {
            el.glowPreview.classList.toggle('active', items.glowEnabled);
            el.glowPreview.classList.toggle('rainbow', items.glowStyle === 'rainbow');
            
            if (el.toggleSpotlight) {
                el.toggleSpotlight.checked = items.spotlightEnabled;
                el.glowPreview.classList.toggle('highlighted', items.spotlightEnabled);
            }

            if (el.toggleLyricShadow) {
                el.toggleLyricShadow.checked = items.lyricShadowEnabled ?? true;
                el.glowPreview.classList.toggle('shadow-disabled', !(items.lyricShadowEnabled ?? true));
            }
            
            el.glowPreview.style.fontFamily = items.customFont;
            el.glowPreview.style.fontSize = `${items.fontSize}px`;
        }

        // Load song vibrant color from local storage (written by extractPalette in content script)
        chrome.storage.local.get({ currentVibrantColor: '#1DB954' }, (colorData) => {
            if (el.glowPreview) el.glowPreview.style.setProperty('--glow-color', colorData.currentVibrantColor);
        });

        // Restore cover mode selection
        document.querySelectorAll('.cover-mode-option').forEach(opt => {
            opt.classList.toggle('selected', opt.dataset.mode === items.coverMode);
        });

        // Album Cover Mode
        if (el.toggleAlbumCoverMode) {
            el.toggleAlbumCoverMode.checked = items.albumCoverMode;
            if (popup.applyAlbumCoverModeState) popup.applyAlbumCoverModeState(items.albumCoverMode);
        }

        // Telemetry toggle initialization
        if (popup.updateTelemetryUI) popup.updateTelemetryUI(items.telemetryConsent);

        // Restore Galaxy Mode
        if (el.toggleGalaxyMode) {
            const hasGalaxyMode = items.galaxyMode ?? false;
            el.toggleGalaxyMode.checked = hasGalaxyMode;
            if (popup.applyGalaxyModeState) popup.applyGalaxyModeState(hasGalaxyMode);
        }

        // Background Animation
        if (el.toggleBgAnimation) {
            el.toggleBgAnimation.checked = items.popupBgAnimation;
            if (el.popupWindowContainer) {
                if (items.popupBgAnimation) el.popupWindowContainer.classList.remove('bg-frozen');
                else el.popupWindowContainer.classList.add('bg-frozen');
            }
        }

        if (popup.slotColors) {
            popup.slotColors[1] = items.popupColor1;
            popup.slotColors[2] = items.popupColor2;
            popup.slotColors[3] = items.popupColor3;
        }

        if (popup.updateCustomColors) popup.updateCustomColors();
        if (popup.selectColorSlot) popup.selectColorSlot(1);

        // Signal that the settings are fully loaded and applied, revealing the popup
        document.body.classList.add('loaded');

        // Remove preload class after rendering the initial state to enable animations
        setTimeout(() => {
            document.body.classList.remove('preload');
        }, 50);
    });
});
