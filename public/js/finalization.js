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

        // Prefill with user email if available
        if (window.userEmail && window.userEmail.trim() !== '') {
            emailInput.value = window.userEmail;
        }
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

// Update overall verification status based on results
const verificationResults = sessionStorage.getItem('verificationResults');
if (verificationResults) {
    try {
        const results = JSON.parse(verificationResults);
        const statusContainer = document.querySelector('.finalization-status');
        const statusIcon = statusContainer.querySelector('.status-icon-large');
        const statusTitle = statusContainer.querySelector('h1');
        const statusSubtitle = statusContainer.querySelector('.finalization-subtitle');

        // Check if verification passed or failed
        let hasErrors = false;
        let hasWarnings = false;

        if (results.validationSummary) {
            Object.values(results.validationSummary).forEach(validation => {
                if (validation.status === 'error') hasErrors = true;
                if (validation.status === 'warning') hasWarnings = true;
            });
        }

        if (hasErrors) {
            statusIcon.textContent = '❌';
            statusTitle.textContent = 'Verification Failed';
            statusTitle.setAttribute('data-i18n-key', 'finalization-verification-failed');
            statusSubtitle.textContent = 'One or more verification steps have failed';
            statusSubtitle.setAttribute('data-i18n-key', 'finalization-verification-failed-message');
            statusContainer.style.color = '#721c24';
            statusContainer.style.backgroundColor = '#f8d7da';
        } else if (hasWarnings) {
            statusIcon.textContent = '⚠️';
            statusTitle.textContent = 'Verification Complete with Warnings';
            statusTitle.setAttribute('data-i18n-key', 'finalization-verification-warnings');
            statusSubtitle.textContent = 'Verification completed successfully but some warnings were found';
            statusSubtitle.setAttribute('data-i18n-key', 'finalization-verification-warnings-message');
            statusContainer.style.color = '#856404';
            statusContainer.style.backgroundColor = '#fff3cd';
        } else {
            statusIcon.textContent = '✅';
            statusTitle.textContent = 'Verification Complete';
            statusTitle.setAttribute('data-i18n-key', 'finalization-verification-complete');
            statusSubtitle.textContent = 'All verification steps have been successfully completed';
            statusSubtitle.setAttribute('data-i18n-key', 'finalization-all-steps-completed');
        }
    } catch (e) {
        console.error('Could not parse verification results for status update:', e);
    }
}

// Update identity verification status
const identityVerificationData = sessionStorage.getItem('identityVerification');
const identityStatusElement = document.getElementById('identity-verification-status');
const birthdateStatusElement = document.getElementById('birthdate-verification-status');

if (identityVerificationData) {
    try {
        const identityData = JSON.parse(identityVerificationData);

        // Handle identity verification status
        if (identityData.identitySkipped) {
            identityStatusElement.innerHTML = '<span style="color: #f39c12;">⚠️ <span data-i18n-key="finalization-identity-skipped">Identity verification skipped</span></span>';
        } else if (identityData.identityVerified) {
            identityStatusElement.innerHTML = '<span data-i18n-key="finalization-confirmed">✅ Confirmed</span>';
        } else {
            identityStatusElement.innerHTML = '<span style="color: #f39c12;">⚠️ <span data-i18n-key="finalization-identity-skipped">Identity verification skipped</span></span>';
        }

        // Handle birthdate verification status
        if (identityData.birthdateVerified) {
            birthdateStatusElement.innerHTML = '<span data-i18n-key="finalization-confirmed">✅ Confirmed</span>';
        } else {
            birthdateStatusElement.innerHTML = '<span style="color: #f39c12;">⚠️ <span data-i18n-key="finalization-identity-skipped">Birthdate verification skipped</span></span>';
        }
    } catch (e) {
        console.error('Could not parse identity verification data');
    }
}

