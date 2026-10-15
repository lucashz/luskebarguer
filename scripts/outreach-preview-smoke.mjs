import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { buildOutreachPreview, resolveOutreachProducts } from '../src/lib/outreach-preview.js';

const outputDirectory = new URL(`../.tmp/outreach-preview-${randomUUID()}/`, import.meta.url);
const outputPath = fileURLToPath(outputDirectory);

try {
  const sourcePhotos = [
    { bytes: await image(960, 640, '#d9822b'), contentType: 'image/jpeg', productHint: 'Pão de queijo' },
    { bytes: await image(640, 960, '#7b4f2c'), contentType: 'image/jpeg', productHint: 'Salgado assado' }
  ];
  const result = await buildOutreachPreview({
    lead: {
      business_name: 'Padaria Central',
      city: 'Horizontina',
      state: 'RS',
      segment: 'Padaria',
      products: [
        { name: 'Pão de queijo', category: 'Salgados', photoIndex: 0 },
        { name: 'Salgado assado', category: 'Salgados', photoIndex: 1 },
        { name: 'Opção da vitrine', category: 'Padaria', photoIndex: 0 },
        { name: 'Destaque da casa', category: 'Padaria', photoIndex: 1 }
      ]
    },
    photos: sourcePhotos,
    outputDir: outputPath
  });

  assert.equal(result.products.length, 4);
  assert.deepEqual(result.products.map((product) => product.name), ['Pão de queijo', 'Salgado assado', 'Opção da vitrine', 'Destaque da casa']);

  for (const path of [result.desktopPath, result.mobilePath]) {
    const metadata = await sharp(path).metadata();
    assert.equal(metadata.width, 1080);
    assert.equal(metadata.height, 1350);
  }

  for (const asset of result.productImagePaths) {
    const metadata = await sharp(asset).metadata();
    assert.equal(metadata.width, 800);
    assert.equal(metadata.height, 480);
  }

  const html = await readFile(result.htmlPath, 'utf8');
  assert.match(html, /TáPronto/);
  assert.match(html, /Prévia demonstrativa/);
  assert.match(html, /Pedidos desativados nesta amostra/);
  assert.match(html, /object-fit:\s*cover/);
  assert.equal((html.match(/class="product-card"/g) || []).length, 4);
  assert(!/R\$|Preço\s*\d/i.test(html), 'A prévia incluiu preço.');

  const fallback = await buildOutreachPreview({
    lead: { business_name: 'Padaria sem fotos', city: 'Horizontina', state: 'RS', segment: 'Padaria' },
    photos: [],
    outputDir: fileURLToPath(new URL('segment-inferred/', outputDirectory)),
    capture: async ({ outputPath }) => sharp({ create: { width: 1080, height: 1350, channels: 3, background: '#ffffff' } }).png().toFile(outputPath)
  });
  assert.equal(fallback.visualSource, 'segment_inferred');
  assert.equal(fallback.productImagePaths.length, 4);
  for (const asset of fallback.productImagePaths) {
    const metadata = await sharp(asset).metadata();
    assert.equal(metadata.width, 800);
    assert.equal(metadata.height, 480);
  }

  const generic = resolveOutreachProducts({ business_name: 'Padaria Sem Lista', segment: 'Padaria' }, sourcePhotos);
  assert.deepEqual(generic.map((product) => product.name), ['Destaque da casa', 'Opção da vitrine', 'Especialidade da padaria', 'Outra opção da casa']);
  assert(!generic.some((product) => /carne|frango|calabresa|presunto/i.test(product.name)), 'O construtor inventou ingredientes sem evidência.');

  await assert.rejects(buildOutreachPreview({
    lead: { business_name: 'Imagem Quebrada', city: 'Horizontina', segment: 'Padaria' },
    photos: [{ bytes: Buffer.from('não é imagem'), contentType: 'image/jpeg' }, sourcePhotos[1]],
    outputDir: fileURLToPath(new URL('broken/', outputDirectory))
  }), /foto.*inválida|imagem.*inválida/i);

  console.log('Outreach preview smoke: OK');
} finally {
  await rm(outputPath, { recursive: true, force: true });
}

function image(width, height, background) {
  return sharp({ create: { width, height, channels: 3, background } }).jpeg({ quality: 88 }).toBuffer();
}
