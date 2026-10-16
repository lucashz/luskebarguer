import { mkdir } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { join } from 'node:path';

const OUTPUT_DIR = '/app/artifacts/outreach/automated/frank-preview';
await mkdir(OUTPUT_DIR, { recursive: true });

async function captureUrl({ url, outputPath, width, height }) {
  const profile = join(OUTPUT_DIR, `.chrome-${width}x${height}`);
  await mkdir(profile, { recursive: true });

  await new Promise((resolvePromise, reject) => {
    const child = spawn('/usr/bin/chromium', [
      '--headless=new',
      '--no-sandbox',
      '--disable-gpu',
      '--disable-dev-shm-usage',
      '--disable-crash-reporter',
      '--disable-breakpad',
      '--hide-scrollbars',
      '--no-first-run',
      '--no-default-browser-check',
      `--window-size=${width},${height}`,
      `--user-data-dir=${profile}`,
      `--screenshot=${outputPath}`,
      url
    ], {
      stdio: ['ignore', 'ignore', 'pipe'],
      env: { ...process.env, HOME: profile, XDG_CONFIG_HOME: profile, XDG_CACHE_HOME: profile }
    });

    let errors = '';
    child.stderr.on('data', chunk => { errors += chunk.toString(); });
    child.on('error', reject);
    child.on('exit', code => code === 0 ? resolvePromise() : reject(new Error(`Exit code ${code}: ${errors}`)));
  });
}

async function main() {
  console.log('Gerando prévia desktop para Panificadora Frank...');
  const desktopPath = `${OUTPUT_DIR}/menu-preview.png`;
  await captureUrl({
    url: 'https://taprontomenu.com.br/frank',
    outputPath: desktopPath,
    width: 1280,
    height: 800
  });
  console.log('Prévia desktop gerada:', desktopPath);

  console.log('Gerando prévia mobile para Panificadora Frank...');
  const mobilePath = `${OUTPUT_DIR}/menu-preview-mobile.png`;
  await captureUrl({
    url: 'https://taprontomenu.com.br/frank',
    outputPath: mobilePath,
    width: 390,
    height: 844
  });
  console.log('Prévia mobile gerada:', mobilePath);
}

main().catch(err => {
  console.error('Erro ao gerar screenshots:', err);
  process.exit(1);
});

