// Default Settings
const defaultSettings = {
    device: 'auto',      // auto, cuda, mps, cpu
    batch_size: '1',     // 1, 2, 4, 8, 16
    verbosity: 'INFO'    // INFO, WARNING, ERROR
};

// Load settings from LocalStorage
function getSettings() {
    const saved = localStorage.getItem('pocketbench_settings');
    if (!saved) return defaultSettings;
    return { ...defaultSettings, ...JSON.parse(saved) };
}

// Save settings
function saveSettings() {
    const settings = {
        device: document.getElementById('setting-device').value,
        batch_size: document.getElementById('setting-batch').value,
        verbosity: document.getElementById('setting-verbosity').value
    };
    localStorage.setItem('pocketbench_settings', JSON.stringify(settings));
    showToast("Settings Saved", "success");
    toggleSettings(); // Close modal
}

// Populate UI with current settings
function loadSettingsUI() {
    const current = getSettings();
    document.getElementById('setting-device').value = current.device;
    document.getElementById('setting-batch').value = current.batch_size;
    document.getElementById('setting-verbosity').value = current.verbosity;
}

// Toggle Modal Visibility
function toggleSettings() {
    const modal = document.getElementById('settings-modal');
    const overlay = document.getElementById('settings-overlay');
    
    if (modal.classList.contains('open')) {
        modal.classList.remove('open');
        overlay.classList.remove('visible');
    } else {
        loadSettingsUI(); // Refresh UI before showing
        modal.classList.add('open');
        overlay.classList.add('visible');
    }
}