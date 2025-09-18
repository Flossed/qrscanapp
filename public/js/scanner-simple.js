// Simplified scanner implementation using Html5Qrcode directly

let html5QrCode = null;
let isScanning = false;

const startButton = document.getElementById('start-scanner');
const stopButton = document.getElementById('stop-scanner');
const resultContainer = document.getElementById('result-container');
const resultDiv = document.getElementById('result');
const messageDiv = document.getElementById('message');
const readerDiv = document.getElementById('reader');

// Create status display
const statusDiv = document.createElement('div');
statusDiv.style.cssText = 'text-align: center; padding: 10px; color: #666;';
statusDiv.textContent = 'Camera not started';
readerDiv.appendChild(statusDiv);

async function startScanner() {
    console.log('Starting scanner...');
    statusDiv.textContent = 'Starting camera...';

    startButton.style.display = 'none';
    stopButton.style.display = 'inline-block';
    readerDiv.style.display = 'block';
    resultContainer.style.display = 'none';

    try {
        // Clear the reader div
        readerDiv.innerHTML = '';
        readerDiv.appendChild(statusDiv);

        // Create Html5Qrcode instance
        html5QrCode = new Html5Qrcode("reader");

        // Get cameras
        const cameras = await Html5Qrcode.getCameras();
        console.log(`Found ${cameras.length} cameras`);

        if (cameras.length === 0) {
            throw new Error('No cameras found');
        }

        // Use the first camera (or rear camera if available)
        let cameraId = cameras[0].id;

        // Try to find rear camera
        for (const camera of cameras) {
            if (camera.label.toLowerCase().includes('rear') ||
                camera.label.toLowerCase().includes('back') ||
                camera.label.toLowerCase().includes('environment')) {
                cameraId = camera.id;
                break;
            }
        }

        console.log('Using camera:', cameraId);
        statusDiv.textContent = 'Starting camera stream...';

        // Start scanning
        await html5QrCode.start(
            cameraId,
            {
                fps: 10,
                qrbox: { width: 250, height: 250 }
            },
            (decodedText, decodedResult) => {
                console.log('QR Code detected:', decodedText);
                onScanSuccess(decodedText);
            },
            (errorMessage) => {
                // Ignore errors, they happen frequently when no QR code is visible
            }
        );

        isScanning = true;
        statusDiv.textContent = 'Camera active - point at QR code';
        console.log('Scanner started successfully');

    } catch (err) {
        console.error('Failed to start scanner:', err);
        statusDiv.textContent = `Error: ${err.message}`;
        showMessage(`Camera error: ${err.message}`, 'error');

        stopButton.style.display = 'none';
        startButton.style.display = 'inline-block';
    }
}

async function stopScanner() {
    console.log('Stopping scanner...');

    if (html5QrCode && isScanning) {
        try {
            await html5QrCode.stop();
            console.log('Scanner stopped');
        } catch (err) {
            console.error('Error stopping scanner:', err);
        }
    }

    isScanning = false;
    readerDiv.style.display = 'none';
    stopButton.style.display = 'none';
    startButton.style.display = 'inline-block';
    statusDiv.textContent = 'Camera stopped';
}

function onScanSuccess(decodedText) {
    // Stop scanning
    stopScanner();

    // Show result
    resultDiv.innerHTML = `<strong>${decodedText}</strong>`;
    resultContainer.style.display = 'block';

    // Save scan
    autoSaveScan(decodedText);
}

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
            let message = 'Scan saved successfully!';

            if (result.isDuplicate) {
                message = `Duplicate scan detected! Scanned ${result.duplicateCount} times.`;
            }

            showMessage(message, 'success');
        }
    } catch (error) {
        console.error('Save error:', error);
        showMessage('Error saving scan', 'error');
    }
}

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

// Event listeners
startButton.addEventListener('click', startScanner);
stopButton.addEventListener('click', stopScanner);

document.getElementById('save-scan').addEventListener('click', () => {
    const content = resultDiv.textContent;
    if (content) {
        sessionStorage.setItem('verificationData', content);
        window.location.href = '/verify';
    }
});

document.getElementById('scan-again').addEventListener('click', () => {
    resultContainer.style.display = 'none';
    startScanner();
});

// Test camera on load
window.addEventListener('load', async () => {
    console.log('Testing camera availability...');

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        console.error('Camera API not available');
        statusDiv.textContent = 'Camera not available (HTTPS required)';
        return;
    }

    try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true });
        console.log('Camera test successful');
        stream.getTracks().forEach(track => track.stop());
        statusDiv.textContent = 'Camera available - click Start Scanner';
    } catch (err) {
        console.error('Camera test failed:', err);
        statusDiv.textContent = `Camera error: ${err.message}`;
    }
});