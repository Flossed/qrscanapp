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

    // Check if we have data to verify
    if (!originalData) {
        displayError(
            'No data available',
            'No QR code data found. Please scan a QR code first.',
            'initialization'
        );
        return;
    }

    // Show loading, hide error and steps
    loadingDiv.style.display = 'block';
    errorContainer.style.display = 'none';
    stepsContainer.innerHTML = '';

    try {
        // Get treatment date from sessionStorage if available
        const treatmentDate = sessionStorage.getItem('treatmentDate');

        const response = await fetch('/api/verify', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                data: originalData,
                treatmentDate: treatmentDate
            })
        });

        const result = await response.json();
        loadingDiv.style.display = 'none';

        if (response.ok) {
            // Always display validation summary, even if verification failed
            if (result.validationSummary) {
                displayValidationSummary(result.validationSummary, result.overallStatus || 'error');
            }

            // Display steps if available
            if (result.steps && result.steps.length > 0) {
                displayVerificationSteps(result.steps);
            }

            // If there's an error, show error details too
            if (!result.success) {
                displayError(
                    result.error || 'Verification failed',
                    result.message || 'One or more validation steps failed',
                    result.step || 'validation'
                );
            }
        } else {
            // Server error - still try to show validation summary if available
            displayError(
                result.error || 'Server error',
                result.message || response.statusText || 'Server communication error',
                result.step || 'server'
            );

            if (result.validationSummary) {
                displayValidationSummary(result.validationSummary, result.overallStatus || 'error');
            }
        }
    } catch (error) {
        loadingDiv.style.display = 'none';
        displayError(
            'Network Error',
            error.message || 'Unable to connect to verification service',
            'network'
        );

        // Create a minimal validation summary showing all steps as skipped
        const skippedValidationSummary = {
            qrCodeAnalysis: { status: 'skipped', message: 'Skipped due to network error' },
            base45Decode: { status: 'skipped', message: 'Skipped due to network error' },
            zlibDecompress: { status: 'skipped', message: 'Skipped due to network error' },
            jwtParsing: { status: 'skipped', message: 'Skipped due to network error' },
            schemaFileCheck: { status: 'skipped', message: 'Skipped due to network error' },
            schemaValidation: { status: 'skipped', message: 'Skipped due to network error' },
            signatureVerification: { status: 'skipped', message: 'Skipped due to network error' },
            signatureCountValidation: { status: 'skipped', message: 'Skipped due to network error' },
            countryCodeValidation: { status: 'skipped', message: 'Skipped due to network error' },
            certificateValidityDate: { status: 'skipped', message: 'Skipped due to network error' },
            jwtSignatureValidation: { status: 'skipped', message: 'Skipped due to network error' }
        };

        // Display the validation summary with all steps marked as skipped
        displayValidationSummary(skippedValidationSummary, 'error');
    }
});

