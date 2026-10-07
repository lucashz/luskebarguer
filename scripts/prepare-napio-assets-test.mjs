import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { prepareNapioAssets } from './prepare-napio-assets.mjs';

sharp.cache(false);

const sourceDir = 'C:\\Users\\Lucas\\Desktop';
const outputDir = await mkdtemp(path.join(tmpdir(), 'napio-assets-'));

try {
  const assets = await prepareNapioAssets({ sourceDir, outputDir });
  assert.deepEqual(Object.keys(assets).sort(), ['batata', 'bife', 'cover', 'logo', 'picadao', 'polenta', 'sanduiche', 'tilapia', 'xis']);
  const logo = await sharp(assets.logo).metadata();
  const cover = await sharp(assets.cover).metadata();
  const xis = await sharp(assets.xis).metadata();
  assert.deepEqual([logo.width, logo.height, logo.format], [600, 600, 'webp']);
  assert.deepEqual([cover.width, cover.height, cover.format], [1600, 900, 'webp']);
  assert.deepEqual([xis.width, xis.height, xis.format], [800, 800, 'webp']);
} finally {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      await rm(outputDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 });
      break;
    } catch (error) {
      if (attempt === 4) throw error;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }
}

console.log('Nápio asset preparation test: OK');
