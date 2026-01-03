// Shared Utilities

function showToast(msg, type='info') {
    const container = document.getElementById('toast-container');
    if(!container) return;
    const div = document.createElement('div');
    div.className = 'toast';
    const icon = type === 'error' ? '⚠️' : '✅';
    div.innerHTML = `<span>${icon}</span><span>${msg}</span>`;
    container.appendChild(div);
    setTimeout(() => {
        div.style.opacity = '0';
        setTimeout(() => div.remove(), 300);
    }, 3000);
}

// FORMATTER
function formatNum(num) {
    if(num > 1000000) return (num/1000000).toFixed(1) + 'M';
    if(num > 1000) return (num/1000).toFixed(1) + 'k';
    return num;
}

// SYSTEM INFO
function fetchSystemInfo() {
    fetch('/api/system_info').then(r => r.json()).then(data => {
        const el = document.getElementById('device-info');
        if(el) el.innerText = data.display;
    });
}

// --- TERMINAL LOGIC ---

async function toggleTerminal() {
    const modal = document.getElementById('terminal-modal');
    const overlay = document.getElementById('terminal-overlay');
    const logsEl = document.getElementById('logs');
    const headerTitle = document.querySelector('.term-header h3');

    if (modal.classList.contains('open')) {
        // CLOSE TERMINAL
        modal.classList.remove('open');
        if(overlay) overlay.classList.remove('visible');
    } else {
        // OPEN TERMINAL
        modal.classList.add('open');
        if(overlay) overlay.classList.add('visible');
        
        // Reset title
        if(headerTitle) headerTitle.innerText = "Terminal Output";

        // Auto-Refresh Logic
        if (window.activeLogFilename) {
            logsEl.innerText = "Syncing latest logs...\n";
            try {
                const res = await fetch(`/api/logs_content?filename=${window.activeLogFilename}`);
                const text = await res.text();
                if (text) {
                    logsEl.innerText = text;
                    logsEl.scrollTop = logsEl.scrollHeight;
                }
            } catch (e) {
                logsEl.innerText += "\n[Error] Could not sync logs.";
            }
        } else {
            logsEl.innerText = "Waiting for logs...\n(No active benchmark running)";
        }
    }
}