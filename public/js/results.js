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

        if (response.ok && result.success) {
            displayVerificationResults(result.steps, result.validationSummary, result.overallStatus);
            actionButtons.style.display = 'block';
        } else {
            displayError(result.error || 'Unknown error', result.message, result.step);
            actionButtons.style.display = 'block';
        }
    } catch (error) {
        loadingDiv.style.display = 'none';
        displayError('Network Error', error.message, 'network');
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

    errorMessage.innerHTML = `
        <p><strong>Error:</strong> ${error}</p>
        <p><strong>Message:</strong> ${message}</p>
        <p><strong>Failed at:</strong> ${step}</p>
    `;

    errorContainer.style.display = 'block';
}