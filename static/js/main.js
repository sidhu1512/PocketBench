document.addEventListener('DOMContentLoaded', () => {
    fetchSystemInfo();
    fetchAvailableTasks();
    
    // Search Debounce
    let timeout;
    const searchInput = document.getElementById('search-input');
    if (searchInput) {
        searchInput.addEventListener('input', (e) => {
            clearTimeout(timeout);
            timeout = setTimeout(() => performSearch(e.target.value), 500);
        });
    }

    // Task Search
    const taskSearch = document.getElementById('task-search');
    if (taskSearch) {
        taskSearch.addEventListener('input', (e) => renderTaskList(e.target.value));
    }

    // Buttons
    const startBtn = document.getElementById('start-btn');
    if(startBtn) startBtn.addEventListener('click', startBenchmark);
    
    const stopBtn = document.getElementById('stop-btn');
    if(stopBtn) stopBtn.addEventListener('click', stopBenchmark);
    
    updateTaskPreview();

    // Initialize FAB if items persisted
    if(typeof updateQueueFAB === 'function') updateQueueFAB(); 
});