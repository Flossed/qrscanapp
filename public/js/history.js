document.addEventListener('DOMContentLoaded', () => {
    const copyButtons = document.querySelectorAll('.btn-copy');
    const deleteButtons = document.querySelectorAll('.btn-danger');
    const verifyButtons = document.querySelectorAll('.btn-verify');

    copyButtons.forEach(button => {
        button.addEventListener('click', (e) => {
            const content = e.target.dataset.content;
            navigator.clipboard.writeText(content).then(() => {
                const originalText = e.target.textContent;
                e.target.textContent = 'Copied!';
                e.target.classList.add('copied');
                setTimeout(() => {
                    e.target.textContent = originalText;
                    e.target.classList.remove('copied');
                }, 2000);
            }).catch(err => {
                console.error('Error copying text:', err);
            });
        });
    });

    deleteButtons.forEach(button => {
        button.addEventListener('click', async (e) => {
            if (!confirm('Are you sure you want to delete this scan?')) {
                return;
            }

            const scanId = e.target.dataset.id;
            try {
                const response = await fetch(`/api/scans/${scanId}`, {
                    method: 'DELETE'
                });

                if (response.ok) {
                    const scanItem = e.target.closest('.scan-item');
                    scanItem.style.opacity = '0';
                    setTimeout(() => {
                        scanItem.remove();
                        const remainingItems = document.querySelectorAll('.scan-item');
                        if (remainingItems.length === 0) {
                            window.location.reload();
                        }
                    }, 300);
                } else {
                    alert('Error deleting scan');
                }
            } catch (error) {
                console.error('Error deleting scan:', error);
                alert('Error deleting scan');
            }
        });
    });

    verifyButtons.forEach(button => {
        button.addEventListener('click', (e) => {
            const content = e.target.dataset.content;

            // Store data in sessionStorage and navigate to verification page
            sessionStorage.setItem('verificationData', content);
            window.location.href = '/verify';
        });
    });
});