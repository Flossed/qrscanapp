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

        // Check identity verification status - if any "not-matched", mark as error
        const identityVerificationData = sessionStorage.getItem('identityVerification');
        if (identityVerificationData) {
            try {
                const identityData = JSON.parse(identityVerificationData);
                const identityValue = identityData.identityVerification || 'not-checked';
                const birthdateValue = identityData.birthdateVerification || 'not-checked';

                if (identityValue === 'not-matched' || birthdateValue === 'not-matched') {
                    hasErrors = true; // Visual verification failure should cause overall failure
                }
            } catch (e) {
                console.error('Could not parse identity verification data for overall status');
            }
        }

        if (hasErrors) {
            statusIcon.textContent = '❌';
            statusTitle.textContent = 'Verification Failed';
            statusTitle.setAttribute('data-i18n-key', 'finalization-verification-failed');
            statusSubtitle.textContent = 'One or more verification steps have failed';
            statusSubtitle.setAttribute('data-i18n-key', 'finalization-verification-failed-message');
            statusContainer.style.color = '#721c24';
            statusContainer.style.backgroundColor = '#f8d7da';
        } else {
            // Success or success with warnings - both show green
            statusIcon.textContent = '✅';
            statusTitle.textContent = 'Verification Approved';
            statusTitle.setAttribute('data-i18n-key', 'finalization-verification-approved');
            statusSubtitle.textContent = 'EHIC valid and verified';
            statusSubtitle.setAttribute('data-i18n-key', 'finalization-ehic-valid');
            // Keep default green styling
        }

        // Add warning notification box if warnings exist (but no errors)
        if (hasWarnings && !hasErrors) {
            // Check if warning notification already exists to avoid duplicates
            let warningNotification = document.querySelector('.warning-notification');
            if (!warningNotification) {
                warningNotification = document.createElement('div');
                warningNotification.className = 'warning-notification';
                warningNotification.innerHTML = `
                    <span class="warning-icon">⚠️</span>
                    <span data-i18n-key="finalization-non-blocking-warnings">Some non-blocking warnings found</span>
                `;
                // Insert after the status container
                statusContainer.parentNode.insertBefore(warningNotification, statusContainer.nextSibling);
            }
        }
    } catch (e) {
        console.error('Could not parse verification results for status update:', e);
    }
}

// Identity verification status is now handled in displayValidationSummary() function

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

// Print functionality removed - print summary button no longer available

// PDF Print functionality
document.getElementById('print-pdf').addEventListener('click', async () => {
    await printPDF(false); // Single language PDF
});

document.getElementById('print-pdf-bilingual').addEventListener('click', async () => {
    await printPDF(true); // Bilingual PDF
});

// Function to generate and print PDF
async function printPDF(bilingual = false) {
    const printButton = bilingual ? document.getElementById('print-pdf-bilingual') : document.getElementById('print-pdf');
    const originalText = printButton.textContent;

    try {
        // Disable button while generating
        printButton.disabled = true;
        printButton.textContent = getTranslatedText('finalization-generating-pdf', 'Generating PDF...');

        // Prepare the same data structure as email functionality
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

        const pdfData = {
            referenceNumber: document.getElementById('reference-number').textContent,
            treatmentDate: document.getElementById('treatment-date-summary').textContent,
            verificationData: sessionStorage.getItem('verificationData') || '',
            verificationStatus: verificationStatus,
            identityVerification: sessionStorage.getItem('identityVerification'),
            timestamp: new Date().toISOString(),
            language: sessionStorage.getItem('usedLanguage') || 'en',
            bilingual: bilingual
        };

        // Call PDF generation API
        const response = await fetch('/api/generate-verification-pdf', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(pdfData)
        });

        if (response.ok) {
            // Create blob from response
            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);

            // Open PDF in new window for printing
            const printWindow = window.open(url, '_blank');

            // Clean up blob URL after a delay
            setTimeout(() => {
                window.URL.revokeObjectURL(url);
            }, 1000);

            // Optional: Auto-trigger print dialog (may be blocked by browsers)
            if (printWindow) {
                printWindow.onload = () => {
                    setTimeout(() => {
                        printWindow.print();
                    }, 500);
                };
            }
        } else {
            const error = await response.json();
            alert(getTranslatedText('finalization-pdf-error', 'Failed to generate PDF: ') + (error.error || 'Unknown error'));
        }
    } catch (error) {
        console.error('PDF generation error:', error);
        alert(getTranslatedText('finalization-pdf-network-error', 'Network error while generating PDF. Please try again.'));
    } finally {
        // Re-enable button
        printButton.disabled = false;
        printButton.textContent = originalText;
    }
}

// Verification Results Download functionality
document.getElementById('download-verification-results').addEventListener('click', async () => {
    await downloadVerificationResults();
});

