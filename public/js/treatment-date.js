// Treatment Date Page JavaScript
// Set date range: 1900-01-01 to today (inclusive)
const today = new Date();
const minDate = new Date('1900-01-01');

// Format dates to YYYY-MM-DD
const todayStr = today.toISOString().split('T')[0];
const minDateStr = '1900-01-01';

const dateInput = document.getElementById('treatmentDate');
dateInput.min = minDateStr;
dateInput.max = todayStr;

// Set default value to today
dateInput.value = todayStr;

// Add mobile-specific attributes for better UX
if (/iPhone|iPad|iPod|Android/i.test(navigator.userAgent)) {
    dateInput.setAttribute('autocomplete', 'off');
    dateInput.setAttribute('inputmode', 'none'); // Prevents keyboard, shows date picker
}

const dateOverlay = document.getElementById('dateOverlay');

// Update overlay visibility based on date input
function updateOverlay() {
    if (dateInput.value) {
        dateOverlay.style.display = 'none';
    } else {
        dateOverlay.style.display = 'block';
    }
}

// Initial overlay state
updateOverlay();

// Listen for date input changes
dateInput.addEventListener('input', updateOverlay);
dateInput.addEventListener('change', updateOverlay);

// Add date validation
function validateDate(dateStr) {
    const date = new Date(dateStr);
    const min = new Date(minDateStr);
    const max = new Date(todayStr);

    // Check if date is valid
    if (isNaN(date.getTime())) {
        return false;
    }

    // Check if date is within allowed range
    return date >= min && date <= max;
}

// Add visual feedback for date validation
dateInput.addEventListener('change', function() {
    if (this.value && !validateDate(this.value)) {
        this.setCustomValidity('Please select a date between January 1, 1900 and today');
        this.classList.add('error');

        // Show a user-friendly message
        const helpText = this.closest('.form-group').querySelector('.input-help span:last-child');
        if (helpText) {
            helpText.textContent = '⚠️ Date must be between January 1, 1900 and today';
            helpText.style.color = '#e53e3e';
        }
    } else {
        this.setCustomValidity('');
        this.classList.remove('error');

        // Restore original help text
        const helpText = this.closest('.form-group').querySelector('.input-help span:last-child');
        if (helpText) {
            helpText.textContent = 'Defaults to today. Select any date from January 1, 1900 to today';
            helpText.style.color = '';
        }
    }
});

// Handle form submission
document.getElementById('treatmentDateForm').addEventListener('submit', function(e) {
    e.preventDefault();

    // Ensure treatment date has a value (default to today if empty)
    let treatmentDate = document.getElementById('treatmentDate').value;
    if (!treatmentDate) {
        treatmentDate = todayStr;
        document.getElementById('treatmentDate').value = todayStr;
    }

    // Validate date before submission
    if (!validateDate(treatmentDate)) {
        alert('Please select a valid date between January 1, 1900 and today');
        return;
    }

    // Store form data in sessionStorage
    const formData = {
        treatmentDate: treatmentDate,
        notes: document.getElementById('notes').value || '', // Default to empty string
        timestamp: new Date().toISOString()
    };

    sessionStorage.setItem('treatmentData', JSON.stringify(formData));

    // Navigate to scanner page
    window.location.href = '/scanner';
});