// Get treatment date from sessionStorage if available
let treatmentDate = null;
const treatmentData = sessionStorage.getItem('treatmentData');
if (treatmentData) {
    try {
        const parsedData = JSON.parse(treatmentData);
        treatmentDate = parsedData.treatmentDate;
    } catch (e) {
        console.warn('Could not parse treatment data from sessionStorage:', e);
    }
}

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
            { key: 'kidHeaderValidation', label: 'Kid Header Validation' },
            { key: 'algorithmHeaderValidation', label: 'Algorithm Header Validation' },
            { key: 'signatureVerification', label: 'Signature Retrieval' },
            { key: 'signatureCountValidation', label: 'Signature Count Validation' },
            { key: 'countryCodeValidation', label: 'Country Code Validation' },
            { key: 'jwtSignatureValidation', label: 'JWT Signature Validation' }
        ];

        // Business Validations
        const businessSteps = [
            { key: 'certificateValidityDate', label: 'Certificate Validity Date' },
            { key: 'ehicAccreditation', label: 'EHIC Accreditation' },
            { key: 'dateOfBirthValidation', label: 'Date of Birth Validation' },
            { key: 'dateRangeValidation', label: 'Start/End Date Validation' },
            { key: 'startIssuanceValidation', label: 'Start/Issuance Date Validation' },
            { key: 'issuanceEndValidation', label: 'Issuance/End Date Validation' },
            { key: 'expiryDateValidation', label: 'Expiry Date Validation' },
            { key: 'institutionLengthValidation', label: 'Institution Length Validation' },
            { key: 'cardIdDigitValidation', label: 'Card ID Digit Validation' },
            { key: 'institutionIdDigitValidation', label: 'Institution ID Digit Validation' }
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
                <div class="summary-item ${statusClass} clickable-tile" data-step-key="${step.key}">
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

        // Revocation Validations Section
        const revocationSteps = [
            { key: 'revocationPresence', label: 'Revocation Information Presence' },
            { key: 'revocationStatus', label: 'Revocation Status Check' }
        ];

        summaryHTML += '<div class="validation-category">';
        summaryHTML += '<h4 class="category-banner revocation-banner">Revocation Validations</h4>';
        summaryHTML += '<div class="summary-items revocation-items">';

        revocationSteps.forEach(step => {
            const validation = validationSummary[step.key] || { status: 'pending', message: '' };
            const statusIcon = getValidationStatusIcon(validation.status);
            const statusClass = validation.status;

            summaryHTML += `
                <div class="summary-item ${statusClass} clickable-tile" data-step-key="${step.key}">
                    <span class="status-icon">${statusIcon}</span>
                    <span class="step-label">${step.label}</span>
                    ${validation.message ? `<span class="step-message">${validation.message}</span>` : ''}
                    ${validation.errorCount !== undefined && validation.errorCount > 0 ?
                        `<span class="error-count">(${validation.errorCount} errors)</span>` : ''}
                </div>
            `;
        });

        summaryHTML += '</div></div>'; // Close revocation items and category

        // Treatment Date Validations Section
        const treatmentDateSteps = [
            { key: 'treatmentDatePresence', label: 'Treatment Date Presence' },
            { key: 'treatmentDateRange', label: 'Treatment Date Range Validation' }
        ];

        summaryHTML += '<div class="validation-category">';
        summaryHTML += '<h4 class="category-banner treatment-date-banner">Treatment Date Validations</h4>';
        summaryHTML += '<div class="summary-items treatment-date-items">';

        treatmentDateSteps.forEach(step => {
            const validation = validationSummary[step.key] || { status: 'pending', message: '' };
            const statusIcon = getValidationStatusIcon(validation.status);
            const statusClass = validation.status;

            summaryHTML += `
                <div class="summary-item ${statusClass} clickable-tile" data-step-key="${step.key}">
                    <span class="status-icon">${statusIcon}</span>
                    <span class="step-label">${step.label}</span>
                    ${validation.message ? `<span class="step-message">${validation.message}</span>` : ''}
                    ${validation.errorCount !== undefined && validation.errorCount > 0 ?
                        `<span class="error-count">(${validation.errorCount} errors)</span>` : ''}
                </div>
            `;
        });

        summaryHTML += '</div></div>'; // Close treatment date items and category
        summaryHTML += '</div>'; // Close validation-summary

        container.innerHTML = summaryHTML;

        // Add click handlers for clickable tiles
        addTileClickHandlers();
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

function getStepIdFromName(stepName) {
    // Map step names from backend to validation keys
    const stepMappings = {
        'QR Code Analysis': 'qrCodeAnalysis',
        'Original BASE45 String': 'base45Decode',
        'Decoded BASE45': 'base45Decode',
        'Decompressed ZLIB': 'zlibDecompress',
        'Parsed JWT': 'jwtParsing',
        'Schema File Check': 'schemaFileCheck',
        'Schema Validation': 'schemaValidation',
        'Kid Header Validation': 'kidHeaderValidation',
        'Algorithm Header Validation': 'algorithmHeaderValidation',
        'Signature Verification Response': 'signatureVerification',
        'Signature Count Validation': 'signatureCountValidation',
        'Country Code Validation': 'countryCodeValidation',
        'Certificate Validity Date': 'certificateValidityDate',
        'EHIC Accreditation': 'ehicAccreditation',
        'Date of Birth Validation': 'dateOfBirthValidation',
        'Date Range Validation': 'dateRangeValidation',
        'Start/Issuance Date Validation': 'startIssuanceValidation',
        'Issuance/End Date Validation': 'issuanceEndValidation',
        'Institution Length Validation': 'institutionLengthValidation',
        'Card ID Digit Validation': 'cardIdDigitValidation',
        'Institution ID Digit Validation': 'institutionIdDigitValidation',
        'Revocation Information Presence Validation': 'revocationPresence',
        'Revocation Status Validation': 'revocationStatus',
        'Treatment Date Presence Validation': 'treatmentDatePresence',
        'Treatment Date Range Validation': 'treatmentDateRange',
        'JWT Signature Validation': 'jwtSignatureValidation'
    };

    // Find exact match first
    for (const [name, key] of Object.entries(stepMappings)) {
        if (stepName.includes(name)) {
            return key;
        }
    }

    // Fallback for partial matches
    if (stepName.includes('BASE45')) return 'base45Decode';
    if (stepName.includes('ZLIB')) return 'zlibDecompress';
    if (stepName.includes('JWT')) {
        if (stepName.includes('Signature')) return 'jwtSignatureValidation';
        return 'jwtParsing';
    }
    if (stepName.includes('Schema')) {
        if (stepName.includes('File')) return 'schemaFileCheck';
        return 'schemaValidation';
    }

    return null;
}

function addTileClickHandlers() {
    const clickableTiles = document.querySelectorAll('.clickable-tile[data-step-key]');

    clickableTiles.forEach(tile => {
        tile.addEventListener('click', function() {
            const stepKey = this.getAttribute('data-step-key');
            if (stepKey) {
                // Navigate to the verify page with step navigation
                // Since finalization page doesn't have individual steps, redirect to verify page
                window.location.href = `/verify#step-${stepKey}`;
            }
        });

        // Add cursor pointer style to indicate clickability
        tile.style.cursor = 'pointer';
        tile.title = 'Click to navigate to verification step';
    });
}

// Initialize validation summary when page loads
document.addEventListener('DOMContentLoaded', () => {
    displayValidationSummary();
});