// Function to generate and download verification results as ZIP
async function downloadVerificationResults() {
    const downloadButton = document.getElementById('download-verification-results');
    const originalText = downloadButton.textContent;

    try {
        // Disable button while generating
        downloadButton.disabled = true;
        downloadButton.textContent = getTranslatedText('finalization-downloading-pdf', 'Downloading Verification Results...');

        // Prepare the same data structure as email functionality
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

        const zipData = {
            referenceNumber: document.getElementById('reference-number').textContent,
            treatmentDate: document.getElementById('treatment-date-summary').textContent,
            verificationData: sessionStorage.getItem('verificationData') || '',
            verificationStatus: verificationStatus,
            identityVerification: sessionStorage.getItem('identityVerification'),
            timestamp: new Date().toISOString(),
            language: sessionStorage.getItem('usedLanguage') || 'en'
        };

        // Call ZIP generation API
        const response = await fetch('/api/download-verification-results', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(zipData)
        });

        if (response.ok) {
            // Create blob from response
            const blob = await response.blob();

            // Generate filename based on reference number
            const referenceNumber = document.getElementById('reference-number').textContent;
            const timestamp = new Date().toISOString().slice(0, 10); // YYYY-MM-DD format
            const filename = `verification-results-${referenceNumber}-${timestamp}.zip`;

            // Create temporary anchor element for download
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.style.display = 'none';
            a.href = url;
            a.download = filename;

            // Append to body, click, and remove
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);

            // Clean up blob URL after a delay
            setTimeout(() => {
                window.URL.revokeObjectURL(url);
            }, 1000);

        } else {
            const error = await response.json();
            alert(getTranslatedText('finalization-download-error', 'Failed to download verification results: ') + (error.error || 'Unknown error'));
        }
    } catch (error) {
        console.error('Verification results download error:', error);
        alert(getTranslatedText('finalization-download-network-error', 'Network error while downloading verification results. Please try again.'));
    } finally {
        // Re-enable button
        downloadButton.disabled = false;
        downloadButton.textContent = originalText;
    }
}

// Show/hide bilingual PDF button based on verification data
function updatePDFButtons() {
    const verificationResults = sessionStorage.getItem('verificationResults');
    const language = sessionStorage.getItem('usedLanguage') || 'en';

    if (verificationResults) {
        try {
            const results = JSON.parse(verificationResults);
            const verificationData = sessionStorage.getItem('verificationData');

            // Check if we have verification data that would support bilingual PDFs
            if (verificationData && language !== 'en') {
                const countryLang = getCountryLanguage(results) || 'Country Language';

                // Show and update print bilingual button
                const bilingualPrintButton = document.getElementById('print-pdf-bilingual');
                if (bilingualPrintButton) {
                    bilingualPrintButton.style.display = 'inline-block';
                    bilingualPrintButton.textContent = `Print PDF (${language.toUpperCase()} + ${countryLang.toUpperCase()})`;
                }

                // Show and update download bilingual button
                const bilingualDownloadButton = document.getElementById('download-pdf-bilingual');
                if (bilingualDownloadButton) {
                    bilingualDownloadButton.style.display = 'inline-block';
                    bilingualDownloadButton.textContent = `Download PDF (${language.toUpperCase()} + ${countryLang.toUpperCase()})`;
                }
            }
        } catch (e) {
            console.error('Could not parse verification results for PDF buttons');
        }
    }
}

// Helper function to determine country language from verification results
function getCountryLanguage(results) {
    // This would extract the issuing country and map to language
    // For now, return a generic label
    return 'EN';
}

// Clear session data when starting new verification
document.querySelector('a[href="/"]').addEventListener('click', () => {
    sessionStorage.clear();
});

// Calculate category status based on all validations in that category
function calculateCategoryStatus(steps, validationSummary) {
    let hasError = false;
    let hasWarning = false;
    let hasSuccess = false;
    let totalCount = 0;
    let successCount = 0;
    let errorCount = 0;
    let warningCount = 0;
    let skippedCount = 0;

    steps.forEach(step => {
        const validation = validationSummary[step.key] || { status: 'pending' };
        totalCount++;

        if (validation.status === 'error') {
            hasError = true;
            errorCount++;
        } else if (validation.status === 'warning') {
            hasWarning = true;
            warningCount++;
        } else if (validation.status === 'success') {
            hasSuccess = true;
            successCount++;
        } else if (validation.status === 'skipped') {
            skippedCount++;
        }
    });

    // Determine overall category status
    let categoryStatus = 'pending';
    if (hasError) {
        categoryStatus = 'error';
    } else if (hasWarning) {
        categoryStatus = 'warning';
    } else if (successCount === totalCount) {
        categoryStatus = 'success';
    } else if (successCount + skippedCount === totalCount) {
        // All tests either passed or were skipped (no failures)
        categoryStatus = 'partial';
    }

    return {
        status: categoryStatus,
        totalCount,
        successCount,
        errorCount,
        warningCount,
        skippedCount
    };
}

