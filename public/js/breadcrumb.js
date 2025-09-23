// Breadcrumb Management JavaScript

class BreadcrumbManager {
    constructor() {
        this.routeStepMap = {
            '/': 1,
            '/landing': 1,
            '/treatment-date': 2,
            '/identity-check': 3,
            '/scanner': 4,
            '/scan': 4,
            '/results': 5,
            '/finalization': 6
        };

        this.init();
    }

    init() {
        // Wait for DOM to be ready
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => this.setupBreadcrumb());
        } else {
            this.setupBreadcrumb();
        }
    }

    getCurrentStep() {
        const path = window.location.pathname;
        return this.routeStepMap[path] || 1;
    }

    setupBreadcrumb() {
        const breadcrumbNav = document.getElementById('breadcrumb-nav');
        if (!breadcrumbNav) return;

        const currentStep = this.getCurrentStep();
        const breadcrumbItems = breadcrumbNav.querySelectorAll('.breadcrumb-item');

        breadcrumbItems.forEach(item => {
            const step = parseInt(item.getAttribute('data-step'));
            const href = item.getAttribute('data-href');

            // Remove all existing classes
            item.classList.remove('active', 'completed', 'disabled');

            if (step < currentStep) {
                // Completed steps - make them clickable
                item.classList.add('completed');
                item.style.cursor = 'pointer';
                this.makeClickable(item, href);
            } else if (step === currentStep) {
                // Current step - active
                item.classList.add('active');
                item.style.cursor = 'default';
            } else {
                // Future steps - disabled
                item.classList.add('disabled');
                item.style.cursor = 'not-allowed';
            }
        });

        // Show all steps for complete workflow visibility
        this.showAllSteps();
    }

    makeClickable(item, href) {
        if (href) {
            item.addEventListener('click', (e) => {
                e.preventDefault();
                window.location.href = href;
            });
        }
    }

    showAllSteps() {
        const breadcrumbNav = document.getElementById('breadcrumb-nav');
        if (!breadcrumbNav) return;

        const allElements = breadcrumbNav.children;

        // Show all elements (steps and separators)
        for (let i = 0; i < allElements.length; i++) {
            const element = allElements[i];
            element.style.display = '';
        }
    }
}

// Initialize breadcrumb manager
const breadcrumbManager = new BreadcrumbManager();