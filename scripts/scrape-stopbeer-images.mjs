import { renderGoogleSearchWithChrome, parseGoogleSearchPage } from './src/lib/google-browser-outreach-client.js';
import sharp from 'sharp';
import { mkdir, writeFile } from 'node:fs/promises';

const PRODUCTS = [
  {
    name: 'Heineken Long Neck 330ml',
    query: 'Heineken Long Neck 330ml garrafa produto fundo branco',
    slug: 'stopbeer-heineken-330ml'
  },
  {
    name: 'Corona Extra 330ml',
    query: 'Corona Extra 330ml garrafa produto fundo branco',
    slug: 'stopbeer-corona-330ml'
  },
  {
    name: 'Stella Artois Long Neck 330ml',
    query: 'Stella Artois 330ml long neck garrafa produto',
    slug: 'stopbeer-stella-artois-330ml'
  },
  {
    name: 'Brahma Duplo Malte Latão 473ml',
    query: 'Brahma Duplo Malte 473ml lata cerveja produto',
    slug: 'stopbeer-brahma-duplo-malte-473ml'
  },
  {
    name: 'Amstel Lager Latão 473ml',
    query: 'Cerveja Amstel Lager 473ml lata produto',
    slug: 'stopbeer-amstel-latao-473ml'
  },
  {
    name: 'Balde com 6 Heineken Long Neck',
    query: 'balde heineken com gelo e cerveja garrafas',
    slug: 'stopbeer-balde-heineken'
  },
  {
    name: 'Combo Gin Tropical',
    query: 'combo gin red bull tropical drink taca',
    slug: 'stopbeer-combo-gin-tropical'
  },
  {
    name: 'Combo Vodka + Energético',
    query: 'combo smirnoff baly energetico gelo',
    slug: 'stopbeer-combo-vodka-energetico'
  },
  {
    name: 'Whisky Johnnie Walker Red Label 1L',
    query: 'Johnnie Walker Red Label 1L garrafa whisky produto',
    slug: 'stopbeer-johnnie-walker-red-label-1l'
  },
  {
    name: 'Gin Tanqueray London Dry 750ml',
    query: 'Gin Tanqueray London Dry 750ml garrafa produto',
    slug: 'stopbeer-gin-tanqueray-750ml'
  },
  {
    name: 'Vodka Smirnoff 998ml',
    query: 'Vodka Smirnoff 998ml garrafa produto',
    slug: 'stopbeer-vodka-smirnoff-998ml'
  },
  {
    name: 'Energético Red Bull 250ml',
    query: 'Energetico Red Bull 250ml lata energy drink',
    slug: 'stopbeer-red-bull-250ml'
  },
  {
    name: 'Coca-Cola Original 2L',
    query: 'Coca-Cola Original 2L garrafa pet refrigerante',
    slug: 'stopbeer-coca-cola-2l'
  },
  {
    name: 'Coca-Cola Lata 350ml',
    query: 'Coca-Cola original 350ml lata vermelha',
    slug: 'stopbeer-coca-cola-lata-350ml'
  },
  {
    name: 'Água Mineral sem Gás 500ml',
    query: 'agua mineral sem gas 500ml garrafa pet',
    slug: 'stopbeer-agua-mineral-500ml'
  },
  {
    name: 'Saco de Gelo em Cubos 5kg',
    query: 'saco de gelo em cubos 5kg pacote',
    slug: 'stopbeer-saco-de-gelo-5kg'
  },
  {
    name: 'Amendoim Salgado Crocante 150g',
    query: 'amendoim salgado sem pele pacote petisco',
    slug: 'stopbeer-amendoim-salgado-crocante'
  },
  {
    name: 'Batata Pringles Original 114g',
    query: 'batata pringles original 114g tubo vermelho',
    slug: 'stopbeer-pringles-original-114g'
  },
  {
    name: 'Copo Descartável 400ml (Pacote com 50)',
    query: 'copo descartavel 400ml pacote 50 copos transparente',
    slug: 'stopbeer-copos-descartaveis-400ml'
  }
];

const OUTPUT_DIR = '/app/artifacts/outreach/automated/stopbeer-products';
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

// Executar com concorrência moderada (2 por vez para evitar sobrecarga no Chromium)
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
console.log(JSON.stringify(succeeded, null, 2));
