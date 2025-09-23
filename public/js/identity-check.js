// Identity Check Page JavaScript
// Enable continue button only when all checkboxes are checked
const checkboxes = document.querySelectorAll('input[name="verification"]');
const continueButton = document.getElementById('continueToScanning');

function updateButtonState() {
    const allChecked = Array.from(checkboxes).every(checkbox => checkbox.checked);
    continueButton.disabled = !allChecked;
}

checkboxes.forEach(checkbox => {
    checkbox.addEventListener('change', updateButtonState);
});

// Set initial button state
updateButtonState();

// Handle continue button click
continueButton.addEventListener('click', function() {
    // Store identity verification data
    const verificationData = {
        nameMatch: document.getElementById('nameMatch').checked,
        firstnameMatch: document.getElementById('firstnameMatch').checked,
        dobMatch: document.getElementById('dobMatch').checked,
        copyMade: document.getElementById('copyMade').checked,
        verifiedAt: new Date().toISOString()
    };

    sessionStorage.setItem('identityVerification', JSON.stringify(verificationData));

    // Navigate to scanner page
    window.location.href = '/scanner';
});