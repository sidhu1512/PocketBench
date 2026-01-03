function goToPage(pageId) {
    if (isRunning && pageId !== 'page-run') {
        showToast("Stop benchmark first!", "error");
        return;
    }
    document.querySelectorAll('.page').forEach(el => {
        el.classList.remove('active');
        el.classList.add('hidden');
    });
    const target = document.getElementById(pageId);
    if (target) {
        target.classList.remove('hidden');
        target.classList.add('active');
    }
}