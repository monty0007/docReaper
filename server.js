const express = require('express');
const puppeteer = require('puppeteer-core');
const { addExtra } = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const puppeteerExtra = addExtra(puppeteer);
puppeteerExtra.use(StealthPlugin());

const chromium = require('@sparticuz/chromium');
const { PDFDocument } = require('pdf-lib');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

/* =========================
   Security Middleware
========================= */
const isSafeUrl = (urlStr) => {
    try {
        const url = new URL(urlStr);

        const blockedHosts = [
            'localhost',
            '127.0.0.1',
            '0.0.0.0',
            '::1'
        ];

        if (blockedHosts.includes(url.hostname)) return false;

        const ipPattern =
            /^(10\.|192\.168\.|172\.(1[6-9]|2[0-9]|3[0-1])\.|169\.254\.)/;

        if (ipPattern.test(url.hostname)) return false;

        return url.protocol === 'http:' || url.protocol === 'https:';
    } catch {
        return false;
    }
};

/* =========================
   Middleware
========================= */
app.use(cors());
app.use(express.json({ limit: '20mb' }));
app.use(express.static('public'));

/* ✅ FIX: Root route (prevents Cannot GET /) */
app.get('/', (req, res) => {
    res.status(200).send('docReaper API running 🚀');
});

/* =========================
   PDF Styles
========================= */
const landscapeStyles = `
@page {
    size: 1280px 720px;
    margin: 0;
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
        const { mode, htmlContent } = req.body;

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

            const pdfBuffers = [];

            for (const slideHtml of slides) {
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

                const buffer = await page.pdf({
                    printBackground: true,
                    width: '1280px',
                    height: '720px'
                });

                pdfBuffers.push(buffer);
                await page.close();
            }

            let finalPdf;

            if (pdfBuffers.length === 1) {
                finalPdf = pdfBuffers[0];
            } else {
                const mergedPdf =
                    await PDFDocument.create();

                for (const buffer of pdfBuffers) {
                    const pdf =
                        await PDFDocument.load(buffer);

                    const pages =
                        await mergedPdf.copyPages(
                            pdf,
                            pdf.getPageIndices()
                        );

                    pages.forEach(p =>
                        mergedPdf.addPage(p)
                    );
                }

                finalPdf = await mergedPdf.save();
            }

            res.setHeader(
                'Content-Type',
                'application/pdf'
            );

            return res.send(Buffer.from(finalPdf));
        }

        /* ================= URL MODE ================= */
        if (mode === 'url') {

            const { url } = req.body;

            if (!url || !isSafeUrl(url))
                throw new Error('Invalid URL');

            const page = await browser.newPage();

            await page.setViewport({
                width: 1280,
                height: 720
            });

            await page.goto(url, {
                waitUntil: 'networkidle2',
                timeout: 60000
            });

            await page.addStyleTag({
                content: landscapeStyles
            });

            const buffer = await page.pdf({
                printBackground: true,
                width: '1280px',
                height: '720px'
            });

            res.setHeader(
                'Content-Type',
                'application/pdf'
            );

            return res.send(buffer);
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