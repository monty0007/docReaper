const express = require('express');
const puppeteer = require('puppeteer-core');
const { addExtra } = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const puppeteerExtra = addExtra(puppeteer);

// 🆕 FIX: Bypassing dynamic stealth loading (Fixes "Cannot find module" on Vercel/Local)
// We register each evasion individually to ensure they are properly bundled and loaded.
const stealthEvasions = [
    require('puppeteer-extra-plugin-stealth/evasions/chrome.app'),
    require('puppeteer-extra-plugin-stealth/evasions/chrome.csi'),
    require('puppeteer-extra-plugin-stealth/evasions/chrome.loadTimes'),
    require('puppeteer-extra-plugin-stealth/evasions/chrome.runtime'),
    require('puppeteer-extra-plugin-stealth/evasions/defaultArgs'),
    require('puppeteer-extra-plugin-stealth/evasions/iframe.contentWindow'),
    require('puppeteer-extra-plugin-stealth/evasions/media.codecs'),
    require('puppeteer-extra-plugin-stealth/evasions/navigator.hardwareConcurrency'),
    require('puppeteer-extra-plugin-stealth/evasions/navigator.languages'),
    require('puppeteer-extra-plugin-stealth/evasions/navigator.permissions'),
    require('puppeteer-extra-plugin-stealth/evasions/navigator.plugins'),
    require('puppeteer-extra-plugin-stealth/evasions/navigator.webdriver'),
    require('puppeteer-extra-plugin-stealth/evasions/sourceurl'),
    require('puppeteer-extra-plugin-stealth/evasions/user-agent-override'),
    require('puppeteer-extra-plugin-stealth/evasions/webgl.vendor'),
    require('puppeteer-extra-plugin-stealth/evasions/window.outerdimensions'),
];

stealthEvasions.forEach(evasion => puppeteerExtra.use(evasion()));

const chromium = require('@sparticuz/chromium');
const { PDFDocument } = require('pdf-lib');
const JSZip = require('jszip');
const cors = require('cors');
const { pdfToPng } = require('pdf-to-png-converter');

const app = express();
const PORT = process.env.PORT || 3000;

/* =========================
   Security Middleware
========================= */
const isSafeUrl = (urlStr) => {
    try {
        const url = new URL(urlStr);
        const blockedHosts = ['localhost', '127.0.0.1', '0.0.0.0', '::1'];
        if (blockedHosts.includes(url.hostname)) return false;
        const ipPattern = /^(10\.|192\.168\.|172\.(1[6-9]|2[0-9]|3[0-1])\.|169\.254\.)/;
        if (ipPattern.test(url.hostname)) return false;
        return url.protocol === 'http:' || url.protocol === 'https:';
    } catch {
        return false;
    }
};

/* =========================
   Middleware
========================= */
const path = require('path');
app.use(cors());
app.use(express.json({ limit: '20mb' }));

// 🛡️ Squelch malformed JSON parsing errors to keep terminal clean
app.use((err, req, res, next) => {
    if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
        return res.status(400).json({ status: 'error', message: 'Invalid JSON payload' });
    }
    next();
});

app.use(express.static(path.join(__dirname, '../public')));

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '../public', 'index.html'));
});

/* =========================
   PDF/PNG Styles
========================= */
const landscapeStyles = `
@page { size: 1280px 720px; margin: 0; }
html, body {
    background-color: white !important;
    margin: 0 !important;
    padding: 0 !important;
}
html, body, #root, #__next, #app, main, .notion-app-inner {
    height: auto !important;
    overflow: visible !important;
}
p, img, h1, h2, h3, h4, h5, h6, li, table, pre, code {
    page-break-inside: avoid !important;
}
img {
    max-width: 100% !important;
    object-fit: contain !important;
}
`;

/* =========================
   CONVERT API
 ========================= */
