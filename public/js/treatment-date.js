// Treatment Date Page JavaScript
// Set date range: today to 30 days in the future
const today = new Date();
const maxDate = new Date();
maxDate.setDate(today.getDate() + 30);

const todayStr = today.toISOString().split('T')[0];
const maxDateStr = maxDate.toISOString().split('T')[0];

const dateInput = document.getElementById('treatmentDate');
dateInput.min = todayStr;
dateInput.max = maxDateStr;

// Set default value to today
dateInput.value = todayStr;

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

// Handle form submission
document.getElementById('treatmentDateForm').addEventListener('submit', function(e) {
    e.preventDefault();

    // Ensure treatment date has a value (default to today if empty)
    let treatmentDate = document.getElementById('treatmentDate').value;
    if (!treatmentDate) {
        treatmentDate = todayStr;
        document.getElementById('treatmentDate').value = todayStr;
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