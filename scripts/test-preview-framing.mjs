import sharp from 'sharp';
import { spawn } from 'node:child_process';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

async function captureChrome({ url, outputPath, windowSize, isMobile, chromePath = '/usr/bin/chromium' }) {
  const profile = await mkdtemp(join(tmpdir(), 'chrome-test-'));
  const chromeArgs = [
    '--headless=new',
    '--no-sandbox',
    '--disable-gpu',
    '--disable-dev-shm-usage',
    '--hide-scrollbars',
    '--no-first-run',
    `--window-size=${windowSize}`,
    `--user-data-dir=${profile}`,
    '--virtual-time-budget=4000',
    `--screenshot=${outputPath}`,
    url
  ];
  if (isMobile) {
    chromeArgs.push('--user-agent=Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36');
  }

  return new Promise((resolve, reject) => {
    const child = spawn(chromePath, chromeArgs);
    child.on('exit', (code) => code === 0 ? resolve() : reject(new Error(`Exit ${code}`)));
  });
}

async function main() {
  const testUrl = 'https://taprontomenu.com.br/pizzaria-em-dois-corregos-rodizi';
  const dir = await mkdtemp(join(tmpdir(), 'preview-test-'));
  console.log(`Testando capturas em ${dir}...`);

  // 1. Desktop nativo 1080x1350 (renderizado sem corte pelo Chromium)
  const desktopDirect = join(dir, 'desktop-direct.png');
  await captureChrome({ url: testUrl, outputPath: desktopDirect, windowSize: '1080,1350', isMobile: false });
  const metaDirect = await sharp(desktopDirect).metadata();
  console.log('Desktop 1080x1350 direto:', metaDirect.width, 'x', metaDirect.height);

  // 2. Mobile 412x915 com contain em 1080x1350 (fundo limpo, nada cortado)
  const mobileRaw = join(dir, 'mobile-raw.png');
  await captureChrome({ url: testUrl, outputPath: mobileRaw, windowSize: '412,915', isMobile: true });
  const mobileFinal = join(dir, 'mobile-framed.png');
  const rawMobileBuf = await readFile(mobileRaw);
  await sharp(rawMobileBuf)
    .resize(1080, 1350, {
      fit: 'contain',
      background: { r: 248, g: 250, b: 252, alpha: 1 } // #f8fafc elegante
    })
    .png()
    .toFile(mobileFinal);

  const metaMobile = await sharp(mobileFinal).metadata();
  console.log('Mobile contain 1080x1350:', metaMobile.width, 'x', metaMobile.height);

  console.log('✅ Ambos gerados com sucesso sem cortar nada!');
}

main().catch(console.error);

