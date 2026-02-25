document.addEventListener('DOMContentLoaded', () => {
    // Config for Vercel Deployment
    const CONFIG = {
        API_BASE_URL: '' // Leave empty for same-origin, or set to your backend URL
    };

    const tabBtns = document.querySelectorAll('.tab-btn');
    const tabContents = document.querySelectorAll('.tab-content');

    const convertBtn = document.getElementById('convert-btn');
    const htmlInput = document.getElementById('html-input');
    const urlInput = document.getElementById('url-input');
    const cookieInput = document.getElementById('cookie-input');
    const toastContainer = document.getElementById('toast-container');

    let activeMode = 'html';

    // Monitoring inputs for button state
    const validateInputs = () => {
        const value = activeMode === 'html' ? htmlInput.value.trim() : urlInput.value.trim();
        convertBtn.disabled = !value;
    };

    [htmlInput, urlInput].forEach(input => {
        input.addEventListener('input', validateInputs);
    });

    // Main Tab Switching (HTML Slides vs Full Page)
    tabBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            activeMode = btn.dataset.tab.split('-')[0];
            tabBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            tabContents.forEach(c => c.classList.remove('active'));
            document.getElementById(`${activeMode}-mode`).classList.add('active');
            validateInputs();
        });
    });

    // Toast Logic
    function showToast(message, type = 'info') {
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        toast.innerHTML = `<span>${message}</span>`;
        toastContainer.appendChild(toast);
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
            payload.mode = 'url';
            let formattedUrl = urlInput.value.trim();
            if (!formattedUrl.startsWith('http')) {
                formattedUrl = 'https://' + formattedUrl;
            }
            payload.url = formattedUrl;

            // Handle Cookies
            const cookieVal = cookieInput.value.trim();
            if (cookieVal) {
                try {
                    payload.cookies = JSON.parse(cookieVal);
                } catch (e) {
                    showToast('Invalid Cookie JSON format.', 'error');
                    return; // Halt conversion
                }
            }
        }

        convertBtn.disabled = true;
        convertBtn.classList.add('loading');
        showToast('Killing pixels to bring you a PDF... 💀', 'info');

        try {
            const endpoint = CONFIG.API_BASE_URL ? `${CONFIG.API_BASE_URL}/convert` : '/convert';
            const response = await fetch(endpoint, {
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
                if (match && match[1]) filename = match[1].replace(/filename\s*=\s*/, '').replace(/"/g, '');
            }

            a.download = filename;
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(url);

            showToast('Success! Your soul... I mean PDF is ready. ✨', 'success');
        } catch (error) {
            console.error('Error:', error);
            showToast(error.message || 'An error occurred during conversion.', 'error');
        } finally {
            convertBtn.classList.remove('loading');
            validateInputs();
        }
    });

    validateInputs();
});
