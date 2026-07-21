import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, statSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const port = Number(process.env.VISUAL_SMOKE_PORT || 3607 + Math.floor(Math.random() * 400));
const baseUrl = `http://127.0.0.1:${port}`;
const outDir = resolve('.tmp/visual-smoke');
const chromePath = findChrome();

if (!chromePath) {
  console.error('Chrome, Edge ou Firefox nao encontrado para smoke visual.');
  process.exit(1);
}

mkdirSync(outDir, { recursive: true });

let serverProcess = null;

try {
  serverProcess = await startServer();
  const pages = [
    ['home-desktop.png', '/', '1366,900'],
    ['home-mobile.png', '/', '390,844'],
    ['cadastro-desktop.png', '/cadastro', '1366,900'],
    ['cardapio-desktop.png', '/cardapio', '1366,900'],
    ['cardapio-mobile.png', '/cardapio', '390,844']
  ];

  for (const [file, path, size] of pages) {
    const screenshotPath = resolve(outDir, file);
    await runBrowserScreenshot(`${baseUrl}${path}`, screenshotPath, size);
    const bytes = statSync(screenshotPath).size;
    assert(bytes > 5000, `${file} parece vazio ou pequeno demais (${bytes} bytes).`);
    console.log(`${file}: ${bytes} bytes`);
  }

  console.log(`Smoke visual gerado em ${outDir}`);
} finally {
  if (serverProcess) {
    serverProcess.kill();
    await new Promise((resolveDone) => serverProcess.once('exit', resolveDone));
  }
}

function findChrome() {
  const candidates = [
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
    'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
  ];
  return candidates.find((entry) => existsSync(entry)) || '';
}

async function startServer() {
  const child = spawn(process.execPath, ['server.js'], {
    env: {
      ...process.env,
      HOST: '127.0.0.1',
      PORT: String(port),
      APP_URL: baseUrl,
      PUBLIC_APP_URL: baseUrl
    },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  let logs = '';
  child.stdout.on('data', (chunk) => { logs += chunk.toString(); });
  child.stderr.on('data', (chunk) => { logs += chunk.toString(); });
  for (let attempt = 0; attempt < 80; attempt += 1) {
    if (child.exitCode !== null) throw new Error(`Servidor encerrou durante o boot.\n${logs}`);
    try {
      const response = await fetch(`${baseUrl}/api/health`);
      if (response.ok) return child;
    } catch {
      // Aguarda o servidor subir.
    }
    await delay(250);
  }
  child.kill();
  throw new Error(`Servidor nao respondeu em ${baseUrl}.\n${logs}`);
}

function runBrowserScreenshot(url, screenshotPath, windowSize) {
  mkdirSync(dirname(screenshotPath), { recursive: true });
  return new Promise((resolveDone, reject) => {
    const child = spawn(chromePath, [
      '--headless=new',
      '--disable-gpu',
      '--hide-scrollbars',
      `--window-size=${windowSize}`,
      '--virtual-time-budget=3000',
      `--screenshot=${screenshotPath}`,
      url
    ], { stdio: ['ignore', 'pipe', 'pipe'] });
    let logs = '';
    child.stdout.on('data', (chunk) => { logs += chunk.toString(); });
    child.stderr.on('data', (chunk) => { logs += chunk.toString(); });
    child.once('exit', (code) => {
      if (code === 0) resolveDone();
      else reject(new Error(`Browser falhou em ${url} com codigo ${code}.\n${logs}`));
    });
  });
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function delay(ms) {
  return new Promise((resolveDone) => setTimeout(resolveDone, ms));
}