app.post('/convert', async (req, res) => {
    let browser;

    try {
        const { mode, htmlContent, format = 'pdf' } = req.body;

        const isVercel =
            process.env.VERCEL || process.env.AWS_REGION;

        const executablePath = isVercel
            ? await chromium.executablePath()
            : 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

        browser = await puppeteerExtra.launch({
            args: isVercel
                ? chromium.args
                : ['--no-sandbox', '--disable-setuid-sandbox'],
            executablePath,
            defaultViewport: chromium.defaultViewport,
            headless: chromium.headless,
        });

        /* ================= HTML MODE ================= */
        if (mode === 'html') {

            const slides = htmlContent
                .split(/<\/html>/i)
                .map(s => s.trim())
                .filter(Boolean)
                .map(s => s + '</html>');

            if (!slides.length)
                throw new Error('No valid HTML found');

            const results = [];

            for (let i = 0; i < slides.length; i++) {
                const slideHtml = slides[i];
                const page = await browser.newPage();

                await page.setViewport({
                    width: 1280,
                    height: 720
                });

                await page.setContent(slideHtml, {
                    waitUntil: 'networkidle0'
                });

                await page.addStyleTag({
                    content: landscapeStyles
                });

                if (format === 'pdf') {
                    const buffer = await page.pdf({
                        printBackground: true,
                        width: '1280px',
                        height: '720px'
                    });
                    results.push(buffer);
                } else {
                    // PNG direct screenshot
                    const pngBuffer = await page.screenshot({
                        type: 'png',
                        fullPage: false
                    });
                    results.push(pngBuffer);
                }
                await page.close();
            }

            if (format === 'pdf') {
                let finalPdfBuffer;
                if (results.length === 1) {
                    finalPdfBuffer = Buffer.from(results[0]);
                } else {
                    const mergedPdf = await PDFDocument.create();
                    for (const buffer of results) {
                        const pdf = await PDFDocument.load(buffer);
                        const pages = await mergedPdf.copyPages(pdf, pdf.getPageIndices());
                        pages.forEach(p => mergedPdf.addPage(p));
                    }
                    const mergedPdfBytes = await mergedPdf.save();
                    finalPdfBuffer = Buffer.from(mergedPdfBytes);
                }

                res.setHeader('Content-Type', 'application/pdf');
                res.setHeader('Content-Disposition', 'attachment; filename="presentation.pdf"');
                res.setHeader('Content-Length', finalPdfBuffer.length);
                return res.end(finalPdfBuffer);
            }

            // PNG SINGLE OR ZIP (Direct Screenshots)
            if (format === 'png') {
                if (results.length === 1) {
                    const pngBuffer = results[0];
                    console.log('--- Binary Debug (Direct PNG) ---');
                    console.log('Format: Single PNG');
                    console.log('Size:', pngBuffer.length, 'bytes');

                    res.setHeader('Content-Type', 'image/png');
                    res.setHeader('Content-Disposition', 'attachment; filename="screenshot.png"');
                    res.setHeader('Content-Length', pngBuffer.length);
                    return res.end(pngBuffer);
                } else {
                    const zip = new JSZip();
                    results.forEach((buffer, idx) => {
                        zip.file(`slide_${idx + 1}.png`, buffer);
                    });
                    const zipBuffer = await zip.generateAsync({ type: 'nodebuffer' });

                    console.log('--- Binary Debug (Direct PNG ZIP) ---');
                    console.log('Format: ZIP');
                    console.log('Size:', zipBuffer.length, 'bytes');

                    res.setHeader('Content-Type', 'application/zip');
                    res.setHeader('Content-Disposition', 'attachment; filename="presentation_images.zip"');
                    res.setHeader('Content-Length', zipBuffer.length);
                    return res.end(zipBuffer);
                }
            }
        }

        /* ================= URL MODE ================= */
        if (mode === 'url') {
            const { url, format = 'pdf' } = req.body;

            if (!url || !isSafeUrl(url))
                throw new Error('Invalid URL');

            const page = await browser.newPage();

            await page.setViewport({ width: 1280, height: 720 });

            await page.goto(url, {
                waitUntil: 'networkidle2',
                timeout: 60000
            });

            await page.addStyleTag({ content: landscapeStyles });

            if (format === 'png') {
                const pngBuffer = await page.screenshot({
                    type: 'png',
                    fullPage: true // URL mode usually wants full page
                });

                console.log('--- Binary Debug (URL-Direct-PNG) ---');
                console.log('Format: URL PNG');
                console.log('Size:', pngBuffer.length, 'bytes');

                res.setHeader('Content-Type', 'image/png');
                res.setHeader('Content-Disposition', 'attachment; filename="screenshot.png"');
                res.setHeader('Content-Length', pngBuffer.length);
                return res.end(pngBuffer);
            } else {
                const buffer = await page.pdf({
                    printBackground: true,
                    width: '1280px',
                    height: '720px'
                });
                const pdfBuffer = Buffer.from(buffer);
                res.setHeader('Content-Type', 'application/pdf');
                res.setHeader('Content-Disposition', 'attachment; filename="capture.pdf"');
                res.setHeader('Content-Length', pdfBuffer.length);
                return res.end(pdfBuffer);
            }
        }

        throw new Error('Invalid mode');

    } catch (err) {
        console.error(err);

        res.status(500).json({
            status: 'error',
            message: err.message
        });
    } finally {
        if (browser) await browser.close();
    }
});

/* =========================
   BUILD PDF API
========================= */
app.post('/build-pdf', async (req, res) => {
    try {
        const { images, filename } = req.body;

        if (!images?.length)
            throw new Error('No images');

        const mergedPdf =
            await PDFDocument.create();

        for (const base64 of images) {

            const imgBuffer = Buffer.from(
                base64.replace(
                    /^data:image\/\w+;base64,/,
                    ''
                ),
                'base64'
            );

            const img =
                await mergedPdf.embedJpg(imgBuffer);

            const dims = img.scale(1);

            const page =
                mergedPdf.addPage([
                    dims.width,
                    dims.height
                ]);

            page.drawImage(img, {
                x: 0,
                y: 0,
                width: dims.width,
                height: dims.height
            });
        }

        const pdfBytes =
            await mergedPdf.save();

        res.setHeader(
            'Content-Type',
            'application/pdf'
        );

        res.send(Buffer.from(pdfBytes));

    } catch (err) {
        res.status(500).json({
            status: 'error',
            message: err.message
        });
    }
});

/* =========================
   Local Dev Only
========================= */
if (!process.env.VERCEL) {
    app.listen(PORT, () => {
        console.log(
            `docReaper running on http://localhost:${PORT}`
        );
    });
}

/* =========================
   Vercel Export
========================= */
module.exports = app;