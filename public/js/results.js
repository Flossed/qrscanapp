// Results Page JavaScript
// Get data from sessionStorage
const originalData = sessionStorage.getItem('verificationData');

// Redirect back if no data
if (!originalData) {
    window.location.href = '/scanner';
}

// Start verification process immediately
processVerification();

// Handle continue to identity check button
document.addEventListener('DOMContentLoaded', () => {
    const identityBtn = document.getElementById('continue-identity-check');
    if (identityBtn) {
        identityBtn.addEventListener('click', () => {
            // Navigate to the identity check page
            window.location.href = '/identity-check';
        });
    }
});

async function processVerification() {
    const loadingDiv = document.getElementById('loading');
    const errorContainer = document.getElementById('error-container');
    const resultsContainer = document.getElementById('verification-results');
    const overallStatus = document.getElementById('overall-status');
    const actionButtons = document.getElementById('action-buttons');

    try {
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
            // Always display validation results, regardless of success/failure
            displayVerificationResults(result.steps || [], result.validationSummary || {}, result.overallStatus || 'error');

            // If there's an error, also show the error details
            if (!result.success) {
                displayError(result.error || 'Verification failed', result.message || 'One or more validation steps failed', result.step || 'validation');
            }
            actionButtons.style.display = 'block';
        } else {
            // Network or server error - still try to show what we can
            displayError(result.error || 'Server error', result.message || response.statusText, result.step || 'server');

            // Try to display any validation summary if available
            if (result.validationSummary) {
                displayVerificationResults(result.steps || [], result.validationSummary, result.overallStatus || 'error');
            }
            actionButtons.style.display = 'block';
        }
    } catch (error) {
        loadingDiv.style.display = 'none';
        displayError('Network Error', error.message || 'Unable to connect to verification service', 'network');

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
            ehicAccreditation: { status: 'skipped', message: 'Skipped due to network error' },
            dateOfBirthValidation: { status: 'skipped', message: 'Skipped due to network error' },
            dateRangeValidation: { status: 'skipped', message: 'Skipped due to network error' },
            startIssuanceValidation: { status: 'skipped', message: 'Skipped due to network error' },
            issuanceEndValidation: { status: 'skipped', message: 'Skipped due to network error' },
            institutionLengthValidation: { status: 'skipped', message: 'Skipped due to network error' },
            cardIdDigitValidation: { status: 'skipped', message: 'Skipped due to network error' },
            institutionIdDigitValidation: { status: 'skipped', message: 'Skipped due to network error' },
            jwtSignatureValidation: { status: 'skipped', message: 'Skipped due to network error' }
        };

        // Display the validation summary with all steps marked as skipped
        displayVerificationResults([], skippedValidationSummary, 'error');
        actionButtons.style.display = 'block';
    }
}

