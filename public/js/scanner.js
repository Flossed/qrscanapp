let html5QrcodeScanner = null;
let lastDecodedText = null;

const startButton = document.getElementById('start-scanner');
const stopButton = document.getElementById('stop-scanner');
const resultContainer = document.getElementById('result-container');
const resultDiv = document.getElementById('result');
const messageDiv = document.getElementById('message');
const saveButton = document.getElementById('save-scan');
const scanAgainButton = document.getElementById('scan-again');

function onScanSuccess(decodedText, decodedResult) {
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
        startButton.style.display = 'inline-block';
    }
}

function onScanFailure(error) {
    console.warn(`QR scan error: ${error}`);
}

function startScanner() {
    document.getElementById('reader').style.display = 'block';
    startButton.style.display = 'none';
    stopButton.style.display = 'inline-block';
    resultContainer.style.display = 'none';
    lastDecodedText = null;

    // Use same experience for all devices
    const qrboxSize = Math.min(window.innerWidth * 0.8, 400);

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
            }
        }
    );

    html5QrcodeScanner.render(onScanSuccess, onScanFailure);
}

function stopScanner() {
    if (html5QrcodeScanner) {
        html5QrcodeScanner.clear();
        document.getElementById('reader').style.display = 'none';
        stopButton.style.display = 'none';
        startButton.style.display = 'inline-block';
    }
}

startButton.addEventListener('click', startScanner);
stopButton.addEventListener('click', stopScanner);

// Auto-save function
async function autoSaveScan(decodedText) {
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
        showMessage('Scan saved with errors', 'warning');
    }
}

// Verify button functionality
saveButton.addEventListener('click', () => {
    if (!lastDecodedText) return;

    // Store data in sessionStorage and navigate
    sessionStorage.setItem('verificationData', lastDecodedText);
    window.location.href = '/verify';
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

// Add ESC key handler to exit fullscreen
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && document.body.classList.contains('scanner-active')) {
        stopScanner();
    }
});