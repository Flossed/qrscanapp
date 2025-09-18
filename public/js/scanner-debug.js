// Debug version of scanner with detailed error logging

let html5QrcodeScanner = null;
let lastDecodedText = null;

const startButton = document.getElementById('start-scanner');
const stopButton = document.getElementById('stop-scanner');
const resultContainer = document.getElementById('result-container');
const resultDiv = document.getElementById('result');
const messageDiv = document.getElementById('message');
const saveButton = document.getElementById('save-scan');
const scanAgainButton = document.getElementById('scan-again');

// Add debug panel
function addDebugPanel() {
    const debugPanel = document.createElement('div');
    debugPanel.id = 'debug-panel';
    debugPanel.style.cssText = `
        position: fixed;
        bottom: 10px;
        left: 10px;
        right: 10px;
        background: rgba(0,0,0,0.9);
        color: #0f0;
        padding: 10px;
        font-family: monospace;
        font-size: 12px;
        max-height: 200px;
        overflow-y: auto;
        z-index: 10000;
        border: 1px solid #0f0;
        display: none;
    `;
    document.body.appendChild(debugPanel);
    return debugPanel;
}

const debugPanel = addDebugPanel();

function debugLog(message, type = 'info') {
    const timestamp = new Date().toISOString().split('T')[1].split('.')[0];
    const color = type === 'error' ? '#f00' : type === 'warning' ? '#ff0' : '#0f0';

    debugPanel.innerHTML += `<div style="color: ${color}">[${timestamp}] ${message}</div>`;
    debugPanel.scrollTop = debugPanel.scrollHeight;
    debugPanel.style.display = 'block';

    console.log(`[Scanner Debug] ${message}`);
}

// Check environment
debugLog('=== SCANNER DIAGNOSTIC ===');
debugLog(`URL: ${window.location.href}`);
debugLog(`Protocol: ${window.location.protocol}`);
debugLog(`Host: ${window.location.host}`);
debugLog(`User Agent: ${navigator.userAgent.substring(0, 50)}...`);

// Check HTTPS
if (window.location.protocol !== 'https:' && window.location.hostname !== 'localhost') {
    debugLog('❌ NOT HTTPS - Camera will not work!', 'error');
    debugLog('Camera requires HTTPS or localhost', 'error');
} else {
    debugLog('✅ HTTPS/localhost detected - Camera should work');
}

// Check camera API availability
if (!navigator.mediaDevices) {
    debugLog('❌ navigator.mediaDevices NOT available', 'error');
} else {
    debugLog('✅ navigator.mediaDevices available');

    if (!navigator.mediaDevices.getUserMedia) {
        debugLog('❌ getUserMedia NOT available', 'error');
    } else {
        debugLog('✅ getUserMedia available');
    }
}

// Check if Html5Qrcode is loaded
if (typeof Html5Qrcode === 'undefined') {
    debugLog('❌ Html5Qrcode library NOT loaded', 'error');
} else {
    debugLog('✅ Html5Qrcode library loaded');
}

if (typeof Html5QrcodeScanner === 'undefined') {
    debugLog('❌ Html5QrcodeScanner NOT loaded', 'error');
} else {
    debugLog('✅ Html5QrcodeScanner loaded');
}

// Test camera access
async function testCameraAccess() {
    debugLog('Testing camera access...');
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true });
        debugLog('✅ Camera access granted!');

        // Get camera info
        const tracks = stream.getVideoTracks();
        tracks.forEach(track => {
            debugLog(`Camera: ${track.label}`);
            track.stop(); // Stop the test stream
        });

        return true;
    } catch (error) {
        debugLog(`❌ Camera access failed: ${error.name}`, 'error');
        debugLog(`Error message: ${error.message}`, 'error');

        if (error.name === 'NotAllowedError') {
            debugLog('User denied camera permission', 'error');
        } else if (error.name === 'NotFoundError') {
            debugLog('No camera found on device', 'error');
        } else if (error.name === 'NotReadableError') {
            debugLog('Camera is already in use', 'error');
        } else if (error.name === 'OverconstrainedError') {
            debugLog('Camera constraints cannot be satisfied', 'error');
        } else if (error.name === 'TypeError') {
            debugLog('HTTPS required for camera access', 'error');
        }

        return false;
    }
}

