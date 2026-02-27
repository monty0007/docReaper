const fs = require('fs');

async function debugPngUrl() {
    try {
        console.log('--- Requesting PNG (URL mode) from API ---');
        const response = await fetch('http://localhost:3001/convert', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                mode: 'url',
                format: 'png',
                url: 'https://example.com'
            })
        });

        const arrayBuffer = await response.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);
        console.log('Response Size:', buffer.length, 'bytes');
        console.log('Content-Type:', response.headers.get('content-type'));

        // PNG Signature: 89 50 4E 47 0D 0A 1A 0A
        const signature = buffer.slice(0, 8).toString('hex').toUpperCase();
        console.log('PNG Signature Check:', signature);

        if (signature === '89504E470D0A1A0A') {
            console.log('✅ SIGNATURE MATCHES PNG SPEC');
            fs.writeFileSync('debug_url_screenshot.png', buffer);
            console.log('Saved to debug_url_screenshot.png');
        } else {
            console.log('❌ INVALID PNG SIGNATURE');
            console.log('Raw First 16 bytes:', buffer.slice(0, 16).toString('hex'));
            console.log('As String (if text):', buffer.slice(0, 100).toString());
        }
    } catch (e) {
        console.error('Error:', e);
    }
}

debugPngUrl();
