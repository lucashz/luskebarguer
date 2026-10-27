import path from 'node:path';
import { spawn } from 'node:child_process';
import { writeFile } from 'node:fs/promises';
import sharp from 'sharp';

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

async function captureVariant({ name, url, scrollY = 0, hideTopActions = false, compactHeader = false, width = 440, height = 960, scale = 2.5, frameMockup = false }) {
  const port = 9300 + Math.floor(Math.random() * 400);
  const profileDir = path.resolve(`.tmp-chrome-${port}`);

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
    let versionData = null;
    for (let i = 0; i < 30; i++) {
      try {
        const res = await fetch(`http://127.0.0.1:${port}/json/version`);
        if (res.ok) { versionData = await res.json(); break; }
      } catch {}
      await new Promise(r => setTimeout(r, 100));
    }

    const newPageRes = await fetch(`http://127.0.0.1:${port}/json/new?${encodeURIComponent(url)}`, { method: 'PUT' });
    const pageData = await newPageRes.json();
    const ws = new WebSocket(pageData.webSocketDebuggerUrl);

    let msgId = 1;
    const pending = new Map();
    ws.onmessage = (event) => {
      const msg = JSON.parse(event.data);
      if (msg.id && pending.has(msg.id)) {
        pending.get(msg.id)(msg);
        pending.delete(msg.id);
      }
    };
    await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
    const send = (method, params = {}) => new Promise((res) => {
      const id = msgId++;
      pending.set(id, res);
      ws.send(JSON.stringify({ id, method, params }));
    });

    await send('Page.enable');
    await send('Runtime.enable');
    await send('Emulation.setDeviceMetricsOverride', {
      width,
      height,
      deviceScaleFactor: scale,
      mobile: true
    });
    await send('Emulation.setUserAgentOverride', {
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1'
    });

    await send('Page.navigate', { url });

    for (let i = 0; i < 30; i++) {
      await new Promise(r => setTimeout(r, 200));
      const evalRes = await send('Runtime.evaluate', {
        expression: `
          (() => {
            // Force eager images
            const imgs = Array.from(document.querySelectorAll('img'));
            imgs.forEach(img => {
              if (img.loading === 'lazy') img.loading = 'eager';
              if (img.decoding === 'async') img.decoding = 'sync';
            });

            if (${hideTopActions}) {
              // Hide login/signup buttons and make topbar clean
              const actions = document.querySelector('.public-actions');
              if (actions) actions.style.display = 'none';
              const topbar = document.querySelector('.public-topbar');
              if (topbar) {
                topbar.style.padding = '8px 16px';
                topbar.style.height = 'auto';
              }
            }

            if (${compactHeader}) {
              // Compact the cover image and summary so food appears immediately
              const cover = document.getElementById('storeCover');
              if (cover) cover.style.height = '110px';
              const summary = document.querySelector('.store-summary');
              if (summary) summary.style.padding = '8px 16px';
              const desc = document.getElementById('storeDescription');
              if (desc) desc.style.display = '-webkit-box';
              if (desc) desc.style.webkitLineClamp = '2';
              if (desc) desc.style.webkitBoxOrient = 'vertical';
              if (desc) desc.style.overflow = 'hidden';
            }

            if (${scrollY} > 0) {
              window.scrollTo(0, ${scrollY});
            }

            const allLoaded = imgs.length > 0 && imgs.every(img => img.complete && img.naturalWidth > 0);
            return {
              ready: document.readyState === 'complete',
              total: imgs.length,
              loaded: imgs.filter(img => img.complete && img.naturalWidth > 0).length,
              allLoaded
            };
          })()
        `,
        returnByValue: true
      });
      if (evalRes?.result?.result?.value?.allLoaded && i >= 5) break;
    }

    await new Promise(r => setTimeout(r, 600));

    const screenshot = await send('Page.captureScreenshot', {
      format: 'png',
      quality: 100,
      clip: { x: 0, y: 0, width, height, scale }
    });
    const rawBuffer = Buffer.from(screenshot.result.data, 'base64');

    const outPath = path.resolve(`artifacts/variant-${name}.png`);

    if (frameMockup) {
      // Sleek phone frame taking 85% of width instead of 45%
      const phoneW = 860;
      const phoneH = 1260;
      const screenW = phoneW - 24;
      const screenH = phoneH - 24;
      const resized = await sharp(rawBuffer)
        .resize(screenW, screenH, { fit: 'cover', position: 'top' })
        .png()
        .toBuffer();

      const mask = Buffer.from(`
        <svg width="${screenW}" height="${screenH}">
          <rect width="${screenW}" height="${screenH}" rx="40" ry="40" fill="#fff"/>
        </svg>
      `);
      const masked = await sharp(resized).composite([{ input: mask, blend: 'dest-in' }]).png().toBuffer();

      const frameSvg = Buffer.from(`
        <svg width="1080" height="1350" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <radialGradient id="bg" cx="50%" cy="50%" r="70%">
              <stop offset="0%" stop-color="#1e293b"/>
              <stop offset="100%" stop-color="#0f172a"/>
            </radialGradient>
            <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
              <feDropShadow dx="0" dy="20" stdDeviation="30" flood-color="#000" flood-opacity="0.5"/>
            </filter>
          </defs>
          <rect width="1080" height="1350" fill="url(#bg)"/>
          <text x="540" y="55" text-anchor="middle" fill="#ffffff" font-family="Arial, sans-serif" font-size="24" font-weight="bold" letter-spacing="0.5">CARDÁPIO DIGITAL NO CELULAR</text>
          <rect x="${(1080 - phoneW) / 2}" y="${(1350 - phoneH) / 2 + 15}" width="${phoneW}" height="${phoneH}" rx="48" ry="48" fill="#1e293b" filter="url(#shadow)" stroke="#475569" stroke-width="3"/>
          <rect x="${(1080 - screenW) / 2}" y="${(1350 - screenH) / 2 + 15}" width="${screenW}" height="${screenH}" rx="40" ry="40" fill="#000"/>
        </svg>
      `);

      const notchSvg = Buffer.from(`
        <svg width="1080" height="1350" xmlns="http://www.w3.org/2000/svg">
          <rect x="475" y="${(1350 - screenH) / 2 + 15 + 10}" width="130" height="26" rx="13" fill="#000000"/>
          <circle cx="585" cy="${(1350 - screenH) / 2 + 15 + 23}" r="4" fill="#1e293b"/>
          <rect x="470" y="${(1350 + screenH) / 2 + 15 - 14}" width="140" height="4" rx="2" fill="#64748b" fill-opacity="0.6"/>
        </svg>
      `);

      await sharp(frameSvg)
        .composite([
          { input: masked, top: Math.round((1350 - screenH) / 2 + 15), left: Math.round((1080 - screenW) / 2) },
          { input: notchSvg, top: 0, left: 0 }
        ])
        .png()
        .toFile(outPath);
    } else {
      // Full-bleed 1080x1350 mobile screen capture
      await sharp(rawBuffer)
        .resize(1080, 1350, { fit: 'cover', position: 'top' })
        .png()
        .toFile(outPath);
    }

    console.log(`Variante ${name} gerada em: ${outPath}`);
    try { ws.close(); } catch {}
  } finally {
    try {
      const { execSync } = await import('node:child_process');
      execSync(`taskkill /pid ${chromeProc.pid} /T /F`, { stdio: 'ignore' });
    } catch {}
  }
}

async function main() {
  const url = 'https://taprontomenu.com.br/refugio-gourmet';

  // Variant A: Compact header + food items visible + Full Bleed 1080x1350 (No shrinking, 100% of the WhatsApp image is the rich menu)
  await captureVariant({
    name: 'A-fullbleed-compact',
    url,
    compactHeader: true,
    hideTopActions: true,
    width: 440,
    height: 550, // 440x550 is exactly 4:5 ratio (1080x1350)
    scale: 2.4545,
    frameMockup: false
  });

  // Variant B: Scrolled slightly down so topbar is gone, store name is at top, and 3-4 food items with photos are front and center
  await captureVariant({
    name: 'B-scrolled-food-focus',
    url,
    scrollY: 180,
    hideTopActions: true,
    compactHeader: false,
    width: 440,
    height: 550,
    scale: 2.4545,
    frameMockup: false
  });

  // Variant C: Big phone mockup taking 85% of the frame (instead of 45%), with food items prominently visible
  await captureVariant({
    name: 'C-big-mockup-compact',
    url,
    compactHeader: true,
    hideTopActions: true,
    width: 440,
    height: 645,
    scale: 2.5,
    frameMockup: true
  });
}

main().catch(console.error);

