import { spawn } from 'node:child_process';

async function scrapeImages(query) {
  const executable = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
  const port = 9444 + Math.floor(Math.random() * 200);
  const chrome = spawn(executable, [
    '--headless=new',
    `--remote-debugging-port=${port}`,
    '--no-sandbox',
    '--user-data-dir=' + process.env.TEMP + '/chrome-scrape-' + port,
    'about:blank'
  ]);

  try {
    await new Promise(r => setTimeout(r, 1500));
    const targetUrl = `https://unsplash.com/s/photos/${encodeURIComponent(query)}`;
    const pageRes = await fetch(`http://127.0.0.1:${port}/json/new?${encodeURIComponent(targetUrl)}`, { method: 'PUT' });
    const page = await pageRes.json();
    const ws = new WebSocket(page.webSocketDebuggerUrl);

    let id = 1;
    const req = (method, params = {}) => new Promise((resolve) => {
      const curId = id++;
      const handler = (e) => {
        const d = JSON.parse(e.data);
        if (d.id === curId) {
          ws.removeEventListener('message', handler);
          resolve(d.result);
        }
      };
      ws.addEventListener('message', handler);
      ws.send(JSON.stringify({ id: curId, method, params }));
    });

    await new Promise(r => ws.onopen = r);
    await req('Page.enable');
    await req('Runtime.enable');

    await new Promise(r => setTimeout(r, 5000));

    const evalRes = await req('Runtime.evaluate', {
      expression: `
        Array.from(document.querySelectorAll('img'))
          .map(img => img.src || img.currentSrc || img.srcset)
          .filter(Boolean)
          .slice(0, 15)
      `,
      returnByValue: true
    });

    return evalRes.result?.value || [];
  } finally {
    chrome.kill('SIGKILL');
  }
}

const res = await scrapeImages('ice-cubes');
console.log('Result:', res);

