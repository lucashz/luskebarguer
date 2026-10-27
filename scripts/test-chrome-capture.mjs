import { captureWithChrome } from '../src/lib/outreach-preview.js';
import path from 'node:path';
import sharp from 'sharp';

async function run() {
  const outputPath = path.resolve('artifacts/test-bares-capture.png');
  console.log('Capturando https://taprontomenu.com.br/bares...');

  await captureWithChrome({
    url: 'https://taprontomenu.com.br/bares',
    outputPath,
    view: 'desktop'
  });

  const meta = await sharp(outputPath).metadata();
  console.log(`Pronto! Tamanho: ${meta.width}x${meta.height}`);
}

run().catch(console.error);
