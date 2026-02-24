# docReaper 💀

**docReaper** is a premium, high-fidelity HTML-to-PDF converter designed specifically for presentations and web pages. It ensures a pixel-perfect 16:9 landscape output with absolute CSS isolation for multi-slide documents.

![docReaper UI](public/images/docreaper_ui.png) <!-- Note: This is a placeholder for the user's reference -->

## ✨ Key Features

- **16:9 Landscape Perfection**: Automatically forces all output to a standard presentation aspect ratio (1280x720px).
- **Multi-Slide Isolation**: Renders each `<html>` block in a separate browser context to prevent CSS leakage and style conflicts.
- **URL to PDF**: Seamlessly convert public web pages into PDFs with a single click.
- **Premium v2 UI**: A modern, dark-themed, glassmorphic interface with smooth animations and mesh gradients.
- **Secure by Design**: Built-in SSRF protection to block access to internal networks and local services.
- **Real-time Feedback**: Interactive toast notification system for status updates.

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

Start the development server:
```bash
npm start
```
The application will be available at `http://localhost:3000`.

## 🛠️ Tech Stack

- **Backend**: Node.js, Express, Puppeteer (Headless Chrome), `pdf-lib`
- **Frontend**: Vanilla JavaScript (ES6+), Modern CSS (Flexbox, Grid, Animations)

## 🔒 Security

- **SSRF Protection**: Validates and filters URLs to prevent requests to sensitive internal IP ranges (`127.0.0.1`, `192.168.x.x`, etc.).
- **Sandboxed Rendering**: Puppeteer is configured with restrictive flags to ensure secure document processing.

## 📄 License

This project is licensed under the MIT License.
