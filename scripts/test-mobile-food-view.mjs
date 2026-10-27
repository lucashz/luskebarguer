import path from 'node:path';
import { spawn } from 'node:child_process';
import sharp from 'sharp';

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

async function testMobile(options = {}) {
  const { name, scrollY = 0, customCSS = '', width = 450, height = 562.5 } = options; // 450x562.5 is exactly 4:5
  const port = 9600 + Math.floor(Math.random() * 300);
  const profileDir = path.resolve(`.tmp-chrome-mobile-${port}`);

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

    const url = 'https://taprontomenu.com.br/refugio-gourmet';
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

    // Phone viewport: 450 width x 562.5 height (4:5 ratio) with 2.4 deviceScaleFactor => 1080 x 1350!
    await send('Emulation.setDeviceMetricsOverride', {
      width,
      height,
      deviceScaleFactor: 2.4,
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
            const imgs = Array.from(document.querySelectorAll('img'));
            imgs.forEach(img => {
              if (img.loading === 'lazy') img.loading = 'eager';
              if (img.decoding === 'async') img.decoding = 'sync';
            });

            if (${JSON.stringify(customCSS)}) {
              const style = document.createElement('style');
              style.textContent = ${JSON.stringify(customCSS)};
              document.head.appendChild(style);
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
      if (evalRes?.result?.result?.value?.allLoaded && i >= 6) break;
    }

    await new Promise(r => setTimeout(r, 800));

    const screenshot = await send('Page.captureScreenshot', {
      format: 'png',
      quality: 100,
      clip: { x: 0, y: 0, width, height, scale: 2.4 }
    });
    const rawBuffer = Buffer.from(screenshot.result.data, 'base64');

    const outPath = path.resolve(`artifacts/food-mobile-${name}.png`);
    await sharp(rawBuffer)
      .resize(1080, 1350, { fit: 'cover', position: 'top' })
      .png()
      .toFile(outPath);

    console.log(`Gerado: ${outPath}`);
    try { ws.close(); } catch {}
  } finally {
    try {
      const { execSync } = await import('node:child_process');
      execSync(`taskkill /pid ${chromeProc.pid} /T /F`, { stdio: 'ignore' });
    } catch {}
  }
}

async function run() {
  // Option 1: Scroll to products directly
  // The user sees the category tabs at top + full product cards
  await testMobile({
    name: 'scroll-products',
    scrollY: 320,
    customCSS: `
      .public-topbar { display: none !important; }
      .search-box { display: none !important; }
      .category-rail { position: sticky; top: 0; z-index: 100; background: #fff; padding: 10px 16px; border-bottom: 1px solid #e2e8f0; }
    `
  });

  // Option 2: Compact hero banner + 4 food products in 2-col grid
  await testMobile({
    name: 'compact-hero-food-grid',
    scrollY: 0,
    customCSS: `
      .public-topbar { display: none !important; }
      .store-cover { height: 90px !important; }
      .store-summary { padding: 8px 16px !important; margin-top: -24px !important; background: #fff !important; }
      .store-logo { width: 44px !important; height: 44px !important; border: 2px solid #fff !important; }
      .store-copy h1 { font-size: 1.15rem !important; margin: 2px 0 !important; }
      #storeDescription { display: none !important; }
      .store-meta { font-size: 0.72rem !important; margin-top: 2px !important; }
      .search-box, .feed-toolbar { display: none !important; }
      .category-rail { padding: 4px 16px !important; }
      .category-list { display: flex !important; flex-direction: row !important; gap: 6px !important; }
      .category-list button { padding: 4px 12px !important; font-size: 0.75rem !important; }
      .featured-strip { display: grid !important; grid-template-columns: 1fr 1fr !important; gap: 8px !important; padding: 8px 16px !important; }
      .featured-product { border-radius: 12px !important; overflow: hidden !important; border: 1px solid #e2e8f0 !important; background: #fff !important; }
      .featured-product img { height: 110px !important; width: 100% !important; object-fit: cover !important; }
      .featured-product div { padding: 8px !important; }
      .featured-product strong { font-size: 0.78rem !important; display: -webkit-box !important; -webkit-line-clamp: 2 !important; -webkit-box-orient: vertical !important; overflow: hidden !important; }
      .featured-product span { font-size: 0.9rem !important; font-weight: 800 !important; color: #0f766e !important; }
    `
  });

  // Option 3: Clean list view with big dish cards
  await testMobile({
    name: 'dish-list-view',
    scrollY: 0,
    customCSS: `
      .public-topbar { display: none !important; }
      .store-cover { height: 80px !important; }
      .store-summary { padding: 8px 16px !important; margin-top: -20px !important; background: #fff !important; }
      .store-logo { width: 40px !important; height: 40px !important; }
      .store-copy h1 { font-size: 1.1rem !important; margin: 0 !important; }
      #storeDescription { display: none !important; }
      .search-box, .feed-toolbar, .featured-strip { display: none !important; }
      .category-rail { padding: 4px 16px !important; }
      .category-list { display: flex !important; flex-direction: row !important; gap: 6px !important; }
      .category-list button { padding: 4px 12px !important; font-size: 0.75rem !important; }
      .product-row { margin: 0 16px 8px !important; padding: 8px 12px !important; display: flex !important; align-items: center !important; justify-content: space-between !important; background: #fff !important; border-radius: 12px !important; border: 1px solid #e2e8f0 !important; }
      .product-row .product-info h3 { font-size: 0.85rem !important; margin: 0 0 2px !important; }
      .product-row .product-info p { font-size: 0.7rem !important; color: #64748b !important; margin: 0 0 2px !important; display: -webkit-box !important; -webkit-line-clamp: 2 !important; -webkit-box-orient: vertical !important; overflow: hidden !important; }
      .product-row .product-info strong { font-size: 0.85rem !important; color: #0f766e !important; }
      .product-row .add-product img { width: 68px !important; height: 68px !important; border-radius: 8px !important; object-fit: cover !important; }
      .product-row .favorite-button { display: none !important; }
    `
  });
}

run().catch(console.error);

