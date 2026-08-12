import { spawn } from 'node:child_process';
import { pbkdf2Sync, randomBytes } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import pg from 'pg';

loadEnv(new URL('../.env', import.meta.url));
if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL não configurada.');
const chrome = findChrome(); if (!chrome) throw new Error('Chrome ou Edge não encontrado.');
const port = 4700 + Math.floor(Math.random() * 200); const debugPort = port + 300;
const baseUrl = `http://127.0.0.1:${port}`; const profile = mkdtempSync(join(tmpdir(), 'tapronto-marketing-'));
const outputDir = resolve('artifacts/marketing-workspace'); mkdirSync(outputDir, { recursive: true });
const email = `visual-${Date.now()}@tapronto.local`; const password = randomBytes(24).toString('base64url');
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL }); let server; let browser; let adminId = '';

try {
  adminId = (await pool.query(`insert into admin_users(name,email,password_hash,role,is_active) values('Validação visual',$1,$2,'superadmin',true) returning id`, [email, hashPassword(password)])).rows[0].id;
  server = spawn(process.execPath, ['server.js'], { cwd: new URL('..', import.meta.url), env: { ...process.env, HOST: '127.0.0.1', PORT: String(port), APP_URL: baseUrl, PUBLIC_APP_URL: 'https://taprontomenu.com.br', COOKIE_SECURE: 'false', ADMIN_2FA_REQUIRED: 'false' }, stdio: ['ignore', 'pipe', 'pipe'] });
  await waitFor(`${baseUrl}/api/health`);
  browser = spawn(chrome, ['--headless=new', '--disable-gpu', '--hide-scrollbars', `--remote-debugging-port=${debugPort}`, `--user-data-dir=${profile}`, 'about:blank'], { stdio: 'ignore' });
  await waitFor(`http://127.0.0.1:${debugPort}/json/version`);
  const target = await (await fetch(`http://127.0.0.1:${debugPort}/json/new?${encodeURIComponent(`${baseUrl}/platform`)}`, { method: 'PUT' })).json();
  const cdp = createCdp(target.webSocketDebuggerUrl); await cdp.ready;
  await cdp.call('Page.enable'); await cdp.call('Runtime.enable'); await delay(1200);
  const login = await cdp.call('Runtime.evaluate', { awaitPromise: true, returnByValue: true, expression: `fetch('/api/admin/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:${JSON.stringify(email)},password:${JSON.stringify(password)}})}).then(async r=>({status:r.status,body:await r.text()}))` });
  const loginResult = login.result?.value || {}; if (loginResult.status !== 200) throw new Error(`Login visual falhou: ${loginResult.status} ${loginResult.body || ''}`);
  await cdp.call('Runtime.evaluate', { expression: `location.assign('/platform?view=marketing')` }); await delay(3500);
  await cdp.call('Runtime.evaluate', { expression: `document.querySelector('[data-platform-view="marketing"]')?.click()` }); await delay(2500);
  for (const [name, width, height] of [['desktop', 1440, 1100], ['mobile', 390, 844]]) {
    await cdp.call('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: width < 600 }); await delay(800);
    for (const tab of ['overview','calendar','contents','results','more']) {
      await cdp.call('Runtime.evaluate', { expression: `document.querySelector('[data-marketing-tab="${tab}"]')?.click(); scrollTo(0,0)` }); await delay(500);
      const shot = await cdp.call('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
      const file = resolve(outputDir, `marketing-${tab}-${name}.png`); writeFileSync(file, Buffer.from(shot.data, 'base64')); console.log(file);
    }
  }
  cdp.close();
} finally {
  browser?.kill(); server?.kill();
  if (adminId) await pool.query('delete from admin_users where id=$1', [adminId]).catch(() => {});
  await pool.end(); rmSync(profile, { recursive: true, force: true });
}

function createCdp(url) {
  const socket = new WebSocket(url); let id = 0; const pending = new Map();
  socket.onmessage = (event) => { const message = JSON.parse(event.data); if (!message.id) return; const task = pending.get(message.id); if (!task) return; pending.delete(message.id); message.error ? task.reject(new Error(message.error.message)) : task.resolve(message.result); };
  return { ready: new Promise((resolveReady, reject) => { socket.onopen = resolveReady; socket.onerror = reject; }), call(method, params = {}) { const callId = ++id; socket.send(JSON.stringify({ id: callId, method, params })); return new Promise((resolveCall, reject) => pending.set(callId, { resolve: resolveCall, reject })); }, close() { socket.close(); } };
}
function findChrome() { return ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(existsSync) || ''; }
async function waitFor(url) { for (let i = 0; i < 80; i += 1) { try { if ((await fetch(url)).ok) return; } catch {} await delay(250); } throw new Error(`Tempo esgotado: ${url}`); }
function delay(ms) { return new Promise((resolveDelay) => setTimeout(resolveDelay, ms)); }
function hashPassword(value) { const salt = randomBytes(16).toString('hex'); const iterations = 310000; return `pbkdf2_sha256$${iterations}$${salt}$${pbkdf2Sync(value, salt, iterations, 32, 'sha256').toString('hex')}`; }
function loadEnv(url) { if (!existsSync(url)) return; for (const line of readFileSync(url, 'utf8').split(/\r?\n/)) { const value = line.trim(); if (!value || value.startsWith('#') || !value.includes('=')) continue; const index = value.indexOf('='); const key = value.slice(0, index).trim(); if (!(key in process.env)) process.env[key] = value.slice(index + 1).trim().replace(/^['"]|['"]$/g, ''); } }
