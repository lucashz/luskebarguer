import path from 'node:path';
import { spawn } from 'node:child_process';
import sharp from 'sharp';

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

async function testHealthyMobileView() {
  const url = 'https://taprontomenu.com.br/refugio-gourmet';
  const port = 9488;
  const profileDir = path.resolve(`.tmp-chrome-healthy-${port}`);

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

    // High quality mobile viewport: 480px width x 600px height (4:5 ratio) with 2.25 deviceScaleFactor => 1080x1350!
    // Or 440px width x 1000px height
    const viewWidth = 440;
    const viewHeight = 980;

    await send('Emulation.setDeviceMetricsOverride', {
      width: viewWidth,
      height: viewHeight,
      deviceScaleFactor: 2.45,
      mobile: true
    });
    await send('Emulation.setUserAgentOverride', {
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1'
    });

    await send('Page.navigate', { url });

    for (let i = 0; i < 35; i++) {
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

            // 1. Clean header: hide login buttons, keep only TáPronto brand
            const actions = document.querySelector('.public-actions');
            if (actions) actions.style.display = 'none';

            const topbar = document.querySelector('.public-topbar');
            if (topbar) {
              topbar.style.padding = '8px 16px';
              topbar.style.height = 'auto';
              topbar.style.justifyContent = 'center';
            }

            // 2. Compact cover banner
            const cover = document.getElementById('storeCover');
            if (cover) {
              cover.style.height = '110px';
              cover.style.minHeight = '110px';
            }

            // 3. Compact store summary
            const summary = document.querySelector('.store-summary');
            if (summary) {
              summary.style.padding = '10px 16px';
              summary.style.marginTop = '-24px';
              summary.style.position = 'relative';
              summary.style.zIndex = '10';
            }
            const logo = document.getElementById('storeLogo');
            if (logo) {
              logo.style.width = '52px';
              logo.style.height = '52px';
            }
            const storeName = document.getElementById('storeName');
            if (storeName) {
              storeName.style.fontSize = '1.35rem';
              storeName.style.margin = '2px 0';
            }
            const desc = document.getElementById('storeDescription');
            if (desc) {
              desc.style.fontSize = '0.82rem';
              desc.style.lineHeight = '1.3';
              desc.style.margin = '3px 0 6px';
              desc.style.display = '-webkit-box';
              desc.style.webkitLineClamp = '2';
              desc.style.webkitBoxOrient = 'vertical';
              desc.style.overflow = 'hidden';
            }

            // 4. Hide redundant search bar in demo print to bring food up!
            const searchBox = document.querySelector('.search-box');
            if (searchBox) searchBox.style.display = 'none';

            const toolbar = document.querySelector('.feed-toolbar');
            if (toolbar) toolbar.style.display = 'none';

            // 5. Category rail compact horizontal bar
            const catNav = document.getElementById('categoryNav');
            if (catNav) {
              catNav.style.padding = '6px 0';
              catNav.style.marginBottom = '6px';
            }

            // 6. Food cards presentation
            const menuSections = document.getElementById('menu');
            if (menuSections) {
              menuSections.style.padding = '0';
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
      if (evalRes?.result?.result?.value?.allLoaded && i >= 6) break;
    }

    await new Promise(r => setTimeout(r, 700));

    // Capture 440 x 550 (which matches 1080 x 1350 perfectly with 4:5 ratio)
    // Or capture full phone height 440 x 960 and resize
    const captureH = 550; // exactly 4:5 ratio!
    const screenshot = await send('Page.captureScreenshot', {
      format: 'png',
      quality: 100,
      clip: { x: 0, y: 0, width: viewWidth, height: captureH, scale: 2.4545 }
    });
    const rawBuffer = Buffer.from(screenshot.result.data, 'base64');

    const outPath = path.resolve('artifacts/test-healthy-mobile.png');
    await sharp(rawBuffer)
      .resize(1080, 1350, { fit: 'cover', position: 'top' })
      .png()
      .toFile(outPath);

    console.log('✅ Visualização saudável gerada com sucesso em:', outPath);
    try { ws.close(); } catch {}
  } finally {
    try {
      const { execSync } = await import('node:child_process');
      execSync(`taskkill /pid ${chromeProc.pid} /T /F`, { stdio: 'ignore' });
    } catch {}
  }
}

testHealthyMobileView().catch(console.error);

