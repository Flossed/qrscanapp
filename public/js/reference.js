// Reference management for history page
document.addEventListener('DOMContentLoaded', () => {
    const referenceInput = document.getElementById('reference-input');
    const setReferenceButton = document.getElementById('set-reference');
    const clearReferenceButton = document.getElementById('clear-reference');
    const referenceStatus = document.getElementById('reference-status');

    if (!referenceInput || !setReferenceButton || !clearReferenceButton || !referenceStatus) {
        return; // Elements not found, probably not on history page
    }

    loadReference();

    // Reference management
    setReferenceButton.addEventListener('click', async () => {
        const content = referenceInput.value.trim();
        if (!content) {
            showMessage('Please enter reference content', 'error');
            return;
        }

        try {
            const response = await fetch('/api/reference', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ content })
            });

            if (response.ok) {
                showMessage('Reference set successfully!', 'success');
                loadReference();
            } else {
                showMessage('Error setting reference', 'error');
            }
        } catch (error) {
            showMessage('Error setting reference', 'error');
        }
    });

    clearReferenceButton.addEventListener('click', async () => {
        try {
            const response = await fetch('/api/reference', {
                method: 'DELETE'
            });

            if (response.ok) {
                referenceInput.value = '';
                showMessage('Reference cleared', 'success');
                loadReference();
            } else {
                showMessage('Error clearing reference', 'error');
            }
        } catch (error) {
            showMessage('Error clearing reference', 'error');
        }
    });

    async function loadReference() {
        try {
            const response = await fetch('/api/reference');
            if (response.ok) {
                const reference = await response.json();
                if (reference) {
                    referenceInput.value = reference.content;
                    referenceStatus.textContent = `✅ Reference active: ${reference.content.substring(0, 50)}${reference.content.length > 50 ? '...' : ''}`;
                    referenceStatus.className = 'reference-status active';
                } else {
                    referenceStatus.textContent = '❌ No reference set';
                    referenceStatus.className = 'reference-status empty';
                }
            }
        } catch (error) {
            console.error('Error loading reference:', error);
        }
    }

    function showMessage(text, type) {
        // Create or update message element
        let messageDiv = document.getElementById('message');
        if (!messageDiv) {
            messageDiv = document.createElement('div');
            messageDiv.id = 'message';
            messageDiv.className = 'message';
            referenceStatus.parentNode.appendChild(messageDiv);
        }

        messageDiv.textContent = text;
        messageDiv.className = `message ${type}`;
        messageDiv.style.display = 'block';

        setTimeout(() => {
            messageDiv.style.display = 'none';
        }, 3000);
    }
});