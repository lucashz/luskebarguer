import { spawn } from 'node:child_process';
import path from 'node:path';
import sharp from 'sharp';

async function run() {
  const outputPath = path.resolve('artifacts/test-real-time.png');
  const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
  
  // Script that opens page, waits for all images to complete loading, then takes screenshot
  // Or in Chrome CLI: run with --run-all-compositor-stages-before-draw
  const chromeArgs = [
    '--headless=new',
    '--no-sandbox',
    '--disable-gpu',
    '--disable-dev-shm-usage',
    '--hide-scrollbars',
    '--window-size=1080,1350',
    `--screenshot=${outputPath}`,
    'https://taprontomenu.com.br/bares'
  ];

  console.log('Running Chrome WITHOUT virtual time budget...');
  const child = spawn(chromePath, chromeArgs, { stdio: 'inherit' });
  await new Promise((res, rej) => {
    child.on('exit', code => code === 0 ? res() : rej(new Error('Exit ' + code)));
  });

  const meta = await sharp(outputPath).metadata();
  console.log(`Captured: ${meta.width}x${meta.height}`);
}

run().catch(console.error);
