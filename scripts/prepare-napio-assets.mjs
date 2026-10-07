import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { NAPIO_CATALOG } from './napio-catalog.mjs';

export async function prepareNapioAssets({ sourceDir, outputDir }) {
  if (!sourceDir || !outputDir) throw new Error('Informe sourceDir e outputDir.');
  await mkdir(outputDir, { recursive: true });
  const output = {};

  for (const [key, definition] of Object.entries(NAPIO_CATALOG.assets)) {
    const sourcePath = path.resolve(sourceDir, definition.source);
    const outputPath = path.resolve(outputDir, `${key}.webp`);
    let image = sharp(sourcePath).extract(definition.crop);

    if (key === 'logo') {
      image = image.resize(600, 600, { fit: 'contain', background: '#ffffff' });
    } else if (key === 'cover') {
      image = image.resize(1600, 900, { fit: 'contain', background: '#f7ead6' });
    } else {
      image = image.resize(800, 800, { fit: 'cover', position: 'centre' });
    }

    await image.webp({ quality: key === 'cover' ? 86 : 88, effort: 4 }).toFile(outputPath);
    output[key] = outputPath;
  }

  return output;
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : '';
if (invokedPath === fileURLToPath(import.meta.url)) {
  const sourceDir = process.argv[2] || 'C:\\Users\\Lucas\\Desktop';
  const outputDir = process.argv[3] || path.resolve('artifacts/napio');
  const assets = await prepareNapioAssets({ sourceDir, outputDir });
  console.log(JSON.stringify(assets, null, 2));
}