function displayVerificationResults(steps, validationSummary, overallStatus) {
    const resultsContainer = document.getElementById('verification-results');
    const overallStatusDiv = document.getElementById('overall-status');

    // Use the validation summary from the backend instead of manually parsing steps
    const allStepsSuccessful = overallStatus === 'success';

    // Create verification status object for saving (maintaining backward compatibility)
    const verificationStatus = {
        overall: allStepsSuccessful,
        steps: {
            base45Decode: validationSummary?.base45Decode?.status === 'success',
            zlibDecompression: validationSummary?.zlibDecompress?.status === 'success',
            jwtParsing: validationSummary?.jwtParsing?.status === 'success',
            signatureVerification: validationSummary?.jwtSignatureValidation?.status === 'success',
            certificateAuthority: validationSummary?.signatureVerification?.status === 'success'
        },
        details: {},
        validationSummary: validationSummary,
        overallStatus: overallStatus
    };

    // Process each step and update verification status
    steps.forEach(step => {
        // Check step status and update verification object
        if (step.name.includes('Original BASE45 String')) {
            verificationStatus.steps.base45Decode = true;
        } else if (step.name.includes('Decoded BASE45')) {
            verificationStatus.steps.base45Decode = !step.name.includes('FAILED');
        } else if (step.name.includes('Decompressed ZLIB')) {
            verificationStatus.steps.zlibDecompression = !step.name.includes('FAILED');
        } else if (step.name.includes('Parsed JWT')) {
            verificationStatus.steps.jwtParsing = !step.name.includes('FAILED');
            // Extract JWT data if available
            try {
                const jwtData = JSON.parse(step.data);
                verificationStatus.details.jwt = jwtData;
            } catch (e) {
                console.log('Could not parse JWT data');
            }
        } else if (step.name.includes('Signature Verification Response')) {
            try {
                const data = JSON.parse(step.data);
                verificationStatus.steps.certificateAuthority = !data.error;
                verificationStatus.details.ebsiResponse = data;
            } catch (e) {
                verificationStatus.steps.certificateAuthority = false;
            }
        } else if (step.name.includes('JWT Signature Validation')) {
            try {
                const data = JSON.parse(step.data);
                verificationStatus.steps.signatureVerification = data.signatureValid === true;
                verificationStatus.details.signatureValidation = data;
            } catch (e) {
                verificationStatus.steps.signatureVerification = false;
            }
        }
    });

    // Save verification status to sessionStorage
    sessionStorage.setItem('verificationResults', JSON.stringify(verificationStatus));

    // Display overall status using the backend validation result
    overallStatusDiv.className = `overall-status ${allStepsSuccessful ? 'success' : 'failure'}`;
    overallStatusDiv.innerHTML = `
        <span class="status-icon">${allStepsSuccessful ? '✅' : '❌'}</span>
        <span data-i18n-key="${allStepsSuccessful ? 'results-verification-successful' : 'results-verification-failed'}">${allStepsSuccessful ? 'Verification Successful' : 'Verification Failed'}</span>
    `;

    // Display validation summary with technical and business categories
    displayValidationSummary(validationSummary, overallStatus, resultsContainer);

    resultsContainer.style.display = 'block';
}

function displayValidationSummary(validationSummary, overallStatus, container) {
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
        { key: 'institutionLengthValidation', label: 'Institution Length Validation' },
        { key: 'cardIdDigitValidation', label: 'Card ID Digit Validation' },
        { key: 'institutionIdDigitValidation', label: 'Institution ID Digit Validation' }
    ];

    const summaryDiv = document.createElement('div');
    summaryDiv.className = `validation-summary ${overallStatus}`;
    summaryDiv.id = 'validation-summary-results';

    let summaryHTML = '<h3>Validation Summary</h3>';

    // Technical Validations Banner
    summaryHTML += '<div class="validation-category">';
    summaryHTML += '<h4 class="category-banner technical-banner">Technical Validations</h4>';
    summaryHTML += '<div class="summary-items technical-items">';

    technicalSteps.forEach(step => {
        const validation = validationSummary[step.key] || { status: 'pending', message: '' };
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
            const validation = validationSummary[step.key] || { status: 'pending', message: '' };
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

    summaryDiv.innerHTML = summaryHTML;
    container.appendChild(summaryDiv);
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

function displayError(error, message, step) {
    const errorContainer = document.getElementById('error-container');
    const errorMessage = document.getElementById('error-message');
    const overallStatus = document.getElementById('overall-status');

    // Display overall failure status
    overallStatus.className = 'overall-status failure';
    overallStatus.innerHTML = `
        <span class="status-icon">❌</span>
        <div data-i18n-key="results-verification-failed">Verification Failed</div>
    `;

    // Provide better default values for undefined parameters
    const errorText = error || 'Verification error';
    const messageText = message || 'The verification process encountered an error';
    const stepText = step || 'Unknown step';

    errorMessage.innerHTML = `
        <p><strong>Error:</strong> ${errorText}</p>
        <p><strong>Details:</strong> ${messageText !== 'undefined' ? messageText : 'No additional details available'}</p>
        <p><strong>Failed at:</strong> ${stepText !== 'undefined' ? stepText : 'Validation process'}</p>
    `;

    errorContainer.style.display = 'block';
}