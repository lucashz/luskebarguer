import { spawn } from 'node:child_process';
import { writeFile, readFile } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

import os from 'node:os';

export async function captureWithCDP({ url, outputPath, width = 1080, height = 1350, isMobile = false }) {
  const port = 9222 + Math.floor(Math.random() * 500);
  const profileDir = path.join(os.tmpdir(), `chrome-cdp-${port}`);
  
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

  console.log(`[CDP] Iniciando Chrome na porta ${port}...`);
  const chromeProc = spawn(CHROME_PATH, args, { stdio: 'ignore', windowsHide: true });

  try {
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
    console.log(`[CDP] Chrome pronto. Abrindo página ${url}...`);

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
    console.log(`[CDP] Conectado via WebSocket DevTools.`);

    function send(method, params = {}) {
      return new Promise((res) => {
        const id = msgId++;
        pending.set(id, res);
        ws.send(JSON.stringify({ id, method, params }));
      });
    }

    await send('Page.enable');
    await send('Runtime.enable');

    const captureWidth = isMobile ? 440 : width;
    const captureHeight = isMobile ? 960 : height;

    await send('Emulation.setDeviceMetricsOverride', {
      width: captureWidth,
      height: captureHeight,
      deviceScaleFactor: 2, // Retinal high resolution!
      mobile: isMobile
    });

    if (isMobile) {
      await send('Emulation.setUserAgentOverride', {
        userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1'
      });
    }

    await send('Page.navigate', { url });

    for (let i = 0; i < 40; i++) {
      await new Promise(r => setTimeout(r, 200));

      const evalRes = await send('Runtime.evaluate', {
        expression: `
          (() => {
            if (${isMobile}) {
              document.body.style.paddingTop = '34px';
              const topbar = document.querySelector('.public-topbar');
              if (topbar) topbar.style.paddingTop = '12px';
            }
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
      if (stats) {
        console.log(`[CDP] Imagens: ${stats.loadedImages}/${stats.totalImages} prontas (passo ${i+1}/40)`);
      }
      if (stats?.allLoaded && i >= 6) {
        console.log(`[CDP] Sucesso: todas as ${stats.loadedImages} imagens carregadas!`);
        break;
      }
    }

    await new Promise(r => setTimeout(r, 600));

    console.log(`[CDP] Capturando screenshot (${captureWidth}x${captureHeight})...`);
    const screenshot = await send('Page.captureScreenshot', {
      format: 'png',
      quality: 100,
      clip: { x: 0, y: 0, width: captureWidth, height: captureHeight, scale: isMobile ? 2 : 1 }
    });

    const rawBuffer = Buffer.from(screenshot.result.data, 'base64');
    const { mkdir } = await import('node:fs/promises');
    await mkdir(path.dirname(outputPath), { recursive: true });

    if (isMobile) {
      console.log(`[CDP] Enquadrando em mockup mobile 1080x1350...`);
      // Frame inside modern smartphone mockup
      const screenW = 490;
      const screenH = 1080;
      const phoneW = screenW + 28;
      const phoneH = screenH + 28;
      const radius = 48;

      const resizedScreen = await sharp(rawBuffer)
        .resize(screenW, screenH, { fit: 'cover', position: 'top' })
        .png()
        .toBuffer();

      const svgFrame = Buffer.from(`
        <svg width="1080" height="1350" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <radialGradient id="bg" cx="50%" cy="50%" r="70%">
              <stop offset="0%" stop-color="#1e293b"/>
              <stop offset="100%" stop-color="#0f172a"/>
            </radialGradient>
            <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
              <feDropShadow dx="0" dy="25" stdDeviation="35" flood-color="#000000" flood-opacity="0.6"/>
            </filter>
          </defs>

          <rect width="1080" height="1350" fill="url(#bg)"/>

          <text x="540" y="70" text-anchor="middle" fill="#ffffff" font-family="Arial, sans-serif" font-size="28" font-weight="bold" letter-spacing="0.5">CARDÁPIO DIGITAL NO CELULAR</text>
          <text x="540" y="105" text-anchor="middle" fill="#94a3b8" font-family="Arial, sans-serif" font-size="18">Visualização rápida e pedidos direto pelo WhatsApp</text>

          <rect x="${(1080 - phoneW) / 2}" y="${(1350 - phoneH) / 2 + 10}" width="${phoneW}" height="${phoneH}" rx="${radius}" ry="${radius}" fill="#334155" filter="url(#shadow)" stroke="#475569" stroke-width="3"/>
          <rect x="${(1080 - screenW) / 2 - 4}" y="${(1350 - screenH) / 2 + 6}" width="${screenW + 8}" height="${screenH + 8}" rx="38" ry="38" fill="#020617"/>
        </svg>
      `);

      const mask = Buffer.from(`
        <svg width="${screenW}" height="${screenH}">
          <rect width="${screenW}" height="${screenH}" rx="34" ry="34" fill="#fff"/>
        </svg>
      `);
      const maskedScreen = await sharp(resizedScreen)
        .composite([{ input: mask, blend: 'dest-in' }])
        .png()
        .toBuffer();

      const notchSvg = Buffer.from(`
        <svg width="1080" height="1350" xmlns="http://www.w3.org/2000/svg">
          <rect x="480" y="${(1350 - screenH) / 2 + 10 + 8}" width="120" height="24" rx="12" fill="#000000"/>
          <circle cx="580" cy="${(1350 - screenH) / 2 + 10 + 20}" r="4" fill="#1e293b"/>
          <rect x="480" y="${(1350 + screenH) / 2 + 10 - 16}" width="120" height="4" rx="2" fill="#64748b" fill-opacity="0.6"/>
        </svg>
      `);

      await sharp(svgFrame)
        .composite([
          { input: maskedScreen, top: Math.round((1350 - screenH) / 2 + 10), left: Math.round((1080 - screenW) / 2) },
          { input: notchSvg, top: 0, left: 0 }
        ])
        .png()
        .toFile(outputPath);
    } else {
      console.log(`[CDP] Salvando desktop 1080x1350...`);
      await sharp(rawBuffer)
        .resize(width, height, { fit: 'cover', position: 'top' })
        .png()
        .toFile(outputPath);
    }

    console.log(`[CDP] Imagem salva em: ${outputPath}`);
    try { ws.close(); } catch {}
  } finally {
    try {
      if (process.platform === 'win32' && chromeProc.pid) {
        const { execSync } = await import('node:child_process');
        execSync(`taskkill /pid ${chromeProc.pid} /T /F`, { stdio: 'ignore' });
      } else {
        chromeProc.kill('SIGKILL');
      }
    } catch {}
  }
}

async function test() {
  const out = path.resolve('artifacts/test-bares-mobile-cdp.png');
  console.log('Capturando mobile mockup com CDP...');
  await captureWithCDP({
    url: 'https://taprontomenu.com.br/bares',
    outputPath: out,
    isMobile: true
  });
  console.log('Mobile capturado:', out);
}

if (process.argv[1] && process.argv[1].endsWith('test-mobile-cdp.mjs')) {
  test().catch(console.error);
}
