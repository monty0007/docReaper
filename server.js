const express = require('express');
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
puppeteer.use(StealthPlugin());
const { PDFDocument } = require('pdf-lib');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Security Middleware: SSRF Guard
const isSafeUrl = (urlStr) => {
    try {
        const url = new URL(urlStr);
        const blockedHosts = ['localhost', '127.0.0.1', '0.0.0.0', '::1'];
        if (blockedHosts.includes(url.hostname)) return false;

        // Block internal IP ranges
        const ipPattern = /^(10\.|192\.168\.|172\.(1[6-9]|2[0-9]|3[0-1])\.|169\.254\.)/;
        if (ipPattern.test(url.hostname)) return false;

        return url.protocol === 'http:' || url.protocol === 'https:';
    } catch (e) {
        return false;
    }
};

app.use(cors()); // Enable CORS for Vercel/Decoupled hosting
app.use(express.json({ limit: '20mb' }));
app.use(express.static('public'));

const landscapeStyles = `
    @page {
        size: 1280px 720px;
        margin: 0;
    }
    
    /* 1. Shatter SPA 100vh scrolling locks to allow absolute full height capture */
    html, body, #root, #__next, #app, main, .notion-app-inner {
        height: auto !important;
        min-height: auto !important;
        max-height: none !important;
        overflow: visible !important;
        position: static !important;
    }

    /* 2. Prevent PDF rendering engine from slicing elements in half across pages */
    p, img, h1, h2, h3, h4, h5, h6, li, table, pre, code, blockquote, .notion-block {
        page-break-inside: avoid !important;
        break-inside: avoid !important;
    }
    
    /* Ensure images don't randomly distort when breaking */
    img {
        max-width: 100% !important;
        object-fit: contain !important;
    }
`;

