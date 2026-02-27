const fs = require('fs');

async function testPng() {
    try {
        console.log('Testing Single PNG...');
        const res1 = await fetch('http://localhost:3001/convert', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                mode: 'html',
                format: 'png',
                htmlContent: '<html><body><h1>Single Page</h1></body></html>'
            })
        });

        const contentType1 = res1.headers.get('content-type');
        console.log('Single PNG Content-Type:', contentType1);
        if (contentType1 === 'image/png') {
            const arrayBuffer = await res1.arrayBuffer();
            const buffer = Buffer.from(arrayBuffer);
            fs.writeFileSync('test_single.png', buffer);
            console.log('Single PNG saved to test_single.png');
        }

        console.log('\nTesting Multi-Slide ZIP...');
        const res2 = await fetch('http://localhost:3001/convert', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                mode: 'html',
                format: 'png',
                htmlContent: '<html><body><h1>Slide 1</h1></body></html><html><body><h1>Slide 2</h1></body></html>'
            })
        });

        const contentType2 = res2.headers.get('content-type');
        console.log('Multi-Slide ZIP Content-Type:', contentType2);
        if (contentType2 === 'application/zip') {
            const arrayBuffer = await res2.arrayBuffer();
            const buffer = Buffer.from(arrayBuffer);
            fs.writeFileSync('test_multi.zip', buffer);
            console.log('Multi-Slide ZIP saved to test_multi.zip');
        }
    } catch (e) {
        console.error('Test failed:', e);
    }
}

testPng();
