// =========================================================
//  popup-state.js
//  Shared mutable state & DOM element registry.
//  Loaded immediately after popup-constants.js.
// =========================================================

window.FLYING_LYRICS = window.FLYING_LYRICS || {};
window.FLYING_LYRICS.popup = window.FLYING_LYRICS.popup || {};

window.FLYING_LYRICS.popup.state = {
    activeColorSlot:       1,
    slotColors: {
        1: '#ff007f',
        2: '#00b4d8',
        3: '#1DB954'
    },
    currentResults:        [],
    currentActiveTrack:    { artist: '', title: '' },
    currentEffectiveOffset: 1000,
    currentGlobalOffset:   1000,
    activeSource:          null,
    activeSearchQuery:     '',
    currentlyAppliedFont:  '',
    currentlyLoadingFont:  ''
};

window.FLYING_LYRICS.popup.el = null;


// =========================================================
//  ELEMENT REGISTRY — populated once on DOMContentLoaded
// =========================================================
document.addEventListener('DOMContentLoaded', () => {
    const popup = window.FLYING_LYRICS.popup;

    // Safety fallback: reveal the popup after 150ms even if storage retrieval lags
    setTimeout(() => {
        document.body.classList.add('loaded');
    }, 150);

    // Build element map — single getElementById per element, shared by all modules
    popup.el = {
        // ── General settings ──────────────────────────────────
        toggleTrans:          document.getElementById('toggle-translation'),
        toggleAutolaunch:     document.getElementById('toggle-autolaunch'),
        toggleBorderlessPip:  document.getElementById('toggle-borderless-pip'),
        labelBorderlessPip:   document.querySelector('label[for="toggle-borderless-pip"]'),
        borderlessPipWarning: document.getElementById('borderless-pip-warning'),
        borderlessPipHint:    document.getElementById('borderless-pip-hint'),
        toggleEcoMode:        document.getElementById('toggle-eco-mode'),
        toggleFluidScrolling: document.getElementById('toggle-fluid-scrolling'),
        toggleCloudSync:      document.getElementById('toggle-cloud-sync'),
        langSelect:           document.getElementById('lang-select'),
        telemetryToggle:      document.getElementById('telemetry-toggle'),
        appVersion:           document.getElementById('app-version'),

        // ── Sync offset ───────────────────────────────────────
        offsetMinus:          document.getElementById('offset-minus'),
        offsetPlus:           document.getElementById('offset-plus'),
        offsetDisplay:        document.getElementById('offset-display'),
        globalOffsetInput:    document.getElementById('global-offset-input'),
        globalOffsetSetBtn:   document.getElementById('global-offset-set-btn'),

        // ── Lyrics search ─────────────────────────────────────
        searchBtn:            document.getElementById('search-btn'),
        searchInput:          document.getElementById('search-query'),
        resultsContainer:     document.getElementById('search-results-container'),
        localUpload:          document.getElementById('local-lyric-upload'),
        editLyricBtn:         document.getElementById('edit-lyric-btn'),
        editLyricBtnText:     document.getElementById('edit-lyric-btn-text'),

        // ── Navigation ────────────────────────────────────────
        popupSlides:          document.getElementById('popup-slides'),
        popupWindowContainer: document.querySelector('.popup-window-container'),
        btnOpenHelp:          document.getElementById('btn-open-help'),

        // ── Font controls ─────────────────────────────────────
        fontFamilySelect:     document.getElementById('font-family-select'),
        customFontContainer:  document.getElementById('custom-font-container'),
        customFontInput:      document.getElementById('custom-font-input'),
        applyCustomFontBtn:   document.getElementById('apply-custom-font'),
        suggestFontsBtn:      document.getElementById('btn-suggest-fonts'),
        fontChipsContainer:   document.getElementById('font-chips-container'),
        fontResultsContainer: document.getElementById('font-results-container'),
        customFontLinkHint:   document.getElementById('custom-font-link-hint'),
        recentFontsBtn:       document.getElementById('btn-recent-fonts'),
        recentFontsPanel:     document.getElementById('recent-fonts-panel'),

        // ── Visual sliders ────────────────────────────────────
        fontSizeSlider:       document.getElementById('font-size-slider'),
        fontSizeValue:        document.getElementById('font-size-value'),
        blurSlider:           document.getElementById('blur-slider'),
        blurValue:            document.getElementById('blur-value'),
        darknessSlider:       document.getElementById('darkness-slider'),
        darknessValue:        document.getElementById('darkness-value'),
        lineSpacingSlider:    document.getElementById('line-spacing-slider'),
        lineSpacingValue:     document.getElementById('line-spacing-value'),
        anchorSlider:         document.getElementById('anchor-slider'),
        anchorValue:          document.getElementById('anchor-value'),

        // ── Glow / visual toggles ─────────────────────────────
        coverModeGroup:       document.getElementById('cover-mode-group'),
        toggleGlow:           document.getElementById('toggle-glow'),
        glowPerfWarning:      document.getElementById('glow-perf-warning'),
        toggleSpotlight:      document.getElementById('toggle-spotlight'),
        toggleLyricShadow:    document.getElementById('toggle-lyric-shadow'),
        glowStyleContainer:   document.getElementById('glow-style-container'),
        glowStyleSelect:      document.getElementById('glow-style-select'),
        alignSelect:          document.getElementById('align-select'),
        glowPreview:          document.getElementById('glow-preview'),
        fontSizeWarning:      document.getElementById('font-size-warning'),

        // ── Data management ───────────────────────────────────
        btnExportSettings:    document.getElementById('btn-export-settings'),
        btnImportSettings:    document.getElementById('btn-import-settings'),
        importFile:           document.getElementById('import-file'),
        toggleBackupCache:    document.getElementById('toggle-backup-cache'),

        // ── Album cover mode ──────────────────────────────────
        toggleAlbumCoverMode: document.getElementById('toggle-album-cover-mode'),
        visualControlsWrapper: document.getElementById('visual-controls-wrapper'),
        albumCoverToggleCard: document.getElementById('album-cover-toggle-card'),

        // ── Galaxy / theme toggles ────────────────────────────
        toggleBgAnimation:    document.getElementById('toggle-bg-animation'),
        toggleGalaxyMode:     document.getElementById('toggle-galaxy-mode'),
        btnResetPopupSettings: document.getElementById('btn-reset-popup-settings'),
        btnResetPipSettings:  document.getElementById('btn-reset-pip-settings'),

        // ── Sub-tab navigation (inside settings pane) ─────────
        subTabPipBtn:         document.getElementById('sub-tab-pip-btn'),
        subTabPopupBtn:       document.getElementById('sub-tab-popup-btn'),
        subTabPipPane:        document.getElementById('sub-tab-pip'),
        subTabPopupPane:      document.getElementById('sub-tab-popup'),

        // ── HSL Sliders & Swatches (Galaxy customizer) ────────
        hslHueSlider:         document.getElementById('hsl-hue'),
        hslSatSlider:         document.getElementById('hsl-saturation'),
        hslLightSlider:       document.getElementById('hsl-lightness'),
        hueValDisplay:        document.getElementById('hue-val-display'),
        satValDisplay:        document.getElementById('sat-val-display'),
        lightValDisplay:      document.getElementById('light-val-display'),

        // ── Review toast ──────────────────────────────────────
        reviewToast:          document.getElementById('review-toast'),
        closeToastBtn:        document.getElementById('close-review-toast'),
        snoozeToastBtn:       document.getElementById('snooze-review-toast'),
        reviewToastText:      document.getElementById('review-toast-text'),
        footerStarStrip:      document.getElementById('footer-star-strip'),
        starLabel:            document.getElementById('star-label'),

        // ── Platform Launcher ─────────────────────────────────
        btnLaunchSpotify:     document.getElementById('btn-launch-spotify'),
        btnLaunchYtm:         document.getElementById('btn-launch-ytm'),
    };
});