// List available cameras
async function listCameras() {
    try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        const videoDevices = devices.filter(device => device.kind === 'videoinput');

        debugLog(`Found ${videoDevices.length} camera(s):`);
        videoDevices.forEach((device, index) => {
            debugLog(`  ${index + 1}. ${device.label || `Camera ${index + 1}`}`);
        });

        return videoDevices;
    } catch (error) {
        debugLog(`Failed to list cameras: ${error.message}`, 'error');
        return [];
    }
}

function onScanSuccess(decodedText, decodedResult) {
    debugLog(`✅ QR Code detected: ${decodedText.substring(0, 50)}...`);

    if (decodedText === lastDecodedText) {
        return;
    }

    lastDecodedText = decodedText;
    resultDiv.innerHTML = `<strong>${decodedText}</strong>`;
    resultContainer.style.display = 'block';

    // Auto-save the scan
    autoSaveScan(decodedText);

    if (html5QrcodeScanner) {
        html5QrcodeScanner.clear();
        document.getElementById('reader').style.display = 'none';
        stopButton.style.display = 'none';
        // Keep start button hidden when showing results
        startButton.style.display = 'none';
    }
}

function onScanFailure(error) {
    // Don't log every frame, too noisy
    // console.warn(`QR scan error: ${error}`);
}

async function startScanner() {
    debugLog('=== STARTING SCANNER ===');

    // First test camera access
    const cameraWorks = await testCameraAccess();
    if (!cameraWorks) {
        showMessage('Camera not available. Check debug panel for details.', 'error');
        return;
    }

    // List available cameras
    await listCameras();

    document.getElementById('reader').style.display = 'block';
    startButton.style.display = 'none';
    stopButton.style.display = 'inline-block';
    resultContainer.style.display = 'none';
    lastDecodedText = null;

    const qrboxSize = Math.min(window.innerWidth * 0.8, 400);
    debugLog(`QR box size: ${qrboxSize}px`);

    try {
        debugLog('Initializing Html5QrcodeScanner...');

        html5QrcodeScanner = new Html5QrcodeScanner(
            "reader",
            {
                fps: 10,
                qrbox: {width: qrboxSize, height: qrboxSize},
                aspectRatio: 1.0,
                showTorchButtonIfSupported: true,
                showZoomSliderIfSupported: true,
                defaultZoomValueIfSupported: 1.5,
                rememberLastUsedCamera: true,
                videoConstraints: {
                    facingMode: "environment"
                },
                verbose: true, // Enable verbose logging
                formatsToSupport: [ Html5QrcodeSupportedFormats.QR_CODE ]
            }
        );

        debugLog('Rendering scanner...');
        html5QrcodeScanner.render(onScanSuccess, onScanFailure);

        // Check if video element was created
        setTimeout(() => {
            const videoElement = document.querySelector('#reader video');
            if (videoElement) {
                debugLog('✅ Video element created successfully');
                debugLog(`Video dimensions: ${videoElement.videoWidth}x${videoElement.videoHeight}`);
            } else {
                debugLog('❌ No video element found! Checking for error messages...', 'error');
                const readerElement = document.getElementById('reader');
                debugLog(`Reader HTML: ${readerElement.innerHTML.substring(0, 200)}...`);
            }
        }, 2000);

        debugLog('✅ Scanner initialized successfully');

    } catch (error) {
        debugLog(`❌ Scanner initialization failed: ${error.message}`, 'error');
        debugLog(`Stack: ${error.stack}`, 'error');
        showMessage(`Scanner error: ${error.message}`, 'error');
        stopButton.style.display = 'none';
        startButton.style.display = 'inline-block';
    }
}

