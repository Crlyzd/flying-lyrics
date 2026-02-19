const DEFAULTS = { translationEnabled: true, targetLanguage: "id" };

const toggleEl = document.getElementById('translation-enabled');
const langEl = document.getElementById('target-lang');
const saveBtn = document.getElementById('save-btn');
const statusMsg = document.getElementById('status-msg');

// Load saved settings on popup open
chrome.storage.sync.get(DEFAULTS, (settings) => {
  toggleEl.checked = settings.translationEnabled;
  langEl.value = settings.targetLanguage;
});

// Save settings
saveBtn.addEventListener('click', () => {
  const settings = {
    translationEnabled: toggleEl.checked,
    targetLanguage: langEl.value
  };

  chrome.storage.sync.set(settings, () => {
    statusMsg.classList.add('show');
    setTimeout(() => statusMsg.classList.remove('show'), 2000);
  });
});
