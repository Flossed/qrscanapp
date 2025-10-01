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
            // Always display validation summary, even if verification failed
            if (result.validationSummary) {
                displayValidationSummary(result.validationSummary, result.overallStatus || 'error');
            }

            // Display steps if available - always try to show something
            if (result.steps && result.steps.length > 0) {
                displayVerificationSteps(result.steps);
            } else {
                // If no detailed steps available, create a basic display from validation summary
                displayBasicVerificationSteps(result.validationSummary || {});
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
                // Also display basic verification steps when server error occurs
                displayBasicVerificationSteps(result.validationSummary);
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
            kidHeaderValidation: { status: 'skipped', message: 'Skipped due to network error' },
            algorithmHeaderValidation: { status: 'skipped', message: 'Skipped due to network error' },
            signatureVerification: { status: 'skipped', message: 'Skipped due to network error' },
            signatureCountValidation: { status: 'skipped', message: 'Skipped due to network error' },
            countryCodeValidation: { status: 'skipped', message: 'Skipped due to network error' },
            certificateValidityDate: { status: 'skipped', message: 'Skipped due to network error' },
            ehicAccreditation: { status: 'skipped', message: 'Skipped due to network error' },
            dateOfBirthValidation: { status: 'skipped', message: 'Skipped due to network error' },
            dateRangeValidation: { status: 'skipped', message: 'Skipped due to network error' },
            startIssuanceValidation: { status: 'skipped', message: 'Skipped due to network error' },
            issuanceEndValidation: { status: 'skipped', message: 'Skipped due to network error' },
            expiryDateValidation: { status: 'skipped', message: 'Skipped due to network error' },
            institutionLengthValidation: { status: 'skipped', message: 'Skipped due to network error' },
            cardIdDigitValidation: { status: 'skipped', message: 'Skipped due to network error' },
            institutionIdDigitValidation: { status: 'skipped', message: 'Skipped due to network error' },
            revocationPresence: { status: 'skipped', message: 'Skipped due to network error' },
            revocationStatus: { status: 'skipped', message: 'Skipped due to network error' },
            treatmentDatePresence: { status: 'skipped', message: 'Skipped due to network error' },
            treatmentDateRange: { status: 'skipped', message: 'Skipped due to network error' },
            expiryDateValidation: { status: 'skipped', message: 'Skipped due to network error' },
            jwtSignatureValidation: { status: 'skipped', message: 'Skipped due to network error' }
        };

        // Display the validation summary with all steps marked as skipped
        displayValidationSummary(skippedValidationSummary, 'error');

        // Also display basic verification steps to show what would have been processed
        displayBasicVerificationSteps(skippedValidationSummary);
    }
});