function stopScanner() {
    debugLog('Stopping scanner...');
    if (html5QrcodeScanner) {
        html5QrcodeScanner.clear();
        document.getElementById('reader').style.display = 'none';
        stopButton.style.display = 'none';
        startButton.style.display = 'inline-block';
        debugLog('Scanner stopped');
    }
}

startButton.addEventListener('click', startScanner);
stopButton.addEventListener('click', stopScanner);

// Auto-save function
async function autoSaveScan(decodedText) {
    debugLog(`Saving scan: ${decodedText.substring(0, 30)}...`);
    try {
        const response = await fetch('/api/scans', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                content: decodedText,
                type: detectQRType(decodedText),
                deviceInfo: navigator.userAgent
            })
        });

        if (response.ok) {
            const result = await response.json();
            debugLog('✅ Scan saved successfully');

            let message = '';
            if (result.referenceComparison && result.referenceComparison.hasReference) {
                if (result.referenceComparison.isMatch) {
                    message = '✅ Perfect match with reference!';
                } else {
                    message = `⚠️ ${result.referenceComparison.similarity}% similarity (${result.referenceComparison.differences.length} differences)`;
                }
            } else if (result.isDuplicate) {
                message = `Duplicate scan detected! Scanned ${result.duplicateCount} times.`;
            } else {
                message = 'New scan saved successfully!';
            }

            showMessage(message, result.referenceComparison?.isMatch ? 'success' : 'warning');
        }
    } catch (error) {
        debugLog(`Save error: ${error.message}`, 'error');
        showMessage('Scan saved with errors', 'warning');
    }
}

// Verify button functionality
saveButton.addEventListener('click', () => {
    if (!lastDecodedText) return;
    sessionStorage.setItem('verificationData', lastDecodedText);
    window.location.href = '/verify';
});

document.getElementById('show-results').addEventListener('click', () => {
    if (!lastDecodedText) return;
    sessionStorage.setItem('verificationData', lastDecodedText);
    window.location.href = '/results';
});

scanAgainButton.addEventListener('click', () => {
    resultContainer.style.display = 'none';
    startScanner();
});

function detectQRType(text) {
    if (text.startsWith('http://') || text.startsWith('https://')) {
        return 'url';
    } else if (text.includes('@') && text.includes('.')) {
        return 'email';
    } else if (text.match(/^[\+]?[(]?[0-9]{3}[)]?[-\s\.]?[0-9]{3}[-\s\.]?[0-9]{4,6}$/)) {
        return 'phone';
    } else if (text.startsWith('WIFI:')) {
        return 'wifi';
    } else {
        return 'text';
    }
}

function showMessage(text, type) {
    messageDiv.textContent = text;
    messageDiv.className = `message ${type}`;
    messageDiv.style.display = 'block';
    setTimeout(() => {
        messageDiv.style.display = 'none';
    }, 3000);
}

// Handle orientation change
window.addEventListener('orientationchange', () => {
    if (html5QrcodeScanner) {
        stopScanner();
        setTimeout(() => startScanner(), 500);
    }
});

// Add button to toggle debug panel
const toggleDebugBtn = document.createElement('button');
toggleDebugBtn.textContent = 'Toggle Debug';
toggleDebugBtn.style.cssText = `
    position: fixed;
    top: 70px;
    right: 10px;
    z-index: 10001;
    padding: 5px 10px;
    background: #333;
    color: #fff;
    border: 1px solid #666;
    cursor: pointer;
`;
toggleDebugBtn.onclick = () => {
    debugPanel.style.display = debugPanel.style.display === 'none' ? 'block' : 'none';
};
document.body.appendChild(toggleDebugBtn);

// Run initial diagnostics
setTimeout(async () => {
    debugLog('=== RUNNING DIAGNOSTICS ===');
    await testCameraAccess();
    await listCameras();
    debugLog('=== DIAGNOSTICS COMPLETE ===');
}, 1000);