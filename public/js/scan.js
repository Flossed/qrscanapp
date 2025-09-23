// Scan Page JavaScript
// Check URL parameter for scanner version
const urlParams = new URLSearchParams(window.location.search);
const scannerVersion = urlParams.get('scanner') || 'simple';

// Load appropriate scanner
const script = document.createElement('script');
if (scannerVersion === 'debug') {
    script.src = '/js/scanner-debug.js';
    console.log('Using DEBUG scanner');
} else if (scannerVersion === 'original') {
    script.src = '/js/scanner.js';
    console.log('Using ORIGINAL scanner');
} else {
    script.src = '/js/scanner-simple.js';
    console.log('Using SIMPLE scanner (default)');
}
document.body.appendChild(script);

// Add version indicator
window.addEventListener('load', () => {
    const versionDiv = document.createElement('div');
    versionDiv.style.cssText = 'position: fixed; bottom: 10px; right: 10px; background: #333; color: #fff; padding: 5px 10px; border-radius: 5px; font-size: 12px; z-index: 1000;';
    versionDiv.innerHTML = `Scanner: ${scannerVersion}<br>
        <a href="?scanner=simple" style="color: #4CAF50" data-i18n-key="scan-version-simple">Simple</a> |
        <a href="?scanner=debug" style="color: #4CAF50" data-i18n-key="scan-version-debug">Debug</a> |
        <a href="?scanner=original" style="color: #4CAF50" data-i18n-key="scan-version-original">Original</a>`;
    document.body.appendChild(versionDiv);
});