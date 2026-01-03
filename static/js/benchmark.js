// --- BENCHMARK EXECUTION ---

function openBenchmarkSelector() {
    goToPage('page-benchmark-selector');
    const taskInput = document.getElementById('task-search');
    taskInput.value = ''; renderTaskList(''); taskInput.focus();
}

function closeBenchmarkSelector() { goToPage('page-run'); updateTaskPreview(); }

function clearBenchmarks() { selectedTasks.clear(); renderTaskList(document.getElementById('task-search').value); }

async function fetchAvailableTasks() {
    try { const r = await fetch('/api/tasks'); availableTasks = await r.json(); } 
    catch (e) { availableTasks = ['mmlu', 'gsm8k']; }
}

function renderTaskList(filter) {
    const container = document.getElementById('all-tasks-list');
    container.innerHTML = '';
    const query = filter.toLowerCase().trim();
    let tasksToShow = availableTasks.filter(t => t.toLowerCase().includes(query));
    if (tasksToShow.length === 0) { container.innerHTML = '<div style="padding:20px;text-align:center;color:#666">No tasks found</div>'; return; }
    
    tasksToShow.sort((a, b) => a.length - b.length).slice(0, 100).forEach(task => {
        const div = document.createElement('div');
        div.className = 'task-item';
        if (selectedTasks.has(task)) div.classList.add('selected');
        div.innerHTML = `<span>${task}</span><span class="check">✓</span>`;
        div.onclick = () => {
            if (selectedTasks.has(task)) { selectedTasks.delete(task); div.classList.remove('selected'); } 
            else { selectedTasks.add(task); div.classList.add('selected'); }
        };
        container.appendChild(div);
    });
}

function updateTaskPreview() {
    const container = document.getElementById('selected-tasks-preview');
    container.innerHTML = '';
    if (selectedTasks.size === 0) { container.innerHTML = '<span style="color:#666; font-size:12px">None selected</span>'; return; }
    Array.from(selectedTasks).slice(0, 5).forEach(t => {
        const span = document.createElement('span'); span.className = 'tag'; span.innerText = t; container.appendChild(span);
    });
    if (selectedTasks.size > 5) {
        const more = document.createElement('span'); more.className = 'tag'; more.innerText = `+${selectedTasks.size - 5}`; container.appendChild(more);
    }
}

function startBenchmark() {
    if (batchQueue.length === 0) return showToast("Cart is empty!", "error");
    if (selectedTasks.size === 0) return showToast("Select a benchmark", "error");
    
    const settings = getSettings();
    isRunning = true;
    
    // UI Update
    document.getElementById('start-btn').classList.add('hidden');
    document.getElementById('stop-btn').classList.remove('hidden');
    
    const modal = document.getElementById('terminal-modal');
    modal.classList.add('open');
    const logsEl = document.getElementById('logs');
    
    logsEl.innerText = `Initializing Queue (${batchQueue.length} models)...\n`;
    activeLogFilename = null;

    // PREPARE PAYLOAD
    // PRODUCTION SETTING: limit is set to 0 (No Limit)
    const jobs = batchQueue.map(item => ({
        repo_id: item.repo_id,
        filename: item.filename,
        tasks: Array.from(selectedTasks),
        limit: 0 
    }));

    fetch('/api/run', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({
            jobs: jobs,
            batch: parseInt(settings.batch_size),
            device: settings.device,
            verbosity: settings.verbosity
        })
    }).then(response => {
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        function read() {
            reader.read().then(({done, value}) => {
                if (done) { stopBenchmarkUI(); return; }
                const text = decoder.decode(value);
                const lines = text.split('\n\n');
                lines.forEach(line => {
                    if(line.startsWith('data: ')) {
                        try {
                            const data = JSON.parse(line.substring(6));
                            if (data.start_info && data.start_info.log_file) activeLogFilename = data.start_info.log_file;
                            if(data.log) { 
                                logsEl.innerText += data.log; 
                                // Smart scroll
                                if(logsEl.scrollHeight - logsEl.scrollTop < 600) logsEl.scrollTop = logsEl.scrollHeight; 
                            }
                            if(data.done) stopBenchmarkUI();
                        } catch(e) {}
                    }
                });
                read();
            });
        }
        read();
    });
}

function stopBenchmark() {
    fetch('/api/stop', {method: 'POST'}).then(r => r.json()).then(d => { showToast(d.msg, d.status); stopBenchmarkUI(); });
}

function stopBenchmarkUI() {
    isRunning = false;
    document.getElementById('start-btn').classList.remove('hidden');
    document.getElementById('stop-btn').classList.add('hidden');
}

// Terminal Sync Logic
async function syncTerminal() {
    const logsEl = document.getElementById('logs');
    if (!activeLogFilename) { showToast("No active log file", "error"); return; }
    logsEl.innerText += "\n[SYSTEM] Syncing with server logs...\n";
    try {
        const res = await fetch(`/api/logs_content?filename=${activeLogFilename}`);
        const text = await res.text();
        if (text) { logsEl.innerText = text; logsEl.scrollTop = logsEl.scrollHeight; showToast("Terminal Synced", "success"); }
    } catch (e) { logsEl.innerText += "\n[ERROR] Sync failed.\n"; }
}