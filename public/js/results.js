// Results Page JavaScript
// Get data from sessionStorage
const originalData = sessionStorage.getItem('verificationData');

// Redirect back if no data
if (!originalData) {
    window.location.href = '/scanner';
}

// Start verification process immediately
processVerification();

// Handle finalize verification button
document.addEventListener('DOMContentLoaded', () => {
    const finalizeBtn = document.getElementById('finalize-verification');
    if (finalizeBtn) {
        finalizeBtn.addEventListener('click', () => {
            // Navigate to the finalization page
            window.location.href = '/finalization';
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

    // Display each verification step - using translation keys
    const stepDescriptions = {
        'Original BASE45 String': 'results-qr-data-received',
        'Decoded BASE45 (ZLIB Compressed)': 'results-base45-decoding',
        'Decompressed ZLIB (JWT)': 'results-data-decompression',
        'Parsed JWT (Clear Text)': 'results-jwt-validation',
        'Signature Verification Response': 'results-ca-lookup',
        'JWT Signature Validation': 'results-signature-verification'
    };

    // Fallback descriptions for translation
    const fallbackDescriptions = {
        'Original BASE45 String': 'QR code data received successfully',
        'Decoded BASE45 (ZLIB Compressed)': 'BASE45 decoding completed',
        'Decompressed ZLIB (JWT)': 'Data decompression successful',
        'Parsed JWT (Clear Text)': 'JWT structure validation passed',
        'Signature Verification Response': 'Certificate authority lookup completed',
        'JWT Signature Validation': 'Digital signature verification completed'
    };

    steps.forEach((step, index) => {
        const stepDiv = document.createElement('div');
        const isFailed = step.name.includes('FAILED');
        let isSuccess = !isFailed;

        // Special handling for specific steps
        if (step.name.includes('Signature Verification Response')) {
            try {
                const data = JSON.parse(step.data);
                isSuccess = !data.error;
            } catch (e) {
                isSuccess = true;
            }
        } else if (step.name.includes('JWT Signature Validation')) {
            try {
                const data = JSON.parse(step.data);
                isSuccess = data.signatureValid === true;
            } catch (e) {
                isSuccess = false;
            }
        }

        stepDiv.className = `verification-step-result ${isSuccess ? 'success' : 'failure'}`;

        const baseStepName = step.name.replace(' (FAILED)', '');
        const descriptionKey = stepDescriptions[baseStepName];
        const fallbackDescription = fallbackDescriptions[baseStepName] || 'Processing step completed';

        let errorMessage = '';
        if (!isSuccess) {
            if (step.name.includes('FAILED')) {
                try {
                    const data = JSON.parse(step.data);
                    errorMessage = `<div class="step-error">Error: ${data.error || 'Unknown error'}</div>`;
                } catch (e) {
                    errorMessage = `<div class="step-error" data-i18n-key="results-step-failed">Step failed</div>`;
                }
            } else if (step.name.includes('Signature Verification Response')) {
                try {
                    const data = JSON.parse(step.data);
                    if (data.error) {
                        errorMessage = `<div class="step-error">Error: ${data.message || data.error}</div>`;
                    }
                } catch (e) {
                    errorMessage = `<div class="step-error" data-i18n-key="results-response-parsing-failed">Response parsing failed</div>`;
                }
            } else if (step.name.includes('JWT Signature Validation')) {
                try {
                    const data = JSON.parse(step.data);
                    if (!data.signatureValid) {
                        errorMessage = `<div class="step-error">Signature validation failed: ${data.error || 'Invalid signature'}</div>`;
                    }
                } catch (e) {
                    errorMessage = `<div class="step-error" data-i18n-key="results-signature-validation-failed">Signature validation failed</div>`;
                }
            }
        }

        stepDiv.innerHTML = `
            <div class="step-icon ${isSuccess ? 'success' : 'failure'}">
                ${isSuccess ? '✅' : '❌'}
            </div>
            <div class="step-details">
                <div class="step-title">Step ${index + 1}: ${baseStepName}</div>
                <div class="step-description" data-i18n-key="${descriptionKey}">${fallbackDescription}</div>
                ${errorMessage}
            </div>
        `;

        resultsContainer.appendChild(stepDiv);
    });

    resultsContainer.style.display = 'block';
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