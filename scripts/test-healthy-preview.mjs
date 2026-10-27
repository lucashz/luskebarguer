import path from 'node:path';
import { spawn } from 'node:child_process';
import sharp from 'sharp';

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

async function generateHealthyMobilePreview({ url, outputPath }) {
  const port = 9520;
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

    // Phone viewport: 430px x 780px. Ratio 430:780 is ~ 1:1.8
    // With 2.5 deviceScaleFactor => 1075 x 1950, or clipped/scaled to 1080x1350
    const viewWidth = 430;
    const viewHeight = 780;

    await send('Emulation.setDeviceMetricsOverride', {
      width: viewWidth,
      height: viewHeight,
      deviceScaleFactor: 2.5,
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

            // Inject presentation CSS for healthy mobile demo
            const styleId = 'healthy-outreach-style';
            if (!document.getElementById(styleId)) {
              const style = document.createElement('style');
              style.id = styleId;
              style.textContent = \`
                /* Hide generic customer topbar */
                .public-topbar { display: none !important; }

                /* Modern compact hero banner */
                .store-cover {
                  height: 110px !important;
                  min-height: 110px !important;
                }
                .store-summary {
                  padding: 10px 16px 12px !important;
                  margin-top: -32px !important;
                  position: relative !important;
                  background: #fff !important;
                  border-radius: 20px 20px 0 0 !important;
                  box-shadow: 0 -4px 16px rgba(0,0,0,0.06) !important;
                }
                .store-logo {
                  width: 54px !important;
                  height: 54px !important;
                  border: 3px solid #fff !important;
                  box-shadow: 0 4px 10px rgba(0,0,0,0.12) !important;
                }
                .store-copy h1 {
                  font-size: 1.25rem !important;
                  margin: 3px 0 2px !important;
                  font-weight: 800 !important;
                  color: #0f172a !important;
                }
                .store-copy #storeDescription {
                  font-size: 0.8rem !important;
                  color: #64748b !important;
                  margin: 2px 0 6px !important;
                  display: -webkit-box !important;
                  -webkit-line-clamp: 2 !important;
                  -webkit-box-orient: vertical !important;
                  overflow: hidden !important;
                }
                .store-meta {
                  display: flex !important;
                  gap: 8px !important;
                  font-size: 0.78rem !important;
                  font-weight: 600 !important;
                }

                /* Compact category rail */
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
                  overflow-x: auto !important;
                  gap: 8px !important;
                  padding: 4px 0 !important;
                }
                .category-list button {
                  padding: 6px 14px !important;
                  border-radius: 99px !important;
                  font-size: 0.8rem !important;
                  white-space: nowrap !important;
                  border: 1px solid #e2e8f0 !important;
                  background: #fff !important;
                  color: #334155 !important;
                  font-weight: 700 !important;
                }
                .category-list button.active {
                  background: #0f766e !important;
                  color: #fff !important;
                  border-color: #0f766e !important;
                }

                /* Featured Products: Gorgeous 2-column food showcase */
                .featured-strip {
                  display: grid !important;
                  grid-template-columns: repeat(2, 1fr) !important;
                  gap: 10px !important;
                  padding: 12px 16px !important;
                }
                .featured-product {
                  border-radius: 14px !important;
                  overflow: hidden !important;
                  background: #fff !important;
                  box-shadow: 0 4px 12px rgba(0,0,0,0.05) !important;
                  border: 1px solid #e2e8f0 !important;
                  margin: 0 !important;
                }
                .featured-product img {
                  height: 105px !important;
                  width: 100% !important;
                  object-fit: cover !important;
                }
                .featured-product div {
                  padding: 8px 10px 10px !important;
                }
                .featured-product strong {
                  font-size: 0.82rem !important;
                  line-height: 1.25 !important;
                  display: -webkit-box !important;
                  -webkit-line-clamp: 2 !important;
                  -webkit-box-orient: vertical !important;
                  overflow: hidden !important;
                  margin-bottom: 4px !important;
                  color: #1e293b !important;
                }
                .featured-product span {
                  font-size: 0.95rem !important;
                  font-weight: 800 !important;
                  color: #0f766e !important;
                }

                /* Product rows below */
                .menu-section-header {
                  padding: 8px 16px 4px !important;
                  font-size: 0.95rem !important;
                  font-weight: 800 !important;
                  color: #0f172a !important;
                }
                .product-row {
                  margin: 0 16px 8px !important;
                  padding: 10px 12px !important;
                  background: #fff !important;
                  border-radius: 14px !important;
                  box-shadow: 0 2px 8px rgba(0,0,0,0.04) !important;
                  border: 1px solid #e2e8f0 !important;
                  display: flex !important;
                  align-items: center !important;
                  justify-content: space-between !important;
                }
                .product-row .product-info h3 {
                  font-size: 0.88rem !important;
                  margin: 0 0 2px !important;
                  font-weight: 700 !important;
                }
                .product-row .product-info p {
                  font-size: 0.74rem !important;
                  color: #64748b !important;
                  margin: 0 0 4px !important;
                  line-height: 1.25 !important;
                  display: -webkit-box !important;
                  -webkit-line-clamp: 2 !important;
                  -webkit-box-orient: vertical !important;
                  overflow: hidden !important;
                }
                .product-row .product-info strong {
                  font-size: 0.9rem !important;
                  color: #0f766e !important;
                  font-weight: 800 !important;
                }
                .product-row .add-product img {
                  width: 72px !important;
                  height: 72px !important;
                  border-radius: 10px !important;
                  object-fit: cover !important;
                }
                .product-row .favorite-button { display: none !important; }
              \`;
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

    // Capture the 430 x 780 screen
    const screenshot = await send('Page.captureScreenshot', {
      format: 'png',
      quality: 100,
      clip: { x: 0, y: 0, width: viewWidth, height: 537.5, scale: 2.51 } // 430 x 537.5 * 2.51 = 1080 x 1350
    });
    const rawBuffer = Buffer.from(screenshot.result.data, 'base64');

    await sharp(rawBuffer)
      .resize(1080, 1350, { fit: 'cover', position: 'top' })
      .png()
      .toFile(outputPath);

    console.log(`✅ Visualização saudável gerada com sucesso: ${outputPath}`);
    try { ws.close(); } catch {}
  } finally {
    try {
      const { execSync } = await import('node:child_process');
      execSync(`taskkill /pid ${chromeProc.pid} /T /F`, { stdio: 'ignore' });
    } catch {}
  }
}

async function main() {
  const out = path.resolve('artifacts/test-healthy-refugio.png');
  await generateHealthyMobilePreview({
    url: 'https://taprontomenu.com.br/refugio-gourmet',
    outputPath: out
  });
}

main().catch(console.error);

