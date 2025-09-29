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

// Display validation summary with technical/business categories
function displayValidationSummary() {
    const verificationResults = sessionStorage.getItem('verificationResults');
    const container = document.getElementById('validation-summary-finalization');

    if (!verificationResults || !container) {
        return;
    }

    try {
        const results = JSON.parse(verificationResults);
        const validationSummary = results.validationSummary || {};
        const overallStatus = results.overallStatus || 'success';

        // Technical Validations
        const technicalSteps = [
            { key: 'qrCodeAnalysis', label: 'QR Code Analysis' },
            { key: 'base45Decode', label: 'BASE45 Decoding' },
            { key: 'zlibDecompress', label: 'ZLIB Decompression' },
            { key: 'jwtParsing', label: 'JWT Parsing' },
            { key: 'schemaFileCheck', label: 'Schema File Check' },
            { key: 'schemaValidation', label: 'Schema Validation' },
            { key: 'signatureVerification', label: 'Signature Retrieval' },
            { key: 'signatureCountValidation', label: 'Signature Count Validation' },
            { key: 'countryCodeValidation', label: 'Country Code Validation' },
            { key: 'certificateValidityDate', label: 'Certificate Validity Date' },
            { key: 'jwtSignatureValidation', label: 'JWT Signature Validation' }
        ];

        // Business Validations (placeholder for future validations)
        const businessSteps = [
            // Add business validation steps here when needed
        ];

        let summaryHTML = `<div class="validation-summary ${overallStatus}">`;

        // Technical Validations Banner
        summaryHTML += '<div class="validation-category">';
        summaryHTML += '<h4 class="category-banner technical-banner">Technical Validations</h4>';
        summaryHTML += '<div class="summary-items technical-items">';

        technicalSteps.forEach(step => {
            const validation = validationSummary[step.key] || { status: 'pending', message: '' };
            const statusIcon = getValidationStatusIcon(validation.status);
            const statusClass = validation.status;

            summaryHTML += `
                <div class="summary-item ${statusClass}">
                    <span class="status-icon">${statusIcon}</span>
                    <span class="step-label">${step.label}</span>
                    ${validation.message ? `<span class="step-message">${validation.message}</span>` : ''}
                    ${validation.errorCount !== undefined && validation.errorCount > 0 ?
                        `<span class="error-count">(${validation.errorCount} errors)</span>` : ''}
                </div>
            `;
        });

        summaryHTML += '</div></div>'; // Close technical items and category

        // Business Validations Banner
        summaryHTML += '<div class="validation-category">';
        summaryHTML += '<h4 class="category-banner business-banner">Business Validations</h4>';
        summaryHTML += '<div class="summary-items business-items">';

        if (businessSteps.length === 0) {
            summaryHTML += '<div class="summary-item info"><span class="status-icon">ℹ</span><span class="step-label">No business validations configured</span></div>';
        } else {
            businessSteps.forEach(step => {
                const validation = validationSummary[step.key] || { status: 'pending', message: '' };
                const statusIcon = getValidationStatusIcon(validation.status);
                const statusClass = validation.status;

                summaryHTML += `
                    <div class="summary-item ${statusClass}">
                        <span class="status-icon">${statusIcon}</span>
                        <span class="step-label">${step.label}</span>
                        ${validation.message ? `<span class="step-message">${validation.message}</span>` : ''}
                        ${validation.errorCount !== undefined && validation.errorCount > 0 ?
                            `<span class="error-count">(${validation.errorCount} errors)</span>` : ''}
                    </div>
                `;
            });
        }

        summaryHTML += '</div></div>'; // Close business items and category
        summaryHTML += '</div>'; // Close validation-summary

        container.innerHTML = summaryHTML;
    } catch (e) {
        console.error('Could not parse verification results for validation summary:', e);
        container.innerHTML = '<p class="error-message">Unable to load validation details</p>';
    }
}

function getValidationStatusIcon(status) {
    switch(status) {
        case 'success': return '✓';
        case 'error': return '✗';
        case 'warning': return '⚠';
        case 'pending': return '○';
        case 'skipped': return '○';
        default: return '?';
    }
}

// Initialize validation summary when page loads
document.addEventListener('DOMContentLoaded', () => {
    displayValidationSummary();
});