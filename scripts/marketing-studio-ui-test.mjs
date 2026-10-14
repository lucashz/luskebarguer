import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import { createStudioServer } from '../src/lib/marketing-studio-server.js';

const chrome = [process.env.CHROME_PATH, 'C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].filter(Boolean).find(existsSync);
if (!chrome) throw new Error('Configure CHROME_PATH para executar o teste de navegador.');
const temp = await mkdtemp(path.join(os.tmpdir(), 'studio-ui-'));
const profile = path.join(temp, 'browser');
const app = await createStudioServer({ env: { NODE_ENV: 'development', STUDIO_DEV_ENABLED: 'true' }, organizations: ['clinica-demo'], root: path.join(temp, 'data'), config: { provider: 'local', apiKey: 'test-only' }, captionRequest: async () => 'Um espaço pensado para acolher você. Conheça a Clínica Bela e fale com nossa equipe. #ClínicaBela' });
let browser; let socket; let browserExit;
const pending = new Map(); let callId = 0; const errors = [];
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function call(method, params = {}) {
  const id = ++callId;
  return new Promise((resolve, reject) => { const timeout = setTimeout(() => { pending.delete(id); reject(new Error(`CDP timeout: ${method}`)); }, 15_000); pending.set(id, { resolve: (value) => { clearTimeout(timeout); resolve(value); }, reject: (error) => { clearTimeout(timeout); reject(error); } }); socket.send(JSON.stringify({ id, method, params })); });
}
async function evaluate(expression) {
  const response = await call('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
  if (response.exceptionDetails) throw new Error(JSON.stringify(response.exceptionDetails));
  return response.result?.value;
}
async function wait(expression) {
  for (let i = 0; i < 80; i++) { if (await evaluate(expression)) return; await delay(100); }
  throw new Error(`Espera esgotada: ${expression}. Estado: ${await evaluate("document.querySelector('#status')?.textContent")}`);
}
try {
  const origin = await app.listen(0);
  browser = spawn(chrome, ['--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--remote-debugging-port=0', `--user-data-dir=${profile}`, 'about:blank'], { stdio: 'ignore', windowsHide: true });
  browserExit = new Promise((resolve) => browser.once('exit', resolve));
  let port;
  for (let i = 0; i < 100; i++) { try { port = (await readFile(path.join(profile, 'DevToolsActivePort'), 'utf8')).split('\n')[0]; break; } catch { await delay(100); } }
  if (!port) throw new Error('Chrome não iniciou.');
  const target = await (await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: 'PUT' })).json();
  socket = new WebSocket(target.webSocketDebuggerUrl);
  socket.onmessage = (event) => { const data = JSON.parse(event.data); if (data.method === 'Runtime.exceptionThrown') errors.push(data.params); if (!data.id) return; const task = pending.get(data.id); if (!task) return; pending.delete(data.id); data.error ? task.reject(new Error(data.error.message)) : task.resolve(data.result); };
  await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject; });
  await call('Runtime.enable'); await call('Page.enable');
  await call('Emulation.setDeviceMetricsOverride', { width: 1365, height: 1000, deviceScaleFactor: 1, mobile: false });
  await call('Page.navigate', { url: app.developmentLink('clinica-demo') });
  await wait("document.querySelector('#workspace')?.hidden === false && !document.querySelector('#createButton').disabled");
  assert.equal(await evaluate('location.hash'), '');
  await evaluate("document.querySelector('#brandForm').elements.name.value='Clínica Bela'; document.querySelector('#brandForm').elements.contact.value='@clinicabela'; document.querySelector('#brandForm').requestSubmit()");
  await wait("document.querySelector('#status').textContent==='Identidade salva.'");
  const reference = path.join(temp, 'referencia.png');
  await sharp({ create: { width: 800, height: 600, channels: 3, background: '#c7d4bf' } }).png().toFile(reference);
  const { root } = await call('DOM.getDocument'); const { nodeId } = await call('DOM.querySelector', { nodeId: root.nodeId, selector: '#upload' });
  await call('DOM.setFileInputFiles', { nodeId, files: [reference] });
  await wait("document.querySelector('#status').textContent==='Imagem adicionada e selecionada como referência.'");
  assert.equal(await evaluate("document.querySelector('#references input')?.checked"), true);
  await evaluate("document.querySelector('#references input').click(); document.querySelector('#createForm').elements.subject.value='Conheça nosso espaço de cuidado'; document.querySelector('#createForm').requestSubmit(); document.querySelector('#createForm').requestSubmit()");
  await wait("document.querySelector('#editor').hidden === false && document.querySelector('#caption').value.includes('acolher') && !document.querySelector('#createButton').disabled");
  assert.equal((await app.store.snapshot('clinica-demo')).usage.images, 1);
  await evaluate("document.querySelector('#caption').value='Legenda revisada por mim.'; document.querySelector('#caption').dispatchEvent(new Event('input')); document.querySelector('#captionForm').requestSubmit()");
  await wait("document.querySelector('#status').textContent==='Legenda salva. A imagem continua a mesma.'");
  await evaluate("document.querySelector('#adjustForm').elements.adjustment.value='clarear'; document.querySelector('#adjustForm').requestSubmit()");
  await wait("document.querySelector('#versions').options.length===2 && !document.querySelector('#createButton').disabled");
  assert.equal(await evaluate("document.querySelector('#caption').value"), '');
  await evaluate("document.querySelector('#versions').selectedIndex=0; document.querySelector('#versions').dispatchEvent(new Event('change'))");
  await wait("document.querySelector('#caption').value==='Legenda revisada por mim.' && !document.querySelector('#createButton').disabled");
  const finalState = await app.store.snapshot('clinica-demo'); assert.equal(finalState.usage.images, 2); assert.equal(finalState.usage.captions, 1);
  assert.equal(await evaluate("fetch(document.querySelector('#download').href).then(r=>r.status)"), 200);
  assert.equal(await evaluate('document.documentElement.scrollWidth <= innerWidth'), true);
  const artifacts = new URL('../.tmp/studio-preview/', import.meta.url); await mkdir(artifacts, { recursive: true });
  const desktop = await call('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true }); await writeFile(new URL('desktop.png', artifacts), Buffer.from(desktop.data, 'base64'));
  await call('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await delay(100); assert.equal(await evaluate('document.documentElement.scrollWidth <= innerWidth'), true);
  const mobile = await call('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true }); await writeFile(new URL('mobile.png', artifacts), Buffer.from(mobile.data, 'base64'));
  await evaluate('window.__beforeReload = true');
  await call('Page.reload'); await wait("!window.__beforeReload && document.querySelector('#history button') && !document.querySelector('#createButton').disabled");
  await evaluate("document.querySelector('#history button').click()");
  await wait("document.querySelector('#editor').hidden===false && !document.querySelector('#createButton').disabled");
  assert.equal(await evaluate("document.querySelector('#versions').options.length"), 2);
  assert.equal(errors.length, 0, JSON.stringify(errors));
  console.log('Studio UI: marca, upload, clique duplo, geração, legenda, ajuste, versões, download, reload e layout desktop/mobile OK.');
  console.log(`Capturas: ${new URL('../.tmp/studio-preview/', import.meta.url).pathname}`);
} finally {
  socket?.close(); if (browser && browser.exitCode === null) browser.kill(); if (browserExit) await browserExit;
  await app.close();
  // This path was returned by mkdtemp and belongs exclusively to this test.
  await rm(temp, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
}
