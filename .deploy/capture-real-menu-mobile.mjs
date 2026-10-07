import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const chrome = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe'
].find(existsSync);
if (!chrome) throw new Error('Chrome ou Edge não encontrado.');

const output = 'C:/Users/Lucas/Desktop/tapronto-cardapio-mobile-real.png';
const profile = mkdtempSync(join(tmpdir(), 'tapronto-menu-shot-'));
const debugPort = 9530 + Math.floor(Math.random() * 200);
const browser = spawn(chrome, [
  '--headless=new', '--disable-gpu', '--hide-scrollbars', '--no-first-run',
  `--remote-debugging-port=${debugPort}`, `--user-data-dir=${profile}`, 'about:blank'
], { stdio: 'ignore', windowsHide: true });

try {
  await waitFor(`http://127.0.0.1:${debugPort}/json/version`);
  const target = await (await fetch(`http://127.0.0.1:${debugPort}/json/new?${encodeURIComponent('https://taprontomenu.com.br/cardapio')}`, { method: 'PUT' })).json();
  const cdp = connect(target.webSocketDebuggerUrl);
  await cdp.ready;
  await cdp.call('Page.enable');
  await cdp.call('Runtime.enable');
  await cdp.call('Emulation.setDeviceMetricsOverride', {
    width: 390,
    height: 844,
    deviceScaleFactor: 2,
    mobile: true,
    screenWidth: 390,
    screenHeight: 844
  });
  await cdp.call('Page.navigate', { url: 'https://taprontomenu.com.br/cardapio' });
  await delay(5000);
  await cdp.call('Runtime.evaluate', {
    expression: `(() => {
      document.querySelector('#closedStoreDialog')?.close?.();
      const target = document.querySelector('.menu-feed');
      if (target) scrollTo(0, Math.max(0, target.getBoundingClientRect().top + scrollY - 12));
      const bag = document.querySelector('.mobile-bag');
      if (bag) bag.style.display = 'none';
    })()`
  });
  await delay(1800);
  const shot = await cdp.call('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false, fromSurface: true });
  writeFileSync(output, Buffer.from(shot.data, 'base64'));
  cdp.close();
  console.log(output);
} finally {
  browser.kill();
  rmSync(profile, { recursive: true, force: true });
}

function connect(url) {
  const socket = new WebSocket(url);
  let id = 0;
  const pending = new Map();
  socket.onmessage = (event) => {
    const message = JSON.parse(event.data);
    if (!message.id) return;
    const task = pending.get(message.id);
    if (!task) return;
    pending.delete(message.id);
    message.error ? task.reject(new Error(message.error.message)) : task.resolve(message.result || {});
  };
  return {
    ready: new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject; }),
    call(method, params = {}) {
      const callId = ++id;
      socket.send(JSON.stringify({ id: callId, method, params }));
      return new Promise((resolve, reject) => pending.set(callId, { resolve, reject }));
    },
    close() { socket.close(); }
  };
}

async function waitFor(url) {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try { if ((await fetch(url)).ok) return; } catch {}
    await delay(250);
  }
  throw new Error('Chrome headless não iniciou.');
}

function delay(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }
