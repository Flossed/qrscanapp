// Identity Check Page JavaScript
// Button is enabled by default since identity verification is optional
const identityCheckbox = document.getElementById('identityVerified');
const continueButton = document.getElementById('continueToFinalization');

// Enable button by default since verification is optional
continueButton.disabled = false;

// Load and display PRC data when page loads
document.addEventListener('DOMContentLoaded', function() {
    loadPRCData();
});

function loadPRCData() {
    const verificationResults = sessionStorage.getItem('verificationResults');
    const prcDataDisplay = document.getElementById('prc-data-display');

    if (!verificationResults) {
        prcDataDisplay.innerHTML = '<div class="prc-data-error">No verification data available. Please complete QR verification first.</div>';
        return;
    }

    try {
        const results = JSON.parse(verificationResults);
        let prcData = null;
        let jwtData = null;

        // First try to get JWT data from details if available
        if (results.details && results.details.jwt) {
            jwtData = results.details.jwt;
        }

        // If not in details, look for it in the validation summary
        if (!jwtData && results.validationSummary) {
            // Check each step for JWT data
            console.log('Checking validation summary for JWT data');
        }

        // Also check the original verification data stored in sessionStorage
        const originalData = sessionStorage.getItem('verificationData');
        if (originalData) {
            try {
                // The verification data might contain the JWT directly
                const parsedData = JSON.parse(originalData);
                if (typeof parsedData === 'string') {
                    // Try to parse as JWT
                    const jwtParts = parsedData.split('.');
                    if (jwtParts.length === 3) {
                        // Decode the payload (second part)
                        const payload = JSON.parse(atob(jwtParts[1]));
                        jwtData = { payload: payload };
                    }
                }
            } catch (e) {
                console.log('Could not parse verification data as JWT');
            }
        }

        // Extract PRC data from JWT
        if (jwtData && jwtData.payload) {
            // Try different possible locations for PRC data
            if (jwtData.payload.prc) {
                prcData = jwtData.payload.prc;
            } else if (jwtData.payload['-260'] && jwtData.payload['-260']['1']) {
                prcData = jwtData.payload['-260']['1'];
            } else if (jwtData.payload.hcert && jwtData.payload.hcert.v && jwtData.payload.hcert.v[0]) {
                prcData = jwtData.payload.hcert.v[0];
            } else {
                // Look for individual fields directly in payload
                prcData = {
                    fn: jwtData.payload.fn || jwtData.payload.lastName,
                    gn: jwtData.payload.gn || jwtData.payload.firstName,
                    dob: jwtData.payload.dob || jwtData.payload.birthDate,
                    pin: jwtData.payload.pin || jwtData.payload.personalId,
                    ims: jwtData.payload.ims || jwtData.payload.issuingState,
                    iid: jwtData.payload.iid || jwtData.payload.institutionId,
                    cid: jwtData.payload.cid || jwtData.payload.cardId,
                    vf: jwtData.payload.vf || jwtData.payload.validFrom,
                    vt: jwtData.payload.vt || jwtData.payload.validTo,
                    ed: jwtData.payload.ed || jwtData.payload.expiryDate
                };
            }
        }

        if (prcData) {
            displayPRCData(prcData);
        } else {
            console.log('Available data:', { results, jwtData });
            prcDataDisplay.innerHTML = '<div class="prc-data-error">PRC certificate data not found in verification results. Please check browser console for debugging information.</div>';
        }
    } catch (error) {
        console.error('Error parsing verification results:', error);
        prcDataDisplay.innerHTML = '<div class="prc-data-error">Error loading PRC data.</div>';
    }
}

function displayPRCData(prcData) {
    const prcDataDisplay = document.getElementById('prc-data-display');

    // Use the exact same mapping as the PDF generation
    const mappedData = {
        cardHolderName: prcData.fn || 'N/A',
        cardHolderGivenName: prcData.gn || 'N/A',
        dateOfBirth: prcData.dob || 'N/A',
        personalIdNumber: prcData.hi || 'N/A',
        issuingMemberState: prcData.ic || 'N/A',
        institutionId: prcData.ii || 'N/A',
        cardId: prcData.ci || 'N/A',
        validityStart: prcData.sd || 'N/A',
        validityEnd: prcData.ed || 'N/A',
        expiryDate: prcData.xd || 'N/A'
    };

    // Format the PRC data exactly like the email format
    const html = `
        <table class="prc-data-table">
            <tr><td class="prc-label">Name:</td><td class="prc-value">${mappedData.cardHolderName}</td></tr>
            <tr><td class="prc-label">Given Name:</td><td class="prc-value">${mappedData.cardHolderGivenName}</td></tr>
            <tr><td class="prc-label">Date of Birth:</td><td class="prc-value">${mappedData.dateOfBirth}</td></tr>
            <tr><td class="prc-label">Personal ID:</td><td class="prc-value">${mappedData.personalIdNumber}</td></tr>
            <tr><td class="prc-label">Issuing State:</td><td class="prc-value">${mappedData.issuingMemberState}</td></tr>
            <tr><td class="prc-label">Institution ID:</td><td class="prc-value">${mappedData.institutionId}</td></tr>
            <tr><td class="prc-label">Card ID:</td><td class="prc-value">${mappedData.cardId}</td></tr>
            <tr><td class="prc-label">Valid From:</td><td class="prc-value">${mappedData.validityStart}</td></tr>
            <tr><td class="prc-label">Valid To:</td><td class="prc-value">${mappedData.validityEnd}</td></tr>
            <tr><td class="prc-label">Expiry Date:</td><td class="prc-value">${mappedData.expiryDate}</td></tr>
        </table>
    `;

    prcDataDisplay.innerHTML = html;
}

// Handle continue button click
continueButton.addEventListener('click', function() {
    // Store identity verification data
    const verificationData = {
        identityVerified: identityCheckbox.checked,
        identitySkipped: !identityCheckbox.checked,
        verifiedAt: new Date().toISOString()
    };

    sessionStorage.setItem('identityVerification', JSON.stringify(verificationData));

    // Navigate to finalization page
    window.location.href = '/finalization';
});