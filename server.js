const express = require('express');
const puppeteer = require('puppeteer');
const { PDFDocument } = require('pdf-lib');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Increase limit to accommodate large HTML inputs up to 10MB
app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// Security: Check if a URL might resolve to an internal IP (basic SSRF protection)
function isSafeUrl(urlStr) {
    try {
        const parsedUrl = new URL(urlStr);
        const hostname = parsedUrl.hostname;

        // Block internal/local hostnames
        if (
            hostname === 'localhost' ||
            hostname === '127.0.0.1' ||
            hostname === '::1' ||
            hostname.startsWith('192.168.') ||
            hostname.startsWith('10.') ||
            hostname.match(/^172\.(1[6-9]|2[0-9]|3[0-1])\./) ||
            hostname.match(/^169\.254\./)
        ) {
            return false;
        }

        if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
            return false;
        }

        return true;
    } catch (e) {
        return false;
    }
}

app.post('/convert', async (req, res) => {
    const { mode, htmlContent, url } = req.body;

    if (!mode || (mode !== 'html' && mode !== 'url')) {
        return res.status(400).json({ status: 'error', message: 'Invalid mode.' });
    }

    if (mode === 'html' && !htmlContent) {
        return res.status(400).json({ status: 'error', message: 'Missing htmlContent.' });
    }

    if (mode === 'url' && (!url || !isSafeUrl(url))) {
        return res.status(400).json({ status: 'error', message: 'Invalid URL.' });
    }

    let browser = null;
    try {
        browser = await puppeteer.launch({
            headless: 'new',
            args: ['--no-sandbox', '--disable-setuid-sandbox']
        });

        // 16:9 Landscape CSS to inject into every slide
        const landscapeStyles = `
            @page {
                size: 1280px 720px;
                margin: 0;
            }
            body {
                margin: 0;
                padding: 0;
                width: 1280px;
                height: 720px;
                overflow: hidden;
            }
        `;

        if (mode === 'url') {
            const page = await browser.newPage();
            await page.setViewport({ width: 1280, height: 720 });
            await page.goto(url, { waitUntil: 'networkidle0', timeout: 30000 });
            await page.addStyleTag({ content: landscapeStyles });

            const pdfBuffer = await page.pdf({
                printBackground: true,
                width: '1280px',
                height: '720px',
                landscape: true
            });

            await browser.close();
            res.setHeader('Content-Type', 'application/pdf');
            res.setHeader('Content-Disposition', 'attachment; filename="webpage.pdf"');
            return res.send(Buffer.from(pdfBuffer));
        }

        // HTML Mode: Split into individual slides
        // We look for <html> or similar structure, or just take the whole thing if it's one.
        // A simple way to handle multiple full documents is to split by </html> and trim.
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

            // Set content and wait for it to load
            await page.setContent(slideHtml, { waitUntil: 'networkidle0', timeout: 15000 });

            // Force landscape styling to avoid portrait shifts
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

        await browser.close();
        browser = null;

        let finalPdfBuffer;

        if (pdfBuffers.length === 1) {
            finalPdfBuffer = pdfBuffers[0];
        } else {
            // Merge multiple PDFs using pdf-lib
            const mergedPdf = await PDFDocument.create();
            for (const buffer of pdfBuffers) {
                const pdf = await PDFDocument.load(buffer);
                const copiedPages = await mergedPdf.copyPages(pdf, pdf.getPageIndices());
                copiedPages.forEach((page) => mergedPdf.addPage(page));
            }
            finalPdfBuffer = await mergedPdf.save();
        }

        const filename = slides.length > 1 ? 'presentation.pdf' : 'slide.pdf';
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        return res.send(Buffer.from(finalPdfBuffer));

    } catch (error) {
        console.error('Conversion error:', error);
        if (browser) await browser.close().catch(() => { });
        return res.status(500).json({ status: 'error', message: 'Unable to render PDF' });
    }
});

app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});