function displayValidationSummary(summary, overallStatus) {
    const container = document.getElementById('verification-steps');

    // Create main summary container
    const summaryDiv = document.createElement('div');
    summaryDiv.className = `validation-summary ${overallStatus}`;
    summaryDiv.id = 'validation-summary';

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

    let summaryHTML = '<h3>Validation Summary</h3>';

    // Technical Validations Banner
    summaryHTML += '<div class="validation-category">';
    summaryHTML += '<h4 class="category-banner technical-banner">Technical Validations</h4>';
    summaryHTML += '<div class="summary-items technical-items">';

    technicalSteps.forEach(step => {
        const validation = summary[step.key] || { status: 'pending', message: '' };
        const statusIcon = getStatusIcon(validation.status);
        const statusClass = validation.status;

        let messageContent = '';
        if (validation.message) {
            messageContent = `<span class="step-message">${validation.message}</span>`;
        }

        summaryHTML += `
            <div class="summary-item ${statusClass}">
                <span class="status-icon">${statusIcon}</span>
                <span class="step-label">${step.label}</span>
                ${messageContent}
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
            const validation = summary[step.key] || { status: 'pending', message: '' };
            const statusIcon = getStatusIcon(validation.status);
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

    // Add overall status
    const overallIcon = getStatusIcon(overallStatus);
    summaryHTML += `
        <div class="overall-status ${overallStatus}">
            <span class="status-icon">${overallIcon}</span>
            <strong>Overall Status: ${overallStatus.toUpperCase()}</strong>
        </div>
    `;

    summaryDiv.innerHTML = summaryHTML;

    // Insert at the beginning of the container
    container.insertBefore(summaryDiv, container.firstChild);
}

function getStatusIcon(status) {
    switch(status) {
        case 'success': return '✓';
        case 'error': return '✗';
        case 'warning': return '⚠';
        case 'pending': return '○';
        case 'skipped': return '○';
        default: return '?';
    }
}

function displayVerificationSteps(steps) {
    const container = document.getElementById('verification-steps');

    steps.forEach((step, index) => {
        const stepDiv = document.createElement('div');
        stepDiv.className = 'verification-step';

        const previousSize = index > 0 ? steps[index - 1].size : step.size;
        const compressionRatio = index > 0 ? Math.round((step.size / previousSize) * 100) : 100;

        // Check if this is the Certificate Validity Date Verification step
        const isCertificateStep = step.name && step.name.includes('Certificate Validity Date Verification');
        let certificateDetailsHTML = '';

        if (isCertificateStep) {
            // Check if certificate details are attached to the step object
            const opensslDetails = step.certificateDetails?.parsedInfo?.opensslDetails;

            if (opensslDetails) {
                console.log('Found certificate details in step object');
                // Parse OpenSSL output into array of strings split by newlines
                const opensslLines = opensslDetails.split(/\r?\n|\r/);
                console.log('Certificate step - Split into lines:', opensslLines.length, 'lines');

                let opensslHTML = '';
                opensslLines.forEach((line) => {
                    const escapedLine = line.replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/&/g, '&amp;') || '&nbsp;';
                    opensslHTML += `<div class="cert-line">${escapedLine}</div>`;
                });

                certificateDetailsHTML = `
                    <div class="certificate-details-step">
                        <h4>Certificate Details (OpenSSL Format):</h4>
                        <div class="openssl-output">${opensslHTML}</div>
                    </div>`;
            } else {
                // Fallback: try to parse from JSON if certificate details not found in step object
                try {
                    const stepDataObj = JSON.parse(step.data);
                    const fallbackOpensslDetails = stepDataObj?.certificateDetails?.parsedInfo?.opensslDetails;

                    if (fallbackOpensslDetails) {
                        console.log('Found certificate details in step JSON data (fallback)');
                        const opensslLines = fallbackOpensslDetails.split(/\r?\n|\r/);
                        let opensslHTML = '';
                        opensslLines.forEach((line) => {
                            const escapedLine = line.replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/&/g, '&amp;') || '&nbsp;';
                            opensslHTML += `<div class="cert-line">${escapedLine}</div>`;
                        });
                        certificateDetailsHTML = `
                            <div class="certificate-details-step">
                                <h4>Certificate Details (OpenSSL Format):</h4>
                                <div class="openssl-output">${opensslHTML}</div>
                            </div>`;
                    }
                } catch (e) {
                    console.log('Could not parse certificate details from step data:', e);
                }
            }
        }

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
                ${certificateDetailsHTML}
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

    // Provide better default values for undefined parameters
    const errorText = error || 'Verification error';
    const messageText = message || 'The verification process encountered an error';
    const stepText = step || 'Unknown step';

    errorMessage.innerHTML = `
        <p><strong>${getTranslatedText('verify-error-label', 'Error:')}</strong> ${errorText}</p>
        <p><strong>${getTranslatedText('verify-message-label', 'Details:')}</strong> ${messageText !== 'undefined' ? messageText : 'No additional details available'}</p>
        <p><strong>${getTranslatedText('verify-failed-at', 'Failed at:')}</strong> ${stepText !== 'undefined' ? stepText : 'Validation process'}</p>
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