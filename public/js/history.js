// History Page JavaScript

// Translation helper function
function getTranslatedText(key, fallback, replacements = {}) {
    // Get current language from sessionStorage or default to 'en'
    const currentLang = sessionStorage.getItem('usedLanguage') || 'en';

    // Get cached translations from sessionStorage
    const translations = JSON.parse(sessionStorage.getItem('actualTranslations') || '{}');

    let text = translations[key] || fallback;

    // Handle replacements like {count}
    Object.keys(replacements).forEach(placeholder => {
        text = text.replace(`{${placeholder}}`, replacements[placeholder]);
    });

    return text;
}

// Function to update placeholder texts
function updatePlaceholders() {
    const referenceInput = document.getElementById('reference-input');
    if (referenceInput) {
        referenceInput.placeholder = getTranslatedText('history-reference-placeholder', 'Enter reference QR code content for comparison...');
    }
}

// Initialize translations when DOM is ready and when language changes
function initializeTranslations() {
    // Wait a bit to ensure translations are loaded
    setTimeout(() => {
        updatePlaceholders();
    }, 200);
}

// Call initialization
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeTranslations);
} else {
    initializeTranslations();
}

document.addEventListener('DOMContentLoaded', () => {
    const copyButtons = document.querySelectorAll('.btn-copy');
    const deleteButtons = document.querySelectorAll('.btn-danger');
    const verifyButtons = document.querySelectorAll('.btn-verify');

    copyButtons.forEach(button => {
        button.addEventListener('click', (e) => {
            const content = e.target.dataset.content;
            navigator.clipboard.writeText(content).then(() => {
                const originalText = e.target.textContent;
                e.target.textContent = getTranslatedText('history-copy', 'Copied!');
                e.target.classList.add('copied');
                setTimeout(() => {
                    e.target.textContent = originalText;
                    e.target.classList.remove('copied');
                }, 2000);
            }).catch(err => {
                console.error('Error copying text:', err);
            });
        });
    });

    deleteButtons.forEach(button => {
        button.addEventListener('click', async (e) => {
            if (!confirm(getTranslatedText('history-delete-confirm', 'Are you sure you want to delete this scan?'))) {
                return;
            }

            const scanId = e.target.dataset.id;
            try {
                const response = await fetch(`/api/scans/${scanId}`, {
                    method: 'DELETE'
                });

                if (response.ok) {
                    const scanItem = e.target.closest('.scan-item');
                    scanItem.style.opacity = '0';
                    setTimeout(() => {
                        scanItem.remove();
                        const remainingItems = document.querySelectorAll('.scan-item');
                        if (remainingItems.length === 0) {
                            window.location.reload();
                        }
                    }, 300);
                } else {
                    alert(getTranslatedText('history-delete-error', 'Error deleting scan'));
                }
            } catch (error) {
                console.error('Error deleting scan:', error);
                alert(getTranslatedText('history-delete-error', 'Error deleting scan'));
            }
        });
    });

    verifyButtons.forEach(button => {
        button.addEventListener('click', (e) => {
            const content = e.target.dataset.content;

            // Store data in sessionStorage and navigate to verification page
            sessionStorage.setItem('verificationData', content);
            window.location.href = '/verify';
        });
    });
});