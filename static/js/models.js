// --- HELPER: Render a Consistent Row ---
function renderUnifiedRow(item) {
    // Safety check: prevent crash if item is invalid
    if (!item || !item.repo_id || !item.filename) return document.createElement('div');

    const isJunk = item.type === 'incomplete' || item.type === 'ghost';
    
    // Check Queue (only for valid models)
    const inQueue = !isJunk && batchQueue.some(q => q.filename === item.filename && q.repo_id === item.repo_id);
    
    const div = document.createElement('div');
    div.className = 'list-item';
    div.style.alignItems = 'center';

    // COLOR CODING
    let titleColor = '#fff';
    let tagColor = 'rgba(255,255,255,0.1)';
    let tagText = '#ccc';
    
    if (item.type === 'incomplete') {
        titleColor = '#FF2E2E'; // Red
        tagColor = 'rgba(255, 46, 46, 0.2)';
        tagText = '#FF2E2E';
    } else if (item.type === 'ghost') {
        titleColor = '#FFaa00'; // Orange
        tagColor = 'rgba(255, 170, 0, 0.2)';
        tagText = '#FFaa00';
    }

    // Prepare Click Actions
    // Escape single quotes in strings to prevent HTML breakage
    const safeRepo = item.repo_id.replace(/'/g, "\\'");
    const safeFile = item.filename.replace(/'/g, "\\'");
    const safeTags = (item.tags || '').replace(/'/g, "\\'");
    const safeSize = (item.size_str || '').replace(/'/g, "\\'");
    
    // Click on text adds to queue (if valid)
    const clickAction = !isJunk ? `addToQueue('${safeRepo}', '${safeFile}', '${safeTags}', '${safeSize}', null)` : '';

    // Generate unique ID for button to ensure we can find it later
    const btnId = `btn-${safeFile.replace(/[^a-zA-Z0-9]/g, '_')}`;

    div.innerHTML = `
        <div style="flex-grow:1; cursor:${!isJunk ? 'pointer' : 'default'};" onclick="${clickAction}">
            <div style="font-weight:600; font-size:13px; color:${titleColor}">
                ${item.repo_id.includes('/') ? item.repo_id.split('/')[1] : item.repo_id}
            </div>
            <div style="font-size:12px; color:${isJunk ? '#888' : '#00FF9D'}; margin-top:2px; word-break:break-all;">
                ${item.filename}
            </div>
            <div style="display:flex; gap:6px; margin-top:4px; align-items:center;">
                <span class="tag" style="background:${tagColor}; color:${tagText}">${item.tags || 'GGUF'}</span>
                <span style="font-family:monospace; font-size:10px; color:#666">${item.size_str}</span>
            </div>
        </div>
        
        <div style="display:flex; flex-direction:column; gap:10px; align-items:flex-end;">
            ${!isJunk ? `
                <button id="${btnId}" class="icon-btn add-btn" 
                    style="${inQueue ? 'color:var(--bg-color); background:var(--accent); border-color:var(--accent);' : ''}"
                    onclick="event.stopPropagation(); addToQueue('${safeRepo}', '${safeFile}', '${safeTags}', '${safeSize}', this)">
                    ${inQueue ? '✓' : '+'}
                </button>
            ` : ''}
            
            ${(item.revision || isJunk) ? `
                <button class="small-btn" style="font-size:9px; padding:4px 8px; background:rgba(255,46,46,0.15); color:#ff2e2e; border:1px solid rgba(255,46,46,0.3);" 
                    onclick="event.stopPropagation(); deleteItem('${safeRepo}', '${item.revision || ''}', '${safeFile}', '${(item.path || '').replace(/\\/g, '\\\\')}')">
                    ${isJunk ? 'CLEAN UP' : 'DELETE'}
                </button>
            ` : ''}
        </div>
    `;
    return div;
}

// --- SEARCH & DISCOVERY ---

async function performSearch(query) {
    if(query.length < 2) return;
    try {
        const res = await fetch(`/api/search?q=${query}`);
        const models = await res.json();
        const list = document.getElementById('model-list');
        list.innerHTML = '';
        
        if (models.length === 0) { list.innerHTML = '<div class="empty-state">No models found</div>'; return; }
        
        models.forEach(m => {
            const div = document.createElement('div');
            div.className = 'list-item';
            div.innerHTML = `
                <div>
                    <div style="font-size:12px; color:#888">${m.author}</div>
                    <div style="font-weight:600; color:#fff; font-size:14px">${m.name}</div>
                    <div style="font-size:11px; color:#666; margin-top:4px">⬇ ${formatNum(m.downloads)} • ♥ ${m.likes}</div>
                </div>
                <div style="color:#444">›</div>
            `;
            div.onclick = () => selectRepo(m.id);
            list.appendChild(div);
        });
        updateQueueFAB();
    } catch(e) { console.error(e); }
}

async function selectRepo(repoId) {
    currentRepo = repoId;
    document.getElementById('selected-repo-name').innerText = repoId;
    document.getElementById('file-list').innerHTML = '<div style="padding:20px;text-align:center;color:#666">Loading...</div>';
    goToPage('page-files');
    updateQueueFAB();
    
    try {
        const res = await fetch(`/api/files?repo=${repoId}`);
        const files = await res.json();
        const list = document.getElementById('file-list');
        list.innerHTML = '';
        
        if(files.length === 0) { list.innerHTML = '<div class="empty-state">No GGUF files found</div>'; return; }
        
        files.forEach(f => {
            // FIX: Create a proper object to match renderUnifiedRow signature
            const item = {
                type: 'remote',
                repo_id: repoId,
                filename: f.name,
                tags: f.tags,
                size_str: f.size_str,
                revision: null,
                path: null
            };
            list.appendChild(renderUnifiedRow(item));
        });
    } catch(e) { console.error(e); }
}

// --- MY MODELS (LOCAL) ---

function openLocalModels() {
    goToPage('page-my-models');
    fetchLocalModels();
    updateQueueFAB();
}

async function fetchLocalModels() {
    const container = document.getElementById('local-model-list');
    container.innerHTML = '<div style="padding:20px;text-align:center;color:#666">Scanning disk...</div>';
    try {
        const res = await fetch('/api/local_models');
        const items = await res.json();
        container.innerHTML = '';
        
        if (items.length === 0) { container.innerHTML = '<div class="empty-state">No models downloaded.</div>'; return; }
        
        items.forEach(item => {
            container.appendChild(renderUnifiedRow(item));
        });
    } catch (e) { container.innerHTML = '<div class="empty-state">Error loading models</div>'; }
}

// --- CART / QUEUE LOGIC ---

function addToQueue(repoId, filename, tags, size, btnElement) {
    // 1. Check if exists in queue
    const index = batchQueue.findIndex(item => item.filename === filename && item.repo_id === repoId);
    
    // 2. Find the button (if not passed directly via 'this')
    const btnId = `btn-${filename.replace(/[^a-zA-Z0-9]/g, '_')}`;
    const btn = btnElement || document.getElementById(btnId);

    if (index > -1) {
        // REMOVE from Queue
        batchQueue.splice(index, 1);
        if(btn) {
            btn.innerText = "+";
            btn.style.color = "white"; 
            btn.style.background = "transparent"; 
            btn.style.borderColor = "var(--glass-border)";
        }
        showToast("Removed from Cart");
    } else {
        // ADD to Queue
        batchQueue.push({ repo_id: repoId, filename: filename, tags: tags, size: size });
        if(btn) {
            btn.innerText = "✓";
            btn.style.color = "var(--bg-color)"; 
            btn.style.background = "var(--accent)"; 
            btn.style.borderColor = "var(--accent)";
            
            // Pop animation
            btn.animate([
                { transform: 'scale(1)' },
                { transform: 'scale(1.2)' },
                { transform: 'scale(1)' }
            ], { duration: 200 });
        }
        showToast("Added to Cart");
    }
    updateQueueFAB();
}

function updateQueueFAB() {
    let fab = document.getElementById('global-queue-fab');
    if (!fab) {
        fab = document.createElement('button');
        fab.id = 'global-queue-fab';
        fab.className = 'primary-btn';
        fab.style.cssText = `position: fixed; bottom: 20px; right: 20px; width: auto; padding: 12px 24px; box-shadow: 0 10px 30px rgba(0,0,0,0.5); z-index: 200; display: none; border-radius: 50px; font-size: 13px;`;
        fab.onclick = goToQueueReview;
        document.body.appendChild(fab);
    }
    
    if (batchQueue.length > 0) {
        fab.style.display = 'block';
        fab.innerText = `Review Cart (${batchQueue.length})`;
    } else {
        fab.style.display = 'none';
    }
}

function goToQueueReview() {
    goToPage('page-run');
    renderQueueList();
}

function renderQueueList() {
    const container = document.getElementById('queue-list-container');
    const countSpan = document.getElementById('queue-count');
    if(container) {
        container.innerHTML = '';
        if(countSpan) countSpan.innerText = batchQueue.length;

        if (batchQueue.length === 0) {
            container.innerHTML = '<div class="empty-state" style="font-size:12px; margin-top:20px;">Queue is empty</div>';
            return;
        }

        batchQueue.forEach((item, idx) => {
            const div = document.createElement('div');
            div.style.cssText = "display:flex; justify-content:space-between; align-items:center; padding:8px; border-bottom:1px solid rgba(255,255,255,0.05);";
            div.innerHTML = `
                <div style="overflow:hidden;">
                    <div style="font-size:12px; color:#fff; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${item.repo_id.split('/')[1] || item.repo_id}</div>
                    <div style="font-size:10px; color:#888;">${item.filename}</div>
                </div>
                <button class="icon-btn" style="padding:4px; color:#ff2e2e; border:none;" onclick="removeFromCart(${idx})">×</button>
            `;
            container.appendChild(div);
        });
    }
}

function removeFromCart(index) {
    batchQueue.splice(index, 1);
    renderQueueList();
    updateQueueFAB();
}

function clearQueue() {
    if(confirm("Clear all items from cart?")) {
        batchQueue = [];
        renderQueueList();
        updateQueueFAB();
    }
}

// --- DELETE LOGIC ---

async function deleteItem(repoId, revision, filename, path) {
    // If 'path' is provided, it's a junk file. If not, it's a valid model.
    const isJunk = (path && path.length > 0);
    const msg = isJunk ? 
        `Permanently delete this corrupted file?\n${filename}` : 
        `Delete model ${filename}?`;
        
    if(!confirm(msg)) return;
    
    try {
        const payload = isJunk ? { path: path } : { repo_id: repoId, revision: revision, filename: filename };
        
        const res = await fetch('/api/delete_model', {
            method: 'POST', headers: {'Content-Type': 'application/json'},
            body: JSON.stringify(payload)
        });
        const data = await res.json();
        if (data.status === 'success') { showToast("Deleted", "success"); fetchLocalModels(); } 
        else { showToast(data.msg, "error"); }
    } catch(e) { showToast("Delete failed", "error"); }
}