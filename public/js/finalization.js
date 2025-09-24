// Finalization Page JavaScript

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

// Function to update placeholder texts
function updatePlaceholders() {
    const emailInput = document.getElementById('email-address');
    if (emailInput) {
        emailInput.placeholder = getTranslatedText('finalization-enter-email', 'Enter email address');
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

// Generate reference number
function generateReferenceNumber() {
    const date = new Date();
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const random = Math.random().toString(36).substr(2, 6).toUpperCase();
    return `EHIC-${year}${month}${day}-${random}`;
}

// Set reference number
document.getElementById('reference-number').textContent = generateReferenceNumber();

// Update identity verification status
const identityVerificationData = sessionStorage.getItem('identityVerification');
const identityStatusElement = document.getElementById('identity-verification-status');

if (identityVerificationData) {
    try {
        const identityData = JSON.parse(identityVerificationData);
        if (identityData.identitySkipped) {
            identityStatusElement.innerHTML = '<span style="color: #f39c12;">⚠️ <span data-i18n-key="finalization-identity-skipped">Identity verification skipped</span></span>';
        } else if (identityData.identityVerified) {
            identityStatusElement.innerHTML = '<span data-i18n-key="finalization-confirmed">✅ Confirmed</span>';
        }
    } catch (e) {
        console.error('Could not parse identity verification data');
    }
}

// Get treatment date from sessionStorage if available
const treatmentDate = sessionStorage.getItem('treatmentDate');
if (treatmentDate) {
    // Format the date nicely
    const date = new Date(treatmentDate);
    const options = { year: 'numeric', month: 'long', day: 'numeric' };
    document.getElementById('treatment-date-summary').textContent = date.toLocaleDateString('en-US', options);
} else {
    document.getElementById('treatment-date-summary').textContent = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
}

// Email functionality
document.getElementById('send-email').addEventListener('click', async () => {
    const emailInput = document.getElementById('email-address');
    const emailStatus = document.getElementById('email-status');
    const sendButton = document.getElementById('send-email');
    const email = emailInput.value;

    // Validate email
    if (!email || !email.includes('@')) {
        emailStatus.className = 'email-status error';
        emailStatus.textContent = getTranslatedText('finalization-email-invalid', 'Please enter a valid email address');
        return;
    }

    // Disable button while sending
    sendButton.disabled = true;
    sendButton.textContent = getTranslatedText('finalization-sending', 'Sending...');

    // Prepare summary data with verification results
    const verificationResults = sessionStorage.getItem('verificationResults');
    let verificationStatus = {
        overall: true,
        steps: {
            base45Decode: true,
            zlibDecompression: true,
            jwtParsing: true,
            signatureVerification: true,
            certificateAuthority: true
        }
    };

    // Parse verification results if available
    if (verificationResults) {
        try {
            const results = JSON.parse(verificationResults);
            verificationStatus = results;
        } catch (e) {
            console.error('Could not parse verification results');
        }
    }

    const summaryData = {
        email: email,
        referenceNumber: document.getElementById('reference-number').textContent,
        treatmentDate: document.getElementById('treatment-date-summary').textContent,
        verificationData: sessionStorage.getItem('verificationData') || '',
        verificationStatus: verificationStatus,
        identityVerification: sessionStorage.getItem('identityVerification'),
        timestamp: new Date().toISOString(),
        language: sessionStorage.getItem('usedLanguage') || 'en'
    };

    try {
        const response = await fetch('/api/send-verification-email', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(summaryData)
        });

        const result = await response.json();

        if (response.ok && result.success) {
            emailStatus.className = 'email-status success';
            emailStatus.textContent = getTranslatedText('finalization-email-success', '✅ Verification summary sent successfully to {email}', { email: email });
            emailInput.value = '';
        } else {
            emailStatus.className = 'email-status error';
            emailStatus.textContent = result.error || getTranslatedText('finalization-email-error', 'Failed to send email. Please try again.');
        }
    } catch (error) {
        emailStatus.className = 'email-status error';
        emailStatus.textContent = getTranslatedText('finalization-network-error', 'Network error. Please check your connection and try again.');
    } finally {
        // Re-enable button
        sendButton.disabled = false;
        sendButton.textContent = getTranslatedText('finalization-send-email', 'Send Email');
    }
});

// Print functionality
document.getElementById('print-summary').addEventListener('click', () => {
    window.print();
});

// Clear session data when starting new verification
document.querySelector('a[href="/"]').addEventListener('click', () => {
    sessionStorage.clear();
});