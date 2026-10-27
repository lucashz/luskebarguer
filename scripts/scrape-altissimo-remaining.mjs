import { renderGoogleSearchWithChrome, parseGoogleSearchPage } from './src/lib/google-browser-outreach-client.js';
import sharp from 'sharp';
import { writeFile } from 'node:fs/promises';

const PRODUCTS = [
  { name: 'Pão Francês Tradicional', query: 'pao frances crocante quentinho padaria produto', slug: 'altissimo-pao-frances' },
  { name: 'Pão Caseiro Colonial', query: 'pao caseiro colonial fatiado caseiro', slug: 'altissimo-pao-caseiro' },
  { name: 'Sonho de Creme de Baunilha', query: 'sonho de padaria recheado creme', slug: 'altissimo-sonho-creme' },
  { name: 'Café Expresso Curto / Longo', query: 'xicara de cafe expresso cremoso xicara', slug: 'altissimo-cafe-expresso' },
  { name: 'Cappuccino Cremoso com Canela', query: 'cappuccino cremoso espuma xicara', slug: 'altissimo-cappuccino' }
];

const OUTPUT_DIR = '/app/artifacts/outreach/automated/altissimo-products';

async function processProduct(item) {
  try {
    console.log(`[Buscando 1x1] ${item.name}...`);
    const html = await renderGoogleSearchWithChrome(item.query, {
      chromePath: '/usr/bin/chromium',
      timeoutMs: 25000
    });
    const page = parseGoogleSearchPage(html);
    const valid = page.images.filter(u =>
      u.startsWith('https://encrypted-tbn') &&
      !u.includes('default-user') &&
      !u.includes('favicon')
    );

    if (valid.length === 0) {
      console.warn(`[Aviso] Nenhuma imagem para: ${item.name}`);
      return false;
    }

    const cleanUrl = valid[0].split('&quot;')[0].split('"')[0].split('\\')[0].split(';')[0];
    const res = await fetch(cleanUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });

    if (!res.ok) return false;

    const rawBuffer = Buffer.from(await res.arrayBuffer());
    const optimized = await sharp(rawBuffer)
      .resize(800, 800, {
        fit: 'contain',
        background: { r: 255, g: 255, b: 255, alpha: 1 }
      })
      .webp({ quality: 85 })
      .toBuffer();

    const filePath = `${OUTPUT_DIR}/${item.slug}.webp`;
    await writeFile(filePath, optimized);
    console.log(`[OK] ${item.name} -> ${item.slug}.webp (${optimized.length} bytes)`);
    return true;
  } catch (err) {
    console.error(`[Erro] ${item.name}:`, err.message);
    return false;
  }
}

for (const p of PRODUCTS) {
  await processProduct(p);
  await new Promise(r => setTimeout(r, 1500));
}

