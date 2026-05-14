const APP_VERSION = "v1.0.6";
document.addEventListener('DOMContentLoaded', () => {
    const el = document.getElementById('app-version-display');
    if(el) el.textContent = APP_VERSION;
});