function displayRawDataBlock(container) {
    // Get the raw data from sessionStorage
    const rawData = sessionStorage.getItem('verificationData');

    if (rawData) {
        const rawDataDiv = document.createElement('div');
        rawDataDiv.className = 'raw-data-block';
        rawDataDiv.innerHTML = `
            <div class="raw-data-header">
                <h4>Raw QR Code Data</h4>
                <button class="btn btn-small btn-copy-raw" data-content="${rawData}">Copy Raw Data</button>
            </div>
            <div class="raw-data-content">
                <textarea readonly class="raw-data-textarea" rows="6">${rawData}</textarea>
                <div class="raw-data-info">
                    <span class="data-length">Length: ${rawData.length} characters</span>
                    <span class="data-type">Format: BASE45 Encoded</span>
                </div>
            </div>
        `;
        container.appendChild(rawDataDiv);

        // Add copy functionality for raw data
        const copyButton = rawDataDiv.querySelector('.btn-copy-raw');
        copyButton.addEventListener('click', (e) => {
            const content = e.target.dataset.content;
            navigator.clipboard.writeText(content).then(() => {
                const originalText = e.target.textContent;
                e.target.textContent = 'Copied!';
                e.target.classList.add('copied');
                setTimeout(() => {
                    e.target.textContent = originalText;
                    e.target.classList.remove('copied');
                }, 2000);
            });
        });
    }
}

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
            <div class="summary-item ${statusClass} clickable-tile" data-step-key="${step.key}">
                <span class="status-icon">${statusIcon}</span>
                <span class="step-label">${step.label}</span>
                ${messageContent}
                ${validation.errorCount !== undefined && validation.errorCount > 0 ?
                    `<span class="error-count">(${validation.errorCount} errors)</span>` : ''}
                <span class="click-indicator">→</span>
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
                <div class="summary-item ${statusClass} clickable-tile" data-step-key="${step.key}">
                    <span class="status-icon">${statusIcon}</span>
                    <span class="step-label">${step.label}</span>
                    ${validation.message ? `<span class="step-message">${validation.message}</span>` : ''}
                    ${validation.errorCount !== undefined && validation.errorCount > 0 ?
                        `<span class="error-count">(${validation.errorCount} errors)</span>` : ''}
                    <span class="click-indicator">→</span>
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
        const validation = summary[step.key] || { status: 'pending', message: '' };
        const statusIcon = getStatusIcon(validation.status);
        const statusClass = validation.status;

        summaryHTML += `
            <div class="summary-item ${statusClass} clickable-tile" data-step-key="${step.key}">
                <span class="status-icon">${statusIcon}</span>
                <span class="step-label">${step.label}</span>
                ${validation.message ? `<span class="step-message">${validation.message}</span>` : ''}
                ${validation.errorCount !== undefined && validation.errorCount > 0 ?
                    `<span class="error-count">(${validation.errorCount} errors)</span>` : ''}
                <span class="click-indicator">→</span>
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
        const validation = summary[step.key] || { status: 'pending', message: '' };
        const statusIcon = getStatusIcon(validation.status);
        const statusClass = validation.status;

        let messageContent = '';
        if (validation.message) {
            messageContent = `<span class="step-message">${validation.message}</span>`;
        }

        summaryHTML += `
            <div class="summary-item ${statusClass} clickable-tile" data-step-key="${step.key}">
                <span class="status-icon">${statusIcon}</span>
                <span class="step-label">${step.label}</span>
                ${messageContent}
                ${validation.errorCount !== undefined && validation.errorCount > 0 ?
                    `<span class="error-count">(${validation.errorCount} errors)</span>` : ''}
                <span class="click-indicator">→</span>
            </div>
        `;
    });

    summaryHTML += '</div></div>'; // Close treatment date items and category

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

    // Add click functionality to tiles
    addTileClickHandlers();
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
        'Certificate Validity Date Verification': 'certificateValidityDate',
        'EHIC Accreditation Validation': 'ehicAccreditation',
        'Date of Birth Validation': 'dateOfBirthValidation',
        'Start/End Date Validation': 'dateRangeValidation',
        'Start/Issuance Date Validation': 'startIssuanceValidation',
        'Issuance/End Date Validation': 'issuanceEndValidation',
        'Institution ID/Name Length Validation (Optional)': 'institutionLengthValidation',
        'Card ID Digit Validation (Optional)': 'cardIdDigitValidation',
        'Institution ID Digit Validation (Optional)': 'institutionIdDigitValidation',
        'Revocation Information Presence Validation': 'revocationPresence',
        'Revocation Status Validation': 'revocationStatus',
        'Treatment Date Presence Validation': 'treatmentDatePresence',
        'Treatment Date Range Validation': 'treatmentDateRange',
        'Expiry Date Validation': 'expiryDateValidation',
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
    if (stepName.includes('Signature')) return 'signatureVerification';
    if (stepName.includes('Country')) return 'countryCodeValidation';
    if (stepName.includes('Certificate')) return 'certificateValidityDate';
    if (stepName.includes('EHIC') || stepName.includes('Accreditation')) return 'ehicAccreditation';
    if (stepName.includes('Date of Birth') || stepName.includes('Birth')) return 'dateOfBirthValidation';
    if (stepName.includes('Start/End') || stepName.includes('Date Range') || (stepName.includes('Start') && stepName.includes('End'))) return 'dateRangeValidation';
    if (stepName.includes('Start/Issuance') || (stepName.includes('Start') && stepName.includes('Issuance'))) return 'startIssuanceValidation';
    if (stepName.includes('Issuance/End') || (stepName.includes('Issuance') && stepName.includes('End'))) return 'issuanceEndValidation';
    if (stepName.includes('Expiry Date')) return 'expiryDateValidation';
    if (stepName.includes('Institution') || stepName.includes('Length')) return 'institutionLengthValidation';
    if (stepName.includes('Card ID') || stepName.includes('Digit')) return 'cardIdDigitValidation';

    return null;
}

function addTileClickHandlers() {
    const clickableTiles = document.querySelectorAll('.clickable-tile');

    clickableTiles.forEach(tile => {
        tile.addEventListener('click', (e) => {
            const stepKey = e.currentTarget.dataset.stepKey;
            const targetElement = document.getElementById(`step-${stepKey}`);

            if (targetElement) {
                // Add visual feedback
                tile.classList.add('clicked');
                setTimeout(() => tile.classList.remove('clicked'), 200);

                // Smooth scroll to the target element
                targetElement.scrollIntoView({
                    behavior: 'smooth',
                    block: 'center'
                });

                // Add temporary highlight to target section
                targetElement.classList.add('highlighted');
                setTimeout(() => targetElement.classList.remove('highlighted'), 2000);
            } else {
                // If specific step not found, scroll to verification steps section
                const stepsContainer = document.getElementById('verification-steps');
                if (stepsContainer) {
                    stepsContainer.scrollIntoView({
                        behavior: 'smooth',
                        block: 'start'
                    });
                }
            }
        });

        // Add hover effect
        tile.style.cursor = 'pointer';
    });
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

function displayBasicVerificationSteps(validationSummary) {
    const container = document.getElementById('verification-steps');

    // Add a separator/header for the basic steps section
    const stepsHeader = document.createElement('div');
    stepsHeader.className = 'verification-steps-header';
    stepsHeader.innerHTML = '<h3>Verification Steps Overview</h3>';
    container.appendChild(stepsHeader);

    // Add raw data block
    displayRawDataBlock(container);

    // Technical validation steps
    const technicalSteps = [
        { key: 'qrCodeAnalysis', label: 'QR Code Analysis', description: 'Analyzed QR code structure and encoding' },
        { key: 'base45Decode', label: 'BASE45 Decoding', description: 'Decoded BASE45 encoded data' },
        { key: 'zlibDecompress', label: 'ZLIB Decompression', description: 'Decompressed ZLIB data' },
        { key: 'jwtParsing', label: 'JWT Parsing', description: 'Parsed JSON Web Token structure' },
        { key: 'schemaFileCheck', label: 'Schema File Check', description: 'Verified schema file availability' },
        { key: 'schemaValidation', label: 'Schema Validation', description: 'Validated data against schema' },
        { key: 'kidHeaderValidation', label: 'Kid Header Validation', description: 'Validated kid header format pattern' },
        { key: 'algorithmHeaderValidation', label: 'Algorithm Header Validation', description: 'Validated algorithm header value' },
        { key: 'signatureVerification', label: 'Signature Retrieval', description: 'Retrieved digital signatures from EBSI' },
        { key: 'signatureCountValidation', label: 'Signature Count Validation', description: 'Validated signature count' },
        { key: 'countryCodeValidation', label: 'Country Code Validation', description: 'Validated country codes' },
        { key: 'jwtSignatureValidation', label: 'JWT Signature Validation', description: 'Cryptographically validated JWT signature' }
    ];

    const businessSteps = [
        { key: 'certificateValidityDate', label: 'Certificate Validity Date', description: 'Verified certificate validity period' },
        { key: 'ehicAccreditation', label: 'EHIC Accreditation', description: 'Verified issuer is accredited to issue EHIC documents' },
        { key: 'dateOfBirthValidation', label: 'Date of Birth Validation', description: 'Verified date of birth is before or on EHIC start date' },
        { key: 'dateRangeValidation', label: 'Start/End Date Validation', description: 'Verified EHIC start date is before or on end date' },
        { key: 'startIssuanceValidation', label: 'Start/Issuance Date Validation', description: 'Verified EHIC start date is before or on issuance date' },
        { key: 'issuanceEndValidation', label: 'Issuance/End Date Validation', description: 'Verified EHIC issuance date is before or on end date' },
        { key: 'expiryDateValidation', label: 'Expiry Date Validation', description: 'Verified expiry date is equal to or greater than end date' },
        { key: 'institutionLengthValidation', label: 'Institution Length Validation', description: 'Optional validation of institution ID/name length (warning only)' },
        { key: 'cardIdDigitValidation', label: 'Card ID Digit Validation', description: 'Optional validation that card ID contains only digits (warning only)' }
    ];

    // Add Technical Validations section header
    const technicalHeader = document.createElement('div');
    technicalHeader.className = 'validation-category-header';
    technicalHeader.innerHTML = '<h3 class="category-banner technical-banner">Technical Validations</h3>';
    container.appendChild(technicalHeader);

    technicalSteps.forEach((step, index) => {
        const validation = validationSummary[step.key] || { status: 'pending', message: 'Not processed' };
        const statusIcon = getStatusIcon(validation.status);
        const statusClass = validation.status;

        const stepDiv = document.createElement('div');
        stepDiv.className = `verification-step basic-step ${statusClass}`;
        stepDiv.id = `step-${step.key}`;  // Add unique ID for navigation
        stepDiv.innerHTML = `
            <div class="step-header">
                <h3><span class="status-icon">${statusIcon}</span> Step ${index + 1}: ${step.label}</h3>
            </div>
            <div class="step-content">
                <p class="step-description">${step.description}</p>
                <p class="step-status"><strong>Status:</strong> ${validation.message || validation.status}</p>
            </div>
        `;
        container.appendChild(stepDiv);
    });

    // Add Business Validations section header
    const businessHeader = document.createElement('div');
    businessHeader.className = 'validation-category-header';
    businessHeader.innerHTML = '<h3 class="category-banner business-banner">Business Validations</h3>';
    container.appendChild(businessHeader);

    businessSteps.forEach((step, index) => {
        const validation = validationSummary[step.key] || { status: 'pending', message: 'Not processed' };
        const statusIcon = getStatusIcon(validation.status);
        const statusClass = validation.status;

        const stepDiv = document.createElement('div');
        stepDiv.className = `verification-step basic-step ${statusClass}`;
        stepDiv.id = `step-${step.key}`;  // Add unique ID for navigation
        stepDiv.innerHTML = `
            <div class="step-header">
                <h3><span class="status-icon">${statusIcon}</span> Business Step ${index + 1}: ${step.label}</h3>
            </div>
            <div class="step-content">
                <p class="step-description">${step.description}</p>
                <p class="step-status"><strong>Status:</strong> ${validation.message || validation.status}</p>
            </div>
        `;
        container.appendChild(stepDiv);
    });
}

function displayVerificationSteps(steps) {
    const container = document.getElementById('verification-steps');

    // Add a separator/header for the detailed steps section
    const stepsHeader = document.createElement('div');
    stepsHeader.className = 'verification-steps-header';
    stepsHeader.innerHTML = '<h3>Detailed Verification Steps</h3>';
    container.appendChild(stepsHeader);

    // Add raw data block
    displayRawDataBlock(container);

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

        // Create ID based on step name mapping
        const stepId = getStepIdFromName(step.name);
        if (stepId) {
            stepDiv.id = `step-${stepId}`;
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