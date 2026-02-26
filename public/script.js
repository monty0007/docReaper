document.addEventListener('DOMContentLoaded', () => {
    // Config for Vercel Deployment
    const CONFIG = {
        API_BASE_URL: '' // Set to 'https://docreaper.maoverse.xyz' for production
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

            // URL Mode returns JSON (Review Studio array)
            // HTML Mode still returns raw PDF Blob
            const contentType = response.headers.get('content-type');

            if (contentType && contentType.includes('application/json')) {
                const data = await response.json();
                if (data.status === 'success' && data.mode === 'review') {
                    openReviewStudio(data.images, data.filename);
                    showToast('Images captured! Adjust crop lines below.', 'success');
                } else {
                    throw new Error(data.message || 'Unknown JSON error');
                }
            } else {
                // Legacy HTML Mode - direct PDF download
                const blob = await response.blob();
                const url = window.URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.style.display = 'none';
                a.href = url;

                const contentDisposition = response.headers.get('Content-Disposition');
                let filename = 'presentation.pdf';

                if (contentDisposition) {
                    const match = contentDisposition.match(/filename="(.+)"/);
                    if (match && match[1]) filename = match[1].replace(/filename\s*=\s*/, '').replace(/"/g, '');
                }

                a.download = filename;
                document.body.appendChild(a);
                a.click();
                window.URL.revokeObjectURL(url);

                showToast('Success! Your HTML presentation is ready. ✨', 'success');
            }

        } catch (error) {
            console.error('Error:', error);
            showToast(error.message || 'An error occurred during conversion.', 'error');
        } finally {
            convertBtn.classList.remove('loading');
            validateInputs();
        }
    });

    // --- Review Studio UI Logic ---
    let currentReviewImages = [];
    let currentFilename = '';
    const reviewStudio = document.getElementById('review-studio');
    const mainCard = document.querySelector('main.card');
    const gallery = document.getElementById('review-gallery');
    const buildBtn = document.getElementById('build-pdf-btn');

    function openReviewStudio(images, filename) {
        currentReviewImages = images;
        currentFilename = filename;

        // Swap UI
        mainCard.classList.add('hidden');
        document.querySelector('.tabs').classList.add('hidden');
        reviewStudio.classList.remove('hidden');

        renderGallery();
    }

    function renderGallery() {
        gallery.innerHTML = ''; // Clear previous

        currentReviewImages.forEach((imgSrc, index) => {
            const container = document.createElement('div');
            container.className = 'page-container';

            // The uncropped image
            const img = document.createElement('img');
            img.src = imgSrc;
            container.appendChild(img);

            // Don't add a crop handle to the very last image
            if (index < currentReviewImages.length - 1) {
                // The dark overlay representing the cropped-out bottom part
                const overlay = document.createElement('div');
                overlay.className = 'crop-overlay';

                // The draggable handle
                const handle = document.createElement('div');
                handle.className = 'crop-handle';
                handle.innerHTML = '<div class="crop-line"></div>';

                // Store crop percentage on the container
                container.dataset.cropPercent = "100"; // 100% visible by default

                // Drag Logic
                let isDragging = false;

                handle.addEventListener('mousedown', (e) => {
                    isDragging = true;
                    e.preventDefault(); // prevent text selection
                });

                window.addEventListener('mousemove', (e) => {
                    if (!isDragging) return;

                    const rect = container.getBoundingClientRect();
                    // Calculate Y relative to the container
                    const yInside = e.clientY - rect.top;

                    // Clamp between 20% and 100% of the image height
                    const minHeight = rect.height * 0.2;
                    const cleanY = Math.max(minHeight, Math.min(yInside, rect.height));

                    const percentVisible = (cleanY / rect.height) * 100;

                    // The handle stays at the exact pixel
                    handle.style.bottom = `calc(${100 - percentVisible}%)`;
                    // The overlay covers everything below the handle
                    overlay.style.clipPath = `inset(${percentVisible}% 0 0 0)`;

                    container.dataset.cropPercent = percentVisible.toString();
                });

                window.addEventListener('mouseup', () => {
                    isDragging = false;
                });

                container.appendChild(overlay);
                container.appendChild(handle);
            } else {
                container.dataset.cropPercent = "100";
            }

            const num = document.createElement('div');
            num.className = 'page-number';
            num.innerText = `${index + 1}`;
            container.appendChild(num);

            gallery.appendChild(container);
        });
    }

    buildBtn.addEventListener('click', async () => {
        buildBtn.disabled = true;
        buildBtn.classList.add('loading');
        showToast('Stitching cropped pages together...', 'info');

        try {
            const containers = document.querySelectorAll('.page-container');
            const croppedImagesBase64 = [];

            for (const container of containers) {
                const img = container.querySelector('img');
                const percent = parseFloat(container.dataset.cropPercent || "100");

                // If it's 100%, we don't strictly need to crop, but we do it anyway to strip the 'data:' prefix if needed
                // and to guarantee format consistency.

                const canvas = document.createElement('canvas');
                const ctx = canvas.getContext('2d');

                // Original intrinsic dimensions
                const natWidth = img.naturalWidth;
                const natHeight = img.naturalHeight;

                // Cropped height
                const cropHeight = natHeight * (percent / 100);

                canvas.width = natWidth;
                canvas.height = cropHeight;

                // Draw only the top portion of the image up to cropHeight
                ctx.drawImage(img, 0, 0, natWidth, cropHeight, 0, 0, natWidth, cropHeight);

                const newBase64 = canvas.toDataURL('image/jpeg', 0.95);
                croppedImagesBase64.push(newBase64);
            }

            const endpoint = CONFIG.API_BASE_URL ? `${CONFIG.API_BASE_URL}/build-pdf` : '/build-pdf';
            const response = await fetch(endpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    images: croppedImagesBase64,
                    filename: currentFilename
                })
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(errorData.message || 'PDF build failed');
            }

            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.style.display = 'none';
            a.href = url;
            a.download = currentFilename || 'presentation.pdf';
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(url);

            showToast('Success! Your perfectly cropped PDF is ready. ✨', 'success');

            // Return to main layout
            reviewStudio.classList.add('hidden');
            mainCard.classList.remove('hidden');
            document.querySelector('.tabs').classList.remove('hidden');

        } catch (error) {
            console.error('Build Error:', error);
            showToast(error.message || 'Failed to build PDF.', 'error');
        } finally {
            buildBtn.classList.remove('loading');
            buildBtn.disabled = false;
        }
    });

    validateInputs();

    // --- Modal Logic ---
    const installModal = document.getElementById('install-modal');
    const instructionsBtn = document.getElementById('instructions-btn');
    const closeModalBtn = document.getElementById('close-modal-btn');

    if (instructionsBtn && installModal && closeModalBtn) {
        instructionsBtn.addEventListener('click', () => {
            installModal.classList.remove('hidden');
        });

        closeModalBtn.addEventListener('click', () => {
            installModal.classList.add('hidden');
        });

        installModal.addEventListener('click', (e) => {
            if (e.target === installModal) {
                installModal.classList.add('hidden');
            }
        });
    }
});
