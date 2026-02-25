# docReaper 💀

**docReaper** is a premium, high-fidelity HTML-to-PDF converter designed specifically for presentations, deep web pages, and authenticated dashboards. It ensures a pixel-perfect 16:9 landscape output with advanced scrolling and bot-evasion engines.

![docReaper UI](public/images/docreaper_ui.png) <!-- Note: This is a placeholder for the user's reference -->

## ✨ Key Features

- **16:9 Landscape Perfection**: Automatically forces all output to a standard presentation aspect ratio (1280x720px).
- **docReaper Chrome Extension**: Includes a custom Manifest V3 Chrome Extension (`/extension`) for **1-click PDF captures** of your active tab.
- **Automated Cookie Injection**: Capture authenticated, gated content (like Notion, ChatGPT, or private dashboards) without logging in again. The Chrome extension automatically injects your active session cookies into the PDF engine.
- **Hybrid SPA Scrolling Engine**: Defeats Single Page Applications (SPAs) locked to `100vh` by automatically hunting down and scrolling deep internal containers to force all lazy-loaded content to render.
- **Content Anti-Clipping**: Injects dynamic print CSS (`break-inside: avoid`) to ensure paragraphs and images are never sliced in half across PDF page breaks.
- **Cloudflare Stealth Bypass**: Uses `puppeteer-extra-plugin-stealth` to evade generic bot/human challenges.
- **Premium UI**: A modern, dark-themed, glassmorphic web interface with smooth animations and mesh gradients.

## 🚀 Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) (v16.x or higher)
- [npm](https://www.npmjs.com/)

### Installation

1. Clone the repository:
   ```bash
   git clone <your-repo-url>
   cd "Html to ppt"
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

### Running the App

Start the backend formatting and rendering server:
```bash
npm start
```
The application will be available at `http://localhost:3000`.

### 🧩 Installing the Chrome Extension

To capture web pages with 1-click (including passwords/gated content):
1. Open Google Chrome and navigate to `chrome://extensions/`
2. Enable **Developer mode** in the top right corner.
3. Click **Load unpacked** in the top left.
4. Select the `extension` folder located inside this project directory.
5. Pin the `docReaper Web Clipper` to your toolbar!

## 🛠️ Tech Stack

- **Backend**: Node.js, Express, Puppeteer (Headless Chrome), `pdf-lib`, `puppeteer-extra`
- **Frontend**: Vanilla JavaScript (ES6+), Modern CSS (Flexbox, Grid, Animations)
- **Extension**: Chrome Manifest V3

## 🔒 Security

- **SSRF Protection**: Validates and filters URLs to prevent requests to sensitive internal IP ranges (`127.0.0.1`, `192.168.x.x`, etc.).
- **Sandboxed Rendering**: Puppeteer is configured with restrictive flags to ensure secure document processing.

## 📄 License

This project is licensed under the MIT License.
