import { readdir, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

async function run() {
  const automatedDir = path.resolve('artifacts/outreach/automated');
  const dirs = await readdir(automatedDir, { withFileTypes: true });
  const folders = dirs.filter(d => d.isDirectory()).map(d => d.name);

  console.log(`Verificando ${folders.length} pastas de prévias em ${automatedDir}...`);

  for (const folder of folders) {
    const desktopPng = path.join(automatedDir, folder, 'menu-preview.png');
    const mobilePng = path.join(automatedDir, folder, 'menu-preview-mobile.png');

    if (!existsSync(desktopPng)) {
      console.log(`❌ ${folder}: menu-preview.png NÃO existe!`);
      continue;
    }
    const dMeta = await sharp(desktopPng).metadata();
    const mMeta = existsSync(mobilePng) ? await sharp(mobilePng).metadata() : null;

    console.log(`📁 ${folder}: Desktop ${dMeta.width}x${dMeta.height} (${(dMeta.size/1024).toFixed(0)}KB) | Mobile ${mMeta?.width}x${mMeta?.height}`);
  }
}

run().catch(console.error);