app.post('/convert', async (req, res) => {
    const { mode, htmlContent } = req.body;
    let browser;

    try {
        browser = await puppeteer.launch({
            args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
        });

        if (mode === 'html') {
            const slides = htmlContent
                .split(/<\/html>/i)
                .map(s => s.trim())
                .filter(s => s.length > 0)
                .map(s => s + '</html>');

            if (slides.length === 0) throw new Error('No valid HTML content found.');

            const pdfBuffers = [];

            for (const slideHtml of slides) {
                const page = await browser.newPage();
                await page.setViewport({ width: 1280, height: 720 });
                await page.setContent(slideHtml, { waitUntil: 'networkidle0', timeout: 30000 });
                await page.addStyleTag({ content: landscapeStyles });

                const buffer = await page.pdf({
                    printBackground: true,
                    width: '1280px',
                    height: '720px',
                    landscape: true
                });
                pdfBuffers.push(buffer);
                await page.close();
            }

            let finalPdfBuffer;
            if (pdfBuffers.length === 1) {
                finalPdfBuffer = pdfBuffers[0];
            } else {
                const mergedPdf = await PDFDocument.create();
                for (const buffer of pdfBuffers) {
                    const pdf = await PDFDocument.load(buffer);
                    const copiedPages = await mergedPdf.copyPages(pdf, pdf.getPageIndices());
                    copiedPages.forEach((page) => mergedPdf.addPage(page));
                }
                finalPdfBuffer = await mergedPdf.save();
            }

            res.setHeader('Content-Type', 'application/pdf');
            res.setHeader('Content-Disposition', `attachment; filename="${slides.length > 1 ? 'presentation.pdf' : 'slide.pdf'}"`);
            res.send(Buffer.from(finalPdfBuffer));

        } else if (mode === 'url') {
            const { url, cookies } = req.body;
            if (!url || !isSafeUrl(url)) {
                throw new Error('Invalid or forbidden URL provided.');
            }

            const page = await browser.newPage();
            await page.setViewport({ width: 1280, height: 720 });
            await page.emulateMediaType('screen'); // CRITICAL: Force the website to render exactly as it does on a monitor, ignoring native print CSS.

            // Handle Cookie Injection
            if (cookies && Array.isArray(cookies) && cookies.length > 0) {
                const targetDomain = new URL(url).hostname;
                const formattedCookies = cookies.map(cookie => {
                    // Puppeteer requires 'domain' or 'url' to be set when injecting cookies
                    if (!cookie.domain && !cookie.url) {
                        return { ...cookie, domain: targetDomain };
                    }
                    return cookie;
                });
                await page.setCookie(...formattedCookies);
                console.log(`Injected ${formattedCookies.length} cookies for ${targetDomain}`);
            }

            // Navigate to the URL
            await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 });

            // Wait for potential Cloudflare "Verify you are human" challenge to pass
            await new Promise(resolve => setTimeout(resolve, 8000));

            // DOM Cleanup: Brutally remove annoying popups, banners, and sticky headers
            await page.evaluate(() => {
                // 1. Remove by common annoying class/id names
                const annoyingSelectors = [
                    '[id*="cookie"]', '[class*="cookie"]', '#cc-main', '.fc-consent-root',
                    '[id*="banner"]', '[class*="banner"]',
                    '[role="dialog"]', '.modal', '[class*="modal-"]',
                    '[id*="popup"]', '[class*="popup"]',
                    'header', 'nav' // Sticky headers repeat on every PDF segment, so we kill them
                ];

                annoyingSelectors.forEach(selector => {
                    document.querySelectorAll(selector).forEach(el => {
                        try { el.remove(); } catch (e) { }
                    });
                });

                // 2. Hunt down and remove ANY fixed/sticky elements (like floating chat heads or bottom ribbons)
                document.querySelectorAll('*').forEach(el => {
                    const style = window.getComputedStyle(el);
                    if (style.position === 'fixed' || style.position === 'sticky') {
                        // Only remove if it's literally floating over the page
                        if (style.display !== 'none') {
                            try { el.remove(); } catch (e) { }
                        }
                    }
                });

                // 3. Reset body overflow in case a modal locked the scroll
                document.body.style.overflow = 'visible';
                document.documentElement.style.overflow = 'visible';
            });

            await page.addStyleTag({ content: landscapeStyles });

            // 1. Force scroll to the bottom to trigger all lazy-loaded images and content
            await page.evaluate(async () => {
                await new Promise((resolve) => {
                    let totalHeight = 0;
                    const distance = 400; // Scroll roughly half a viewport at a time
                    const timer = setInterval(() => {
                        // find the tallest scrollable container
                        const scrollHeight = Math.max(
                            document.body.scrollHeight,
                            document.documentElement.scrollHeight,
                            document.querySelector('#root')?.scrollHeight || 0,
                            document.querySelector('#__next')?.scrollHeight || 0,
                            document.querySelector('.notion-app-inner')?.scrollHeight || 0
                        );
                        window.scrollBy(0, distance);

                        // Try to scroll inner containers if body doesn't scroll
                        const innerScrollers = document.querySelectorAll('.notion-scroller, [style*="overflow: auto"], [style*="overflow-y: auto"], [style*="overflow: scroll"], [style*="overflow-y: scroll"]');
                        innerScrollers.forEach(el => el.scrollBy(0, distance));

                        totalHeight += distance;

                        if (totalHeight >= scrollHeight) {
                            clearInterval(timer);
                            resolve();
                        }
                    }, 100); // 100ms between scrolls
                });
            });

            // 2. Scroll back to the top
            await page.evaluate(() => {
                window.scrollTo(0, 0);
                const innerScrollers = document.querySelectorAll('.notion-scroller, [style*="overflow: auto"], [style*="overflow-y: auto"], [style*="overflow: scroll"], [style*="overflow-y: scroll"]');
                innerScrollers.forEach(el => el.scrollTo(0, 0));
            });
            await new Promise(resolve => setTimeout(resolve, 1000));

            // 3. Calculate True Height
            const totalHeight = await page.evaluate(() => {
                return Math.max(
                    document.body.scrollHeight,
                    document.documentElement.scrollHeight,
                    document.querySelector('#root')?.scrollHeight || 0,
                    document.querySelector('#__next')?.scrollHeight || 0,
                    document.querySelector('.notion-app-inner')?.scrollHeight || 0
                );
            });

            const viewportHeight = 720;
            const totalPages = Math.ceil(totalHeight / viewportHeight) || 1;

            console.log(`Calculated height: ${totalHeight}px. Capturing ${totalPages} image segments...`);

            const mergedPdf = await PDFDocument.create();

            // 4. Iterate and capture exact 16:9 segment screens
            for (let i = 0; i < totalPages; i++) {
                // Scroll main window AND any internal scrollers
                await page.evaluate((y) => {
                    window.scrollTo(0, y);
                    const innerScrollers = document.querySelectorAll('.notion-scroller, [style*="overflow: auto"], [style*="overflow-y: auto"], [style*="overflow: scroll"], [style*="overflow-y: scroll"]');
                    innerScrollers.forEach(el => el.scrollTo(0, y));
                }, i * viewportHeight);

                // Wait for any lazy-loaded content or floating headers to adjust
                await new Promise(resolve => setTimeout(resolve, 800));

                // Capture exact viewport as an image (guarantees 100% UI match)
                const imageBuffer = await page.screenshot({
                    type: 'jpeg',
                    quality: 95,
                    clip: {
                        x: 0,
                        y: i * viewportHeight,
                        width: 1280,
                        height: 720
                    }
                });

                // Embed the image into the PDF as a new slide
                const img = await mergedPdf.embedJpg(imageBuffer);
                const pdfPage = mergedPdf.addPage([1280, 720]);
                pdfPage.drawImage(img, {
                    x: 0,
                    y: 0,
                    width: 1280,
                    height: 720,
                });
            }

            // 5. Build final PDF buffer
            const finalPdfBuffer = await mergedPdf.save();

            const filename = new URL(url).hostname.replace(/\./g, '_') + '.pdf';
            res.setHeader('Content-Type', 'application/pdf');
            res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
            res.send(Buffer.from(finalPdfBuffer));
        } else {
            throw new Error('Invalid mode. Use "html" or "url".');
        }

    } catch (error) {
        console.error('Conversion Error:', error);
        res.status(500).json({ status: 'error', message: error.message });
    } finally {
        if (browser) await browser.close();
    }
});

app.listen(PORT, () => {
    console.log(`docReaper Core running on http://localhost:${PORT}`);
});
