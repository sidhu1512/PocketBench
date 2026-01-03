function openLogHistory() {
    goToPage('page-history');
    fetchLogHistory();
}

async function fetchLogHistory() {
    const container = document.getElementById('history-list');
    container.innerHTML = '<div style="padding:20px;text-align:center;color:#666">Loading history...</div>';
    try {
        const res = await fetch('/api/logs_list');
        const logs = await res.json();
        container.innerHTML = '';
        if (logs.length === 0) { container.innerHTML = '<div class="empty-state">No logs found.</div>'; return; }
        logs.forEach(log => {
            const div = document.createElement('div');
            div.className = 'list-item';
            div.style.flexDirection = 'column'; div.style.alignItems = 'flex-start'; div.style.gap = '8px';
            div.innerHTML = `
                <div style="width:100%; display:flex; justify-content:space-between; align-items:center;">
                    <div style="font-weight:600; color:#fff; font-size:13px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; max-width:200px;">
                        ${log.name}
                    </div>
                    <div style="display:flex; gap:10px;">
                        <button class="small-btn" style="padding:4px 8px;" onclick="viewLog('${log.filename}')">View</button>
                        <button class="small-btn" style="background:rgba(255,46,46,0.15); color:#ff2e2e; padding:4px 8px;" onclick="deleteLog('${log.filename}')">×</button>
                    </div>
                </div>
                <div style="width:100%; display:flex; justify-content:space-between; font-size:11px; color:#666;">
                    <span>${log.date}</span><span>${log.size}</span>
                </div>`;
            container.appendChild(div);
        });
    } catch (e) { container.innerHTML = '<div class="empty-state">Error loading history.</div>'; }
}

async function viewLog(filename) {
    const modal = document.getElementById('terminal-modal');
    const overlay = document.getElementById('terminal-overlay');
    const logsEl = document.getElementById('logs');
    
    // Manually Open (Bypass toggleTerminal to avoid auto-reset)
    modal.classList.add('open');
    if(overlay) overlay.classList.add('visible');

    // Set History Mode UI
    document.querySelector('.term-header h3').innerText = "LOG: " + filename;
    logsEl.innerText = "Fetching content...";
    
    try {
        const res = await fetch(`/api/logs_content?filename=${filename}`);
        logsEl.innerText = await res.text();
        logsEl.scrollTop = logsEl.scrollHeight;
    } catch (e) { logsEl.innerText = "Error reading log."; }
}

async function deleteLog(filename) {
    if (!confirm("Delete this log?")) return;
    try {
        const res = await fetch('/api/logs_delete', {
            method: 'POST', headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ filename: filename })
        });
        const data = await res.json();
        if (data.status === 'success') { showToast("Deleted", "success"); fetchLogHistory(); }
    } catch (e) { showToast("Failed", "error"); }
}