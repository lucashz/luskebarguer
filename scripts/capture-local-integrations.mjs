import { mkdir, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';

const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const port = 9333;
const chrome = spawn(chromePath, [
  '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
  `--remote-debugging-port=${port}`, '--window-size=1600,1000',
  '--user-data-dir=' + process.env.TEMP + '\\tapronto-capture-profile',
  'about:blank'
], { stdio: 'ignore' });

try {
  const target = await waitForTarget();
  const cdp = connect(target.webSocketDebuggerUrl);
  await cdp.ready;
  await cdp.send('Page.enable');
  await cdp.send('Runtime.enable');
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1600, height: 1000, deviceScaleFactor: 1, mobile: false });
  await cdp.send('Page.navigate', { url: 'http://127.0.0.1:3000/painel' });
  await wait(1800);
  await cdp.send('Runtime.evaluate', {
    expression: `(async()=>{await fetch('/api/admin/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:'admin@cardapio.local',password:'12345678'})});location.reload()})()`,
    awaitPromise: true
  });
  await wait(2600);
  await cdp.send('Runtime.evaluate', {
    expression: `document.querySelector('[data-admin-tab="integrations"]')?.click()`,
    returnByValue: true
  });
  await wait(2600);
  const layout = await cdp.send('Page.getLayoutMetrics');
  const height = Math.min(1800, Math.max(1000, Math.ceil(layout.cssContentSize?.height || 1000)));
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1600, height, deviceScaleFactor: 1, mobile: false });
  await wait(500);
  const shot = await cdp.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true, fromSurface: true });
  await mkdir(new URL('../artifacts/', import.meta.url), { recursive: true });
  await writeFile(new URL('../artifacts/integracoes-local.png', import.meta.url), Buffer.from(shot.data, 'base64'));
  cdp.close();
  console.log('artifacts/integracoes-local.png');
} finally {
  chrome.kill();
}

async function waitForTarget() {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    try {
      const targets = await fetch(`http://127.0.0.1:${port}/json`).then((response) => response.json());
      const page = targets.find((entry) => entry.type === 'page');
      if (page) return page;
    } catch {}
    await wait(250);
  }
  throw new Error('Chrome headless não iniciou.');
}

function connect(url) {
  const socket = new WebSocket(url);
  let sequence = 0;
  const pending = new Map();
  const ready = new Promise((resolve, reject) => {
    socket.addEventListener('open', resolve, { once: true });
    socket.addEventListener('error', reject, { once: true });
  });
  socket.addEventListener('message', (event) => {
    const message = JSON.parse(event.data);
    if (!message.id || !pending.has(message.id)) return;
    const { resolve, reject } = pending.get(message.id);
    pending.delete(message.id);
    if (message.error) reject(new Error(message.error.message)); else resolve(message.result || {});
  });
  return {
    ready,
    send(method, params = {}) {
      const id = ++sequence;
      socket.send(JSON.stringify({ id, method, params }));
      return new Promise((resolve, reject) => pending.set(id, { resolve, reject }));
    },
    close() { socket.close(); }
  };
}

function wait(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }
