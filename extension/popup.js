document.getElementById('capture-btn').addEventListener('click', async () => {
    const btn = document.getElementById('capture-btn');
    const statusEl = document.getElementById('status');
    const errorEl = document.getElementById('error');

    btn.disabled = true;
    btn.textContent = 'Processing...';
    statusEl.style.display = 'block';
    errorEl.style.display = 'none';

    try {
        // 1. Get the active tab
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (!tab || !tab.url) {
            throw new Error("Cannot determine active tab URL.");
        }

        // Ensure it's a valid web page (not a chrome:// page)
        if (!tab.url.startsWith('http')) {
            throw new Error("Can only capture HTTP/HTTPS pages.");
        }

        const url = new URL(tab.url);

        // 2. Fetch all cookies for the current domain
        const cookies = await chrome.cookies.getAll({ domain: url.hostname });

        // Format cookies for Puppeteer
        const formattedCookies = cookies.map(c => ({
            name: c.name,
            value: c.value,
            domain: c.domain,
            path: c.path || '/',
            secure: c.secure,
            httpOnly: c.httpOnly
        }));

        console.log(`Sending ${formattedCookies.length} cookies for ${url.hostname}`);

        // 3. Send payload to local docReaper API
        const response = await fetch('http://localhost:3000/convert', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                mode: 'url',
                url: tab.url,
                cookies: formattedCookies
            })
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.message || 'Server error during conversion.');
        }

        // 4. Handle the returned PDF Blob
        const blob = await response.blob();

        // Convert Blob to base64 Data URL so chrome.downloads can use it
        const reader = new FileReader();
        reader.onloadend = function () {
            const dataUrl = reader.result;
            const filename = url.hostname.replace(/\./g, '_') + '_capture.pdf';

            chrome.downloads.download({
                url: dataUrl,
                filename: filename,
                saveAs: true // Let the user choose exactly where to save it
            }, () => {
                statusEl.textContent = 'PDF downloaded successfully!';
                statusEl.style.color = '#10b981';
            });
        };
        reader.readAsDataURL(blob);

    } catch (error) {
        console.error("Capture Error:", error);
        statusEl.style.display = 'none';
        errorEl.style.display = 'block';
        errorEl.textContent = 'Error: ' + error.message;

        btn.disabled = false;
        btn.textContent = 'Capture to PDF';
    }
});
