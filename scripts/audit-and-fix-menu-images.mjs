import { getLocalPool } from '../src/lib/local-postgrest-adapter.js';

try { process.loadEnvFile?.('.env'); } catch {}

const pool = getLocalPool();

// Mapeamento de fallback de fotos por palavra-chave do item
const KEYWORD_PHOTOS = [
  // Pizzas
  { pattern: /pizza.*calabresa/i, url: 'https://images.unsplash.com/photo-1628840042765-356cda07504e?auto=format&fit=crop&w=1200&q=85' },
  { pattern: /pizza.*margherita|pizza.*marguerita/i, url: 'https://images.unsplash.com/photo-1604382354936-07c5d9983bd3?auto=format&fit=crop&w=1200&q=85' },
  { pattern: /pizza.*queijo|quatro queijos/i, url: 'https://images.unsplash.com/photo-1513104890138-7c749659a591?auto=format&fit=crop&w=1200&q=85' },
  { pattern: /pizza.*doce|pizza.*chocolate/i, url: 'https://images.unsplash.com/photo-1590947132387-155cc02f3212?auto=format&fit=crop&w=1200&q=85' },
  { pattern: /pizza/i, url: 'https://images.unsplash.com/photo-1565299624946-b28f40a0ae38?auto=format&fit=crop&w=1200&q=85' },

  // Hambúrgueres
  { pattern: /bacon/i, url: 'https://images.unsplash.com/photo-1553979459-d2229ba7433b?auto=format&fit=crop&w=1200&q=85' },
  { pattern: /duplo|smash/i, url: 'https://images.unsplash.com/photo-1586190848861-99aa4a171e90?auto=format&fit=crop&w=1200&q=85' },
  { pattern: /burger|hamburguer|hambúrguer/i, url: 'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?auto=format&fit=crop&w=1200&q=85' },

  // Porções & Petiscos
  { pattern: /batata|fritas/i, url: 'https://images.unsplash.com/photo-1573080496219-bb080dd4f877?auto=format&fit=crop&w=1200&q=85' },
  { pattern: /calabresa acebolada/i, url: 'https://images.unsplash.com/photo-1544025162-d76694265947?auto=format&fit=crop&w=1200&q=85' },
  { pattern: /frango a passarinho|iscas de frango/i, url: 'https://images.unsplash.com/photo-1626082927389-6cd097cdc6ec?auto=format&fit=crop&w=1200&q=85' },
  { pattern: /porcao|porção|petisco/i, url: 'https://images.unsplash.com/photo-1541592106381-b31e9677c0e5?auto=format&fit=crop&w=1200&q=85' },

  // Refeições & Marmitas
  { pattern: /marmitex|executivo|comercial/i, url: 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?auto=format&fit=crop&w=1200&q=85' },
  { pattern: /file|filé|parmegiana|bife/i, url: 'https://images.unsplash.com/photo-1600891964599-f61ba0e24092?auto=format&fit=crop&w=1200&q=85' },
  { pattern: /feijoada/i, url: 'https://images.unsplash.com/photo-1544025162-d76694265947?auto=format&fit=crop&w=1200&q=85' },
  { pattern: /salada/i, url: 'https://images.unsplash.com/photo-1512621776951-a57141f2eefd?auto=format&fit=crop&w=1200&q=85' },

  // Padaria & Cafeteria
  { pattern: /pao|pão/i, url: 'https://images.unsplash.com/photo-1509440159596-0249088772ff?auto=format&fit=crop&w=1200&q=85' },
  { pattern: /bolo|torta/i, url: 'https://images.unsplash.com/photo-1578985545062-69928b1d9587?auto=format&fit=crop&w=1200&q=85' },
  { pattern: /croissant/i, url: 'https://images.unsplash.com/photo-1555396273-367ea4eb4db5?auto=format&fit=crop&w=1200&q=85' },
  { pattern: /cafe|café|cappuccino|expresso/i, url: 'https://images.unsplash.com/photo-1514432324607-a09d9b4aefdd?auto=format&fit=crop&w=1200&q=85' },

  // Açaí & Sobremesas
  { pattern: /acai|açaí/i, url: 'https://images.unsplash.com/photo-1590080875515-8a3a8dc5735e?auto=format&fit=crop&w=1200&q=85' },
  { pattern: /sorvete/i, url: 'https://images.unsplash.com/photo-1501443762994-82bd5dace89a?auto=format&fit=crop&w=1200&q=85' },

  // Bebidas
  { pattern: /cerveja|heineken|chopp/i, url: 'https://images.unsplash.com/photo-1518176258769-f227c798150e?auto=format&fit=crop&w=1200&q=85' },
  { pattern: /suco/i, url: 'https://images.unsplash.com/photo-1613478223719-2ab802602423?auto=format&fit=crop&w=1200&q=85' },
  { pattern: /refrigerante|coca|guarana|água/i, url: 'https://images.unsplash.com/photo-1554866585-cd94860890b7?auto=format&fit=crop&w=1200&q=85' }
];

const DEFAULT_FOOD_PHOTO = 'https://images.unsplash.com/photo-1504674900247-0877df9cc836?auto=format&fit=crop&w=1200&q=85';

function resolvePhotoForItem(item, storeName = '') {
  const text = `${item.name || ''} ${item.description || ''} ${storeName}`.toLowerCase();
  for (const entry of KEYWORD_PHOTOS) {
    if (entry.pattern.test(text)) {
      return entry.url;
    }
  }
  return DEFAULT_FOOD_PHOTO;
}

async function main() {
  console.log('=== AUDITORIA GERAL DE ITENS DE CARDÁPIO E FOTOS ===\n');

  // 1. Estatísticas gerais
  const totalStoresRes = await pool.query('SELECT count(*) FROM stores');
  const totalItemsRes = await pool.query('SELECT count(*) FROM menu_items');
  const missingItemsRes = await pool.query("SELECT count(*) FROM menu_items WHERE image_url IS NULL OR trim(image_url) = ''");

  console.log(`Lojas totais no sistema: ${totalStoresRes.rows[0].count}`);
  console.log(`Itens totais cadastrados: ${totalItemsRes.rows[0].count}`);
  console.log(`Itens SEM imagem detectados: ${missingItemsRes.rows[0].count}\n`);

  // 2. Buscar todos os itens sem imagem com detalhes da loja
  const missingItems = await pool.query(`
    SELECT
      mi.id as item_id,
      mi.name as item_name,
      mi.description as item_desc,
      mi.image_url,
      s.id as store_id,
      s.name as store_name,
      s.slug as store_slug
    FROM menu_items mi
    JOIN stores s ON s.id = mi.store_id
    WHERE mi.image_url IS NULL OR trim(mi.image_url) = ''
    ORDER BY s.name, mi.name
  `);

  if (missingItems.rowCount === 0) {
    console.log('🎉 PARABÉNS! Zero itens sem imagem no banco de dados!');
  } else {
    console.log(`Iniciando enriquecimento fotográfico para ${missingItems.rowCount} itens...`);
    let fixed = 0;

    for (const row of missingItems.rows) {
      const selectedPhoto = resolvePhotoForItem(
        { name: row.item_name, description: row.item_desc },
        row.store_name
      );

      await pool.query(
        `UPDATE menu_items SET image_url = $1, updated_at = NOW() WHERE id = $2`,
        [selectedPhoto, row.item_id]
      );
      fixed++;
      if (fixed % 10 === 0 || fixed === missingItems.rowCount) {
        console.log(`  -> Corrigidos ${fixed}/${missingItems.rowCount} itens...`);
      }
    }
    console.log(`\n✅ Sucesso! ${fixed} itens enriquecidos com fotos de alta resolução.`);
  }

  // 3. Verificar especificamente as lojas citadas pelo usuário
  console.log('\n--- Verificação de Lojas Específicas ---');
  const targetSlugs = ['pizzaria-em-dois-corregos-rodizi', 'beer-point', 'refugio-gourmet'];

  for (const slug of targetSlugs) {
    const storeRes = await pool.query('SELECT id, name, slug FROM stores WHERE slug ILIKE $1 LIMIT 1', [`%${slug}%`]);
    if (!storeRes.rows[0]) {
      console.log(`⚠️ Loja ${slug} não encontrada no banco.`);
      continue;
    }
    const store = storeRes.rows[0];
    const itemsRes = await pool.query(`
      SELECT count(*) as total, count(image_url) as with_image
      FROM menu_items WHERE store_id = $1
    `, [store.id]);
    const { total, with_image } = itemsRes.rows[0];
    console.log(`Loja: ${store.name} (/${store.slug})`);
    console.log(`  Itens: ${total} | Com foto: ${with_image} (${Number(total) === Number(with_image) ? '✅ 100% OK' : '❌ PENDENTE'})`);
  }

  // 4. Verificar se alguma loja está sem cover_url em store_settings
  const missingCovers = await pool.query(`
    SELECT s.name, s.slug, ss.store_id
    FROM store_settings ss
    JOIN stores s ON s.id = ss.store_id
    WHERE ss.cover_url IS NULL OR trim(ss.cover_url) = ''
  `);

  if (missingCovers.rowCount > 0) {
    console.log(`\nAtualizando capas de ${missingCovers.rowCount} lojas sem cover_url...`);
    for (const row of missingCovers.rows) {
      const coverUrl = 'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?auto=format&fit=crop&w=1200&q=85';
      await pool.query('UPDATE store_settings SET cover_url = $1, updated_at = NOW() WHERE store_id = $2', [coverUrl, row.store_id]);
      console.log(`  -> Capa atualizada para: ${row.name}`);
    }
  }

  console.log('\n========================================');
  console.log('✅ AUDITORIA E ENRIQUECIMENTO FOTOGRÁFICO CONCLUÍDOS!');
  console.log('========================================\n');

  await pool.end();
}

main().catch(console.error);
