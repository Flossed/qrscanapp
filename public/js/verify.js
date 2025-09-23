// Verify Page JavaScript

// Translation helper function
function getTranslatedText(key, fallback, replacements = {}) {
    // Get current language from sessionStorage or default to 'en'
    const currentLang = sessionStorage.getItem('usedLanguage') || 'en';

    // Get cached translations from sessionStorage
    const translations = JSON.parse(sessionStorage.getItem('actualTranslations') || '{}');

    let text = translations[key] || fallback;

    // Handle replacements like {email}
    Object.keys(replacements).forEach(placeholder => {
        text = text.replace(`{${placeholder}}`, replacements[placeholder]);
    });

    return text;
}

// Get data from sessionStorage
const originalData = sessionStorage.getItem('verificationData');

// Redirect back if no data
if (!originalData) {
    window.location.href = '/';
}

document.getElementById('process-verification').addEventListener('click', async () => {
    const loadingDiv = document.getElementById('loading');
    const errorContainer = document.getElementById('error-container');
    const stepsContainer = document.getElementById('verification-steps');

    // Show loading, hide error and steps
    loadingDiv.style.display = 'block';
    errorContainer.style.display = 'none';
    stepsContainer.innerHTML = '';

    try {
        const response = await fetch('/api/verify', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ data: originalData })
        });

        const result = await response.json();
        loadingDiv.style.display = 'none';

        if (response.ok && result.success) {
            displayVerificationSteps(result.steps);
        } else {
            displayError(result.error || getTranslatedText('verify-network-error', 'Unknown error'), result.message, result.step);
        }
    } catch (error) {
        loadingDiv.style.display = 'none';
        displayError(getTranslatedText('verify-network-error', 'Network Error'), error.message, 'network');
    }
});

function displayVerificationSteps(steps) {
    const container = document.getElementById('verification-steps');

    steps.forEach((step, index) => {
        const stepDiv = document.createElement('div');
        stepDiv.className = 'verification-step';

        const previousSize = index > 0 ? steps[index - 1].size : step.size;
        const compressionRatio = index > 0 ? Math.round((step.size / previousSize) * 100) : 100;

        stepDiv.innerHTML = `
            <div class="step-header">
                <h3>${getTranslatedText('verify-step', 'Step')} ${index + 1}: ${step.name}</h3>
                <div class="step-stats">
                    <span class="size-info">${getTranslatedText('verify-size', 'Size:')} ${formatBytes(step.size)}</span>
                    ${index > 0 ? `<span class="ratio-info">${compressionRatio}${getTranslatedText('verify-ratio-info', '% of previous step')}</span>` : ''}
                </div>
            </div>
            <div class="step-content">
                <textarea readonly class="data-box" rows="${Math.min(Math.max(Math.ceil(step.data.length / 80), 3), 15)}">${step.data}</textarea>
                <button class="btn btn-small btn-copy" data-content="${step.data}">${getTranslatedText('verify-copy-button', 'Copy')}</button>
            </div>
        `;

        container.appendChild(stepDiv);
    });

    // Add copy functionality
    document.querySelectorAll('.btn-copy').forEach(button => {
        button.addEventListener('click', (e) => {
            const content = e.target.dataset.content;
            navigator.clipboard.writeText(content).then(() => {
                const originalText = e.target.textContent;
                e.target.textContent = getTranslatedText('verify-copied', 'Copied!');
                e.target.classList.add('copied');
                setTimeout(() => {
                    e.target.textContent = originalText;
                    e.target.classList.remove('copied');
                }, 2000);
            });
        });
    });
}

function displayError(error, message, step) {
    const errorContainer = document.getElementById('error-container');
    const errorMessage = document.getElementById('error-message');

    errorMessage.innerHTML = `
        <p><strong>${getTranslatedText('verify-error-label', 'Error:')}</strong> ${error}</p>
        <p><strong>${getTranslatedText('verify-message-label', 'Message:')}</strong> ${message}</p>
        <p><strong>${getTranslatedText('verify-failed-at', 'Failed at:')}</strong> ${step}</p>
    `;

    errorContainer.style.display = 'block';
}

function formatBytes(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}