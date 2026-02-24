document.addEventListener('DOMContentLoaded', () => {
    const tabBtns = document.querySelectorAll('.tab-btn');
    const tabContents = document.querySelectorAll('.tab-content');
    const convertBtn = document.getElementById('convert-btn');
    const htmlInput = document.getElementById('html-input');
    const urlInput = document.getElementById('url-input');
    const toastContainer = document.getElementById('toast-container');

    let activeMode = 'html';

    // Monitoring inputs for button state
    const validateInputs = () => {
        const value = activeMode === 'html' ? htmlInput.value.trim() : urlInput.value.trim();
        convertBtn.disabled = !value;
    };

    htmlInput.addEventListener('input', validateInputs);
    urlInput.addEventListener('input', validateInputs);

    // Tab Switching Logic
    tabBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const mode = btn.dataset.tab.split('-')[0];
            activeMode = mode;

            // Update Buttons
            tabBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');

            // Update Content
            tabContents.forEach(content => {
                content.classList.remove('active');
                if (content.id === `${mode}-mode`) {
                    content.classList.add('active');
                }
            });

            validateInputs();
        });
    });

    // Toast Logic
    function showToast(message, type = 'info') {
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        toast.innerHTML = `<span>${message}</span>`;
        toastContainer.appendChild(toast);

        // Auto remove after 5s
        setTimeout(() => {
            toast.classList.add('toast-exit');
            setTimeout(() => toast.remove(), 300);
        }, 5000);
    }

    // Conversion Logic
    convertBtn.addEventListener('click', async () => {
        const payload = { mode: activeMode };

        if (activeMode === 'html') {
            payload.htmlContent = htmlInput.value.trim();
        } else {
            payload.url = urlInput.value.trim();
            if (!payload.url.startsWith('http')) {
                payload.url = 'https://' + payload.url;
            }
        }

        // UI State: Loading
        convertBtn.disabled = true;
        convertBtn.classList.add('loading');
        showToast('Processing your request... 🚀', 'info');

        try {
            const response = await fetch('/convert', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(errorData.message || 'Conversion failed');
            }

            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.style.display = 'none';
            a.href = url;

            const contentDisposition = response.headers.get('Content-Disposition');
            let filename = activeMode === 'html' ? 'presentation.pdf' : 'webpage.pdf';

            if (contentDisposition) {
                const match = contentDisposition.match(/filename="(.+)"/);
                if (match && match[1]) filename = match[1];
            }

            a.download = filename;
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(url);

            showToast('Success! Your PDF is downloading.', 'success');
        } catch (error) {
            console.error('Error:', error);
            showToast(error.message || 'An error occurred during conversion.', 'error');
        } finally {
            convertBtn.classList.remove('loading');
            validateInputs();
        }
    });

    // Initial validation
    validateInputs();
});