// Display validation summary with technical/business categories
function displayValidationSummary() {
    const verificationResults = sessionStorage.getItem('verificationResults');
    const summaryGrid = document.querySelector('.summary-grid');

    if (!verificationResults || !summaryGrid) {
        return;
    }

    try {
        const results = JSON.parse(verificationResults);
        const validationSummary = results.validationSummary || {};

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
            { key: 'officialIdValidation', label: 'Official ID Validation' },
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
            { key: 'institutionIdDigitValidation', label: 'Institution ID Digit Validation (Optional)' }
        ];

        // Revocation Validations
        const revocationSteps = [
            { key: 'revocationPresence', label: 'Revocation Information Presence' },
            { key: 'revocationStatus', label: 'Revocation Status Check' }
        ];

        // Treatment Date Validations
        const treatmentDateSteps = [
            { key: 'treatmentDatePresence', label: 'Treatment Date Presence' },
            { key: 'treatmentDateRange', label: 'Treatment Date Range Validation' }
        ];

        // Calculate category statuses
        const technicalCategory = calculateCategoryStatus(technicalSteps, validationSummary);
        const businessCategory = calculateCategoryStatus(businessSteps, validationSummary);
        const revocationCategory = calculateCategoryStatus(revocationSteps, validationSummary);
        const treatmentDateCategory = calculateCategoryStatus(treatmentDateSteps, validationSummary);

        // Build HTML for 4 category summary tiles matching existing summary-item format
        let tilesHTML = '';

        // Technical Validations Category Tile
        const techStatusIcon = technicalCategory.status === 'success' ? '✅' :
                               technicalCategory.status === 'error' ? '❌' :
                               technicalCategory.status === 'warning' ? '⚠️' :
                               technicalCategory.status === 'partial' ? '☑️' : '✗';
        let techStatusText = `${technicalCategory.successCount}/${technicalCategory.totalCount} passed`;
        if (technicalCategory.errorCount > 0) {
            techStatusText += ` (${technicalCategory.errorCount} errors)`;
        }
        if (technicalCategory.warningCount > 0) {
            techStatusText += ` (${technicalCategory.warningCount} warnings)`;
        }
        if (technicalCategory.skippedCount > 0) {
            techStatusText += ` (${technicalCategory.skippedCount} skipped)`;
        }
        tilesHTML += `
            <div class="summary-item">
                <span class="summary-icon">⚙️</span>
                <div class="summary-details">
                    <div class="summary-label">Technical Validations</div>
                    <div class="summary-value">${techStatusIcon} ${techStatusText}</div>
                </div>
            </div>
        `;

        // Business Validations Category Tile
        const businessStatusIcon = businessCategory.status === 'success' ? '✅' :
                                   businessCategory.status === 'error' ? '❌' :
                                   businessCategory.status === 'warning' ? '⚠️' :
                                   businessCategory.status === 'partial' ? '☑️' : '✗';
        let businessStatusText = `${businessCategory.successCount}/${businessCategory.totalCount} passed`;
        if (businessCategory.errorCount > 0) {
            businessStatusText += ` (${businessCategory.errorCount} errors)`;
        }
        if (businessCategory.warningCount > 0) {
            businessStatusText += ` (${businessCategory.warningCount} warnings)`;
        }
        if (businessCategory.skippedCount > 0) {
            businessStatusText += ` (${businessCategory.skippedCount} skipped)`;
        }
        tilesHTML += `
            <div class="summary-item">
                <span class="summary-icon">📋</span>
                <div class="summary-details">
                    <div class="summary-label">Business Validations</div>
                    <div class="summary-value">${businessStatusIcon} ${businessStatusText}</div>
                </div>
            </div>
        `;

        // Revocation Validations Category Tile
        const revocationStatusIcon = revocationCategory.status === 'success' ? '✅' :
                                     revocationCategory.status === 'error' ? '❌' :
                                     revocationCategory.status === 'warning' ? '⚠️' :
                                     revocationCategory.status === 'partial' ? '☑️' : '✗';
        let revocationStatusText = `${revocationCategory.successCount}/${revocationCategory.totalCount} passed`;
        if (revocationCategory.errorCount > 0) {
            revocationStatusText += ` (${revocationCategory.errorCount} errors)`;
        }
        if (revocationCategory.warningCount > 0) {
            revocationStatusText += ` (${revocationCategory.warningCount} warnings)`;
        }
        if (revocationCategory.skippedCount > 0) {
            revocationStatusText += ` (${revocationCategory.skippedCount} skipped)`;
        }
        tilesHTML += `
            <div class="summary-item">
                <span class="summary-icon">🔒</span>
                <div class="summary-details">
                    <div class="summary-label">Revocation Validations</div>
                    <div class="summary-value">${revocationStatusIcon} ${revocationStatusText}</div>
                </div>
            </div>
        `;

        // Treatment Date Validations Category Tile
        const treatmentStatusIcon = treatmentDateCategory.status === 'success' ? '✅' :
                                    treatmentDateCategory.status === 'error' ? '❌' :
                                    treatmentDateCategory.status === 'warning' ? '⚠️' :
                                    treatmentDateCategory.status === 'partial' ? '☑️' : '✗';
        let treatmentStatusText = `${treatmentDateCategory.successCount}/${treatmentDateCategory.totalCount} passed`;
        if (treatmentDateCategory.errorCount > 0) {
            treatmentStatusText += ` (${treatmentDateCategory.errorCount} errors)`;
        }
        if (treatmentDateCategory.warningCount > 0) {
            treatmentStatusText += ` (${treatmentDateCategory.warningCount} warnings)`;
        }
        if (treatmentDateCategory.skippedCount > 0) {
            treatmentStatusText += ` (${treatmentDateCategory.skippedCount} skipped)`;
        }
        tilesHTML += `
            <div class="summary-item">
                <span class="summary-icon">📅</span>
                <div class="summary-details">
                    <div class="summary-label">Treatment Date Validations</div>
                    <div class="summary-value">${treatmentStatusIcon} ${treatmentStatusText}</div>
                </div>
            </div>
        `;

        // Visual Verification Category Tile
        const identityVerificationData = sessionStorage.getItem('identityVerification');
        let visualStatusIcon = '✗';
        let visualStatusText = 'Not checked';
        let visualSuccessCount = 0;
        let visualTotalCount = 2; // Identity and birthdate
        let visualErrorCount = 0;
        let visualWarningCount = 0;

        if (identityVerificationData) {
            try {
                const identityData = JSON.parse(identityVerificationData);
                const identityValue = identityData.identityVerification || 'not-checked';
                const birthdateValue = identityData.birthdateVerification || 'not-checked';

                // Count the results
                if (identityValue === 'matched') visualSuccessCount++;
                else if (identityValue === 'not-matched') visualErrorCount++;
                else if (identityValue === 'not-checked') visualWarningCount++;

                if (birthdateValue === 'matched') visualSuccessCount++;
                else if (birthdateValue === 'not-matched') visualErrorCount++;
                else if (birthdateValue === 'not-checked') visualWarningCount++;

                // Determine overall status
                if (visualErrorCount > 0) {
                    visualStatusIcon = '❌';
                    visualStatusText = `${visualSuccessCount}/${visualTotalCount} passed (${visualErrorCount} errors)`;
                } else if (visualWarningCount > 0) {
                    visualStatusIcon = '⚠️';
                    visualStatusText = `${visualSuccessCount}/${visualTotalCount} passed (${visualWarningCount} not checked)`;
                } else {
                    visualStatusIcon = '✅';
                    visualStatusText = `${visualSuccessCount}/${visualTotalCount} passed`;
                }
            } catch (e) {
                console.error('Could not parse identity verification data for visual verification tile');
            }
        }

        tilesHTML += `
            <div class="summary-item">
                <span class="summary-icon">👁️</span>
                <div class="summary-details">
                    <div class="summary-label">Visual Verification</div>
                    <div class="summary-value">${visualStatusIcon} ${visualStatusText}</div>
                </div>
            </div>
        `;

        // Append the 5 tiles to the summary grid
        summaryGrid.insertAdjacentHTML('beforeend', tilesHTML);

        // Hide the validation details section since we moved everything to summary
        const validationDetailsSection = document.querySelector('.validation-details-section');
        if (validationDetailsSection) {
            validationDetailsSection.style.display = 'none';
        }
    } catch (e) {
        console.error('Could not parse verification results for validation summary:', e);
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
        'Official ID Validation': 'officialIdValidation',
        'Institution ID Digit Validation (Optional)': 'institutionIdDigitValidation',
        'Certificate Validity Date': 'certificateValidityDate',
        'EHIC Accreditation': 'ehicAccreditation',
        'Date of Birth Validation': 'dateOfBirthValidation',
        'Date Range Validation': 'dateRangeValidation',
        'Start/Issuance Date Validation': 'startIssuanceValidation',
        'Issuance/End Date Validation': 'issuanceEndValidation',
        'Institution Length Validation': 'institutionLengthValidation',
        'Card ID Digit Validation': 'cardIdDigitValidation',
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
    updatePDFButtons();
});