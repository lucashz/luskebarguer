import path from 'node:path';
import { spawn } from 'node:child_process';
import sharp from 'sharp';

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

export async function generateHealthyMobile({ url, outputPath }) {
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

    // 440px width x 550px height (ratio 4:5 exactly!) with 2.4545 scale => 1080 x 1350
    const width = 440;
    const height = 550;

    await send('Emulation.setDeviceMetricsOverride', {
      width,
      height,
      deviceScaleFactor: 2.454545,
      mobile: true
    });
    await send('Emulation.setUserAgentOverride', {
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1'
    });

    await send('Page.navigate', { url });

    const presentationCSS = `
      /* Top bar cleanup */
      .public-topbar { display: none !important; }

      /* Compact appetizing hero banner */
      .store-cover {
        height: 120px !important;
        min-height: 120px !important;
      }
      .store-summary {
        display: block !important;
        padding: 10px 16px 12px !important;
        margin-top: -24px !important;
        position: relative !important;
        background: #fff !important;
        border-radius: 20px 20px 0 0 !important;
        box-shadow: 0 -4px 16px rgba(0,0,0,0.06) !important;
      }
      .store-logo:empty, .store-logo:not([style*="background-image"]) {
        display: none !important;
      }
      .store-copy h1 {
        font-size: 1.25rem !important;
        margin: 2px 0 3px !important;
        font-weight: 800 !important;
        color: #0f172a !important;
      }
      #storeDescription {
        font-size: 0.78rem !important;
        color: #64748b !important;
        margin: 0 0 6px !important;
        display: -webkit-box !important;
        -webkit-line-clamp: 1 !important;
        -webkit-box-orient: vertical !important;
        overflow: hidden !important;
      }
      .store-meta {
        display: flex !important;
        gap: 8px !important;
        font-size: 0.76rem !important;
        font-weight: 600 !important;
      }

      /* Clean categories */
      .search-box, .feed-toolbar { display: none !important; }
      .category-rail {
        padding: 6px 16px !important;
        background: #f8fafc !important;
        border-top: 1px solid #f1f5f9 !important;
        border-bottom: 1px solid #f1f5f9 !important;
      }
      .category-list {
        display: flex !important;
        flex-direction: row !important;
        gap: 6px !important;
      }
      .category-list button {
        padding: 5px 12px !important;
        font-size: 0.76rem !important;
        border-radius: 99px !important;
        font-weight: 700 !important;
      }

      /* Prominent 2-column food showcase with crisp photos and prices */
      .featured-strip {
        display: grid !important;
        grid-template-columns: 1fr 1fr !important;
        gap: 10px !important;
        padding: 10px 16px !important;
      }
      .featured-product {
        display: flex !important;
        flex-direction: column !important;
        height: auto !important;
        min-height: 0 !important;
        border-radius: 14px !important;
        overflow: hidden !important;
        border: 1px solid #e2e8f0 !important;
        background: #fff !important;
        box-shadow: 0 3px 8px rgba(0,0,0,0.05) !important;
      }
      .featured-product img {
        height: 110px !important;
        width: 100% !important;
        object-fit: cover !important;
        display: block !important;
      }
      .featured-product div {
        padding: 8px 10px 10px !important;
        display: flex !important;
        flex-direction: column !important;
        gap: 4px !important;
      }
      .featured-product strong {
        font-size: 0.82rem !important;
        line-height: 1.22 !important;
        display: -webkit-box !important;
        -webkit-line-clamp: 2 !important;
        -webkit-box-orient: vertical !important;
        overflow: hidden !important;
        color: #1e293b !important;
        font-weight: 750 !important;
      }
      .featured-product span {
        font-size: 0.95rem !important;
        font-weight: 800 !important;
        color: #0f766e !important;
        margin-top: 2px !important;
      }

      /* Clean section titles & rows */
      .menu-sections {
        padding-top: 4px !important;
      }
      .product-section .section-title {
        padding: 4px 16px !important;
      }
      .product-section .section-title h2 {
        font-size: 1rem !important;
        font-weight: 800 !important;
        color: #0f172a !important;
      }
      .product-section .section-title p {
        display: none !important;
      }
    `;

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

            if (!document.getElementById('healthy-mobile-css')) {
              const style = document.createElement('style');
              style.id = 'healthy-mobile-css';
              style.textContent = ${JSON.stringify(presentationCSS)};
              document.head.appendChild(style);
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

    const screenshot = await send('Page.captureScreenshot', {
      format: 'png',
      quality: 100,
      clip: { x: 0, y: 0, width, height, scale: 2.454545 }
    });
    const rawBuffer = Buffer.from(screenshot.result.data, 'base64');

    await sharp(rawBuffer)
      .resize(1080, 1350, { fit: 'cover', position: 'top' })
      .png()
      .toFile(outputPath);

    console.log(`✅ Nova prévia mobile saudável gerada: ${outputPath}`);
    try { ws.close(); } catch {}
  } finally {
    try {
      const { execSync } = await import('node:child_process');
      execSync(`taskkill /pid ${chromeProc.pid} /T /F`, { stdio: 'ignore' });
    } catch {}
  }
}

async function run() {
  const outPath = path.resolve('artifacts/outreach/vip/refugio-gourmet/menu-preview-mobile.png');
  await generateHealthyMobile({
    url: 'https://taprontomenu.com.br/refugio-gourmet',
    outputPath: outPath
  });
}

run().catch(console.error);

