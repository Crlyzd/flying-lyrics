// =========================================================
//  popup-state.js
//  Shared namespace, constants, state, element registry.
//  MUST be the first <script> loaded after fonts.js.
//
//  All other popup modules read from:
//    window.FLYING_LYRICS.popup.el   — cached DOM element map
//    window.FLYING_LYRICS.popup.state — mutable runtime state
//    window.FLYING_LYRICS.popup.*    — constants & utilities
// =========================================================

// Ensure the root namespace exists (created by background.js / storage.js)
window.FLYING_LYRICS = window.FLYING_LYRICS || {};

window.FLYING_LYRICS.popup = {

    // =========================================================
    //  LANGUAGE CATALOGUE
    // =========================================================
    LANGUAGES: [
        { code: 'en',    name: 'English' },
        { code: 'zh-CN', name: 'Chinese (Simplified)' },
        { code: 'zh-TW', name: 'Chinese (Traditional)' },
        { code: 'es',    name: 'Spanish' },
        { code: 'fr',    name: 'French' },
        { code: 'ar',    name: 'Arabic' },
        { code: 'ru',    name: 'Russian' },
        { code: 'pt',    name: 'Portuguese' },
        { code: 'id',    name: 'Indonesian' },
        { code: 'de',    name: 'German' },
        { code: 'ja',    name: 'Japanese' },
        { code: 'tr',    name: 'Turkish' },
        { code: 'vi',    name: 'Vietnamese' },
        { code: 'ko',    name: 'Korean' },
        { code: 'fa',    name: 'Persian' },
        { code: 'it',    name: 'Italian' },
        { code: 'th',    name: 'Thai' },
        { code: 'ku',    name: 'Kurdish' }
    ],

    // =========================================================
    //  REVIEW / STORE CONSTANTS
    // =========================================================
    EDGE_EXTENSION_ID: 'ipcakmeelnooilncnjinnfjcodejbcoa',
    CHROME_REVIEW_URL: 'https://chrome.google.com/webstore/detail/ehjobcjhlmgmpaikciicipmlpknipikd/reviews',
    EDGE_REVIEW_URL:   'https://microsoftedge.microsoft.com/addons/detail/flying-lyrics-romanize-/ipcakmeelnooilncnjinnfjcodejbcoa',

    // =========================================================
    //  STORAGE DEFAULT VALUES
    //  Single source of truth — used in every storage.get() call
    //  that needs baseline values before a user has saved anything.
    // =========================================================
    DEFAULTS: {
        showTranslation:     true,
        translationLang:     'en',           // overridden at runtime by getBrowserDefaultLanguage()
        globalSyncOffset:    1000,
        autoLaunch:          false,
        customFont:          "'Noto Sans', 'Segoe UI', sans-serif",
        fontSize:            26,
        bgBlur:              2,
        bgDarkness:          40,
        coverMode:           'centered',
        glowEnabled:         false,
        glowStyle:           'theme',
        spotlightEnabled:    false,
        lyricShadowEnabled:  true,
        lyricAlignment:      'center',
        lineSpacing:         4,
        verticalAnchor:      5,
        albumCoverMode:      false,
        telemetryConsent:    true,
        pipMode:             'document',
        cloudSyncEnabled:    true,
        ecoMode:             true,
        lastPipWidth:        200,
        lastPipHeight:       250,
        themeAccent:         'galaxy',
        popupBgAnimation:    false,
        galaxyMode:          false,
        popupColor1:         '#ff007f',
        popupColor2:         '#00b4d8',
        popupColor3:         '#1DB954'
    },

    // =========================================================
    //  MUTABLE RUNTIME STATE
    //  Modules mutate these via the popup namespace directly,
    //  e.g.  window.FLYING_LYRICS.popup.state.currentResults = [...]
    // =========================================================
    state: {
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
    },

    // =========================================================
    //  UNIT CONVERSION HELPERS  (single source of truth)
    // =========================================================

    /** Font size: UI step 1–10  ↔  actual px 18–36 */
    fontStepToPx: (step) => 18 + ((step - 1) * 2),
    fontPxToStep: (px)   => Math.round((px - 18) / 2) + 1,

    /** Background darkness: UI step 1–10  ↔  actual percent 0–100 */
    darkStepToPct: (step) => {
        const map = [0, 0, 8, 16, 24, 40, 52, 64, 76, 88, 100];
        return map[Math.max(1, Math.min(10, step))] ?? 40;
    },
    darkPctToStep: (pct) => {
        const map = [0, 0, 8, 16, 24, 40, 52, 64, 76, 88, 100];
        let closestIdx = 5;
        let minDiff = Infinity;
        for (let i = 1; i < map.length; i++) {
            const diff = Math.abs(map[i] - pct);
            if (diff < minDiff) {
                minDiff = diff;
                closestIdx = i;
            }
        }
        return closestIdx;
    },

    /** Background blur: UI step 1–10  ↔  actual px 0–10px */
    blurStepToPx: (step) => {
        const map = [0, 0, 0.4, 0.8, 1.2, 2.0, 3.6, 5.2, 6.8, 8.4, 10.0];
        return map[Math.max(1, Math.min(10, step))] ?? 2.0;
    },
    blurPxToStep: (px) => {
        const map = [0, 0, 0.4, 0.8, 1.2, 2.0, 3.6, 5.2, 6.8, 8.4, 10.0];
        let closestIdx = 5;
        let minDiff = Infinity;
        for (let i = 1; i < map.length; i++) {
            const diff = Math.abs(map[i] - px);
            if (diff < minDiff) {
                minDiff = diff;
                closestIdx = i;
            }
        }
        return closestIdx;
    },

    /** Line spacing: UI step 1–10  ↔  actual vmin multiplier 1–12 */
    spacingStepToActual: (step) => {
        const map = [0, 1.0, 1.8, 2.5, 3.2, 4.0, 5.5, 7.0, 8.5, 10.0, 12.0];
        return map[Math.max(1, Math.min(10, step))] ?? 4.0;
    },
    spacingActualToStep: (val) => {
        const map = [0, 1.0, 1.8, 2.5, 3.2, 4.0, 5.5, 7.0, 8.5, 10.0, 12.0];
        let closestIdx = 5;
        let minDiff = Infinity;
        for (let i = 1; i < map.length; i++) {
            const diff = Math.abs(map[i] - val);
            if (diff < minDiff) {
                minDiff = diff;
                closestIdx = i;
            }
        }
        return closestIdx;
    },

    // =========================================================
    //  BROWSER LANGUAGE DETECTION
    // =========================================================

    /**
     * Reads the browser's UI language and navigator.languages to
     * find the best matching supported lyric language code.
     * @returns {string} A supported language code, e.g. 'en', 'zh-CN'.
     */
    getBrowserDefaultLanguage() {
        const supportedCodes = this.LANGUAGES.map(l => l.code);

        const preferences = [];
        if (typeof chrome !== 'undefined' && chrome.i18n && typeof chrome.i18n.getUILanguage === 'function') {
            preferences.push(chrome.i18n.getUILanguage());
        }
        if (typeof navigator !== 'undefined') {
            if (Array.isArray(navigator.languages)) {
                preferences.push(...navigator.languages);
            }
            if (navigator.language) {
                preferences.push(navigator.language);
            }
        }

        for (const lang of preferences) {
            if (!lang) continue;
            const normalized = lang.toLowerCase();

            // Exact matches for Chinese dialects
            if (['zh-cn', 'zh-hans', 'zh-sg', 'zh-my'].includes(normalized)) return 'zh-CN';
            if (['zh-tw', 'zh-hk', 'zh-mo', 'zh-hant'].includes(normalized)) return 'zh-TW';

            // Exact match check
            const exactMatch = supportedCodes.find(c => c.toLowerCase() === normalized);
            if (exactMatch) return exactMatch;

            // Base match (e.g. "en-US" -> "en")
            const base = normalized.split('-')[0];
            if (base === 'zh') return 'zh-CN';
            const baseMatch = supportedCodes.find(c => c.toLowerCase() === base);
            if (baseMatch) return baseMatch;
        }

        return 'en';
    },

    // =========================================================
    //  REVIEW URL HELPER
    // =========================================================

    /**
     * Returns the correct Web Store review URL based on which
     * store the extension was installed from (identified by ID).
     * @returns {string} Web Store review URL.
     */
    getReviewUrl() {
        return chrome.runtime.id === this.EDGE_EXTENSION_ID
            ? this.EDGE_REVIEW_URL
            : this.CHROME_REVIEW_URL;
    },

    // =========================================================
    //  DOM ELEMENT REGISTRY
    //  Populated once on DOMContentLoaded.
    //  All modules access elements via popup.el.<name>
    //  instead of repeated getElementById calls.
    // =========================================================
    el: null,  // set below after DOMContentLoaded

};

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
        toggleEcoMode:        document.getElementById('toggle-eco-mode'),
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
