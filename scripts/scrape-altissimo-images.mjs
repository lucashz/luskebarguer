import { renderGoogleSearchWithChrome, parseGoogleSearchPage } from './src/lib/google-browser-outreach-client.js';
import sharp from 'sharp';
import { mkdir, writeFile } from 'node:fs/promises';

const PRODUCTS = [
  { name: 'Pão Francês Tradicional', query: 'pao frances crocante padaria produto', slug: 'altissimo-pao-frances' },
  { name: 'Pão Caseiro Colonial', query: 'pao caseiro colonial tradicional fatiado', slug: 'altissimo-pao-caseiro' },
  { name: 'Pão de Queijo Mineiro', query: 'pao de queijo assado quentinho cesta produto', slug: 'altissimo-pao-de-queijo' },
  { name: 'Pão de Milho Artesanal', query: 'pao de milho artesanal caseiro fofinho', slug: 'altissimo-pao-de-milho' },
  { name: 'Cuca de Requeijão Colonial', query: 'cuca de requeijao colonial gaucha farofa', slug: 'altissimo-cuca-requeijao' },
  { name: 'Cuca de Uva Tradicional', query: 'cuca de uva tradicional colonial farofa gaucha', slug: 'altissimo-cuca-uva' },
  { name: 'Cuca de Maçã com Canela', query: 'cuca de maca com canela colonial farofa', slug: 'altissimo-cuca-maca' },
  { name: 'Cuca de Goiabada', query: 'cuca de goiabada com farofa colonial padaria', slug: 'altissimo-cuca-goiabada' },
  { name: 'Pastel de Forno Frango com Catupiry', query: 'pastel de forno frango catupiry assado', slug: 'altissimo-pastel-forno-frango' },
  { name: 'Coxinha com Frango Desfiado', query: 'coxinha de frango frita crocante salgado', slug: 'altissimo-coxinha-frango' },
  { name: 'Enroladinho de Presunto e Queijo', query: 'enroladinho de presunto e queijo assado salgado', slug: 'altissimo-enroladinho-presunto-queijo' },
  { name: 'Empada de Palmito', query: 'empada de palmito salgado assado massa podre', slug: 'altissimo-empada-palmito' },
  { name: 'Torta Alemã Clássica', query: 'torta alema fatia creme holandes chocolate', slug: 'altissimo-torta-alema' },
  { name: 'Bolo Nega Maluca com Brigadeiro', query: 'bolo nega maluca fatia cobertura brigadeiro', slug: 'altissimo-bolo-nega-maluca' },
  { name: 'Rocambole de Doce de Leite', query: 'rocambole de doce de leite fatiado colonial', slug: 'altissimo-rocambole-doce-de-leite' },
  { name: 'Sonho de Creme de Baunilha', query: 'sonho de padaria recheado creme baunilha', slug: 'altissimo-sonho-creme' },
  { name: 'Café Expresso Curto / Longo', query: 'xicara de cafe expresso cremoso xicara branca', slug: 'altissimo-cafe-expresso' },
  { name: 'Cappuccino Cremoso com Canela', query: 'cappuccino cremoso com canela espuma xicara', slug: 'altissimo-cappuccino' },
  { name: 'Suco de Laranja Natural 400ml', query: 'copo de suco de laranja natural com gelo', slug: 'altissimo-suco-laranja' }
];

const OUTPUT_DIR = '/app/artifacts/outreach/automated/altissimo-products';
await mkdir(OUTPUT_DIR, { recursive: true });

async function processProduct(item) {
  try {
    console.log(`[Buscando] ${item.name}...`);
    const html = await renderGoogleSearchWithChrome(item.query, {
      chromePath: '/usr/bin/chromium',
      timeoutMs: 15000
    });
    const page = parseGoogleSearchPage(html);
    const valid = page.images.filter(u =>
      u.startsWith('https://encrypted-tbn') &&
      !u.includes('default-user') &&
      !u.includes('favicon')
    );

    if (valid.length === 0) {
      console.warn(`[Aviso] Nenhuma imagem Google encontrada para: ${item.name}`);
      return { item, success: false, reason: 'no_image_found' };
    }

    const cleanUrl = valid[0].split('&quot;')[0].split('"')[0].split('\\')[0].split(';')[0];
    const res = await fetch(cleanUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });

    if (!res.ok) {
      console.warn(`[Aviso] Falha ao baixar imagem de ${item.name}: HTTP ${res.status}`);
      return { item, success: false, reason: `http_${res.status}` };
    }

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

    return {
      name: item.name,
      slug: item.slug,
      filePath,
      relativeUrl: `/uploads/products/${item.slug}.webp`,
      success: true
    };
  } catch (err) {
    console.error(`[Erro] ${item.name}:`, err.message);
    return { item, success: false, reason: err.message };
  }
}

const results = [];
for (let i = 0; i < PRODUCTS.length; i += 2) {
  const chunk = PRODUCTS.slice(i, i + 2);
  const chunkResults = await Promise.all(chunk.map(processProduct));
  results.push(...chunkResults);
}

console.log('\n========================================');
console.log('RESUMO DO PROCESSAMENTO DE IMAGENS:');
console.log('========================================');
const succeeded = results.filter(r => r.success);
console.log(`Sucesso: ${succeeded.length}/${PRODUCTS.length}`);

