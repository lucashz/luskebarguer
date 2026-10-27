import { spawn } from 'node:child_process';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

async function captureWithCDP({ url, outputPath, width = 1080, height = 1350, isMobile = false }) {
  const port = 9222 + Math.floor(Math.random() * 500);
  const profileDir = path.resolve(`.tmp-chrome-cdp-${port}`);
  
  const args = [
    '--headless=new',
    '--no-sandbox',
    '--disable-gpu',
    '--disable-dev-shm-usage',
    '--hide-scrollbars',
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${profileDir}`,
    'about:blank'
  ];

  const chromeProc = spawn(CHROME_PATH, args, { stdio: 'ignore', windowsHide: true });

  try {
    // Wait for CDP endpoint to be ready
    let versionData = null;
    for (let i = 0; i < 30; i++) {
      try {
        const res = await fetch(`http://127.0.0.1:${port}/json/version`);
        if (res.ok) {
          versionData = await res.json();
          break;
        }
      } catch {}
      await new Promise(r => setTimeout(r, 100));
    }

    if (!versionData?.webSocketDebuggerUrl) {
      throw new Error('Não foi possível conectar ao Chrome DevTools Protocol');
    }

    // Open target page via HTTP API
    const newPageRes = await fetch(`http://127.0.0.1:${port}/json/new?${encodeURIComponent(url)}`, { method: 'PUT' });
    const pageData = await newPageRes.json();
    const wsUrl = pageData.webSocketDebuggerUrl;

    const ws = new WebSocket(wsUrl);
    let msgId = 1;
    const pending = new Map();

    ws.onmessage = (event) => {
      const msg = JSON.parse(event.data);
      if (msg.id && pending.has(msg.id)) {
        pending.get(msg.id)(msg);
        pending.delete(msg.id);
      }
    };

    await new Promise((res, rej) => {
      ws.onopen = res;
      ws.onerror = rej;
    });

    function send(method, params = {}) {
      return new Promise((res) => {
        const id = msgId++;
        pending.set(id, res);
        ws.send(JSON.stringify({ id, method, params }));
      });
    }

    // Enable Page, Network, Runtime
    await send('Page.enable');
    await send('Runtime.enable');

    // Emulate device metrics
    await send('Emulation.setDeviceMetricsOverride', {
      width,
      height,
      deviceScaleFactor: 1,
      mobile: isMobile
    });

    if (isMobile) {
      await send('Emulation.setUserAgentOverride', {
        userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36'
      });
    }

    console.log(`Navegando para ${url}...`);
    await send('Page.navigate', { url });

    // Wait for Page.loadEventFired or check document.readyState
    console.log('Aguardando carregamento da página e imagens...');
    for (let i = 0; i < 40; i++) {
      await new Promise(r => setTimeout(r, 250));

      // Force eager loading on all images and scroll slightly to trigger observers
      const evalRes = await send('Runtime.evaluate', {
        expression: `
          (() => {
            const imgs = Array.from(document.querySelectorAll('img'));
            imgs.forEach(img => {
              if (img.loading === 'lazy') img.loading = 'eager';
              if (img.decoding === 'async') img.decoding = 'sync';
            });
            const allLoaded = imgs.length > 0 && imgs.every(img => img.complete && img.naturalWidth > 0);
            return {
              ready: document.readyState === 'complete',
              totalImages: imgs.length,
              loadedImages: imgs.filter(img => img.complete && img.naturalWidth > 0).length,
              allLoaded
            };
          })()
        `,
        returnByValue: true
      });

      const stats = evalRes?.result?.result?.value;
      if (stats?.allLoaded && i >= 6) { // wait at least 1.5s
        console.log(`Todas as imagens carregadas: ${stats.loadedImages}/${stats.totalImages}!`);
        break;
      }
    }

    // Small stabilization pause for rendering
    await new Promise(r => setTimeout(r, 600));

    console.log('Capturando screenshot em alta fidelidade...');
    const screenshot = await send('Page.captureScreenshot', {
      format: 'png',
      quality: 100,
      clip: { x: 0, y: 0, width, height, scale: 1 }
    });

    const buffer = Buffer.from(screenshot.result.data, 'base64');
    await writeFile(outputPath, buffer);
    console.log(`Screenshot salva com sucesso: ${outputPath} (${(buffer.length / 1024).toFixed(0)} KB)`);

    ws.close();
  } finally {
    chromeProc.kill('SIGKILL');
  }
}

async function test() {
  const out = path.resolve('artifacts/test-bares-cdp.png');
  await captureWithCDP({
    url: 'https://taprontomenu.com.br/bares',
    outputPath: out,
    width: 1080,
    height: 1350
  });
}

test().catch(console.error);
