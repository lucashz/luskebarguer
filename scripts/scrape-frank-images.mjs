import { renderGoogleSearchWithChrome, parseGoogleSearchPage } from './src/lib/google-browser-outreach-client.js';
import sharp from 'sharp';
import { mkdir, writeFile } from 'node:fs/promises';

const PRODUCTS = [
  { name: 'Pão Francês Crocante', query: 'pao frances crocante quentinho padaria', slug: 'frank-pao-frances' },
  { name: 'Pão de Centeio Colonial', query: 'pao de centeio colonial rustico fatiado', slug: 'frank-pao-centeio' },
  { name: 'Pão Sovado Especial', query: 'pao sovado fofinho colonial padaria', slug: 'frank-pao-sovado' },
  { name: 'Pão de Forma Multigrãos', query: 'pao de forma multigraos sementes fatiado', slug: 'frank-pao-multigraos' },
  { name: 'Cuca de Ricota Doce', query: 'cuca de ricota colonial gaucha kasekuchen farofa', slug: 'frank-cuca-ricota' },
  { name: 'Cuca de Canela e Açúcar', query: 'cuca de canela e acucar colonial farofa', slug: 'frank-cuca-canela' },
  { name: 'Cuca de Frutas Vermelhas', query: 'cuca de frutas vermelhas amora morango farofa', slug: 'frank-cuca-frutas-vermelhas' },
  { name: 'Torta Marta Rocha Clássica', query: 'torta marta rocha fatia suspiro ovos nata', slug: 'frank-torta-marta-rocha' },
  { name: 'Tortinha de Limão com Merengue', query: 'tortinha de limao com merengue tostado', slug: 'frank-tortinha-limao' },
  { name: 'Torta de Morango com Ninho', query: 'torta de morango com leite ninho fatia', slug: 'frank-torta-morango-ninho' },
  { name: 'Pastelão de Forno de Frango', query: 'pastelao de forno de frango dourado assado', slug: 'frank-pastelao-frango' },
  { name: 'Folhado de Frango com Catupiry', query: 'folhado de frango com catupiry assado', slug: 'frank-folhado-frango' },
  { name: 'Quiche de Alho Poró', query: 'quiche de alho poro individual assada', slug: 'frank-quiche-alho-poro' },
  { name: 'Cento de Salgados para Festas', query: 'cento salgadinhos coxinha risoles bolinha queijo', slug: 'frank-cento-salgados' },
  { name: 'Café Filtrado Gourmet', query: 'xicara cafe filtrado gourmet coado', slug: 'frank-cafe-filtrado' },
  { name: 'Chocolate Quente Cremoso', query: 'taca chocolate quente cremoso europeu', slug: 'frank-chocolate-quente' },
  { name: 'Suco de Uva Integral 300ml', query: 'garrafinha suco de uva integral tinto', slug: 'frank-suco-uva' }
];

const OUTPUT_DIR = '/app/artifacts/outreach/automated/frank-products';
await mkdir(OUTPUT_DIR, { recursive: true });

async function processProduct(item) {
  try {
    console.log(`[Buscando] ${item.name}...`);
    const html = await renderGoogleSearchWithChrome(item.query, {
      chromePath: '/usr/bin/chromium',
      timeoutMs: 20000
    });
    const page = parseGoogleSearchPage(html);
    const valid = page.images.filter(u =>
      u.startsWith('https://encrypted-tbn') &&
      !u.includes('default-user') &&
      !u.includes('favicon')
    );

    if (valid.length === 0) {
      console.warn(`[Aviso] Sem imagem para: ${item.name}`);
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

let ok = 0;
for (const p of PRODUCTS) {
  if (await processProduct(p)) ok++;
  await new Promise(r => setTimeout(r, 1200));
}

console.log(`\nProcessamento finalizado: ${ok}/${PRODUCTS.length} imagens salvas.`);

