import pg from 'pg';

try { process.loadEnvFile?.('.env'); } catch {}

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL
});

const ITEM_IMAGES = [
  { name: 'Heineken Long Neck 330ml', image_url: '/uploads/products/stopbeer-heineken-330ml.webp' },
  { name: 'Corona Extra 330ml', image_url: '/uploads/products/stopbeer-corona-330ml.webp' },
  { name: 'Stella Artois Long Neck 330ml', image_url: '/uploads/products/stopbeer-stella-artois-330ml.webp' },
  { name: 'Brahma Duplo Malte Latão 473ml', image_url: '/uploads/products/stopbeer-brahma-duplo-malte-473ml.webp' },
  { name: 'Amstel Lager Latão 473ml', image_url: '/uploads/products/stopbeer-amstel-latao-473ml.webp' },
  { name: 'Balde com 6 Heineken Long Neck', image_url: '/uploads/products/stopbeer-balde-heineken.webp' },
  { name: 'Combo Gin Tropical', image_url: '/uploads/products/stopbeer-combo-gin-tropical.webp' },
  { name: 'Combo Vodka + Energético', image_url: '/uploads/products/stopbeer-combo-vodka-energetico.webp' },
  { name: 'Whisky Johnnie Walker Red Label 1L', image_url: '/uploads/products/stopbeer-johnnie-walker-red-label-1l.webp' },
  { name: 'Gin Tanqueray London Dry 750ml', image_url: '/uploads/products/stopbeer-gin-tanqueray-750ml.webp' },
  { name: 'Vodka Smirnoff 998ml', image_url: '/uploads/products/stopbeer-vodka-smirnoff-998ml.webp' },
  { name: 'Energético Red Bull 250ml', image_url: '/uploads/products/stopbeer-red-bull-250ml.webp' },
  { name: 'Coca-Cola Original 2L', image_url: '/uploads/products/stopbeer-coca-cola-2l.webp' },
  { name: 'Coca-Cola Lata 350ml', image_url: '/uploads/products/stopbeer-coca-cola-lata-350ml.webp' },
  { name: 'Água Mineral sem Gás 500ml', image_url: '/uploads/products/stopbeer-agua-mineral-500ml.webp' },
  { name: 'Saco de Gelo em Cubos 5kg', image_url: '/uploads/products/stopbeer-saco-de-gelo-5kg.webp' },
  { name: 'Amendoim Salgado Crocante 150g', image_url: '/uploads/products/stopbeer-amendoim-salgado-crocante.webp' },
  { name: 'Batata Pringles Original 114g', image_url: '/uploads/products/stopbeer-pringles-original-114g.webp' },
  { name: 'Copo Descartável 400ml (Pacote com 50)', image_url: '/uploads/products/stopbeer-copos-descartaveis-400ml.webp' }
];

async function main() {
  const store = (await pool.query("SELECT id FROM stores WHERE slug = 'stopbeer'")).rows[0];
  if (!store) throw new Error("Loja 'stopbeer' não encontrada.");

  let updatedCount = 0;
  for (const item of ITEM_IMAGES) {
    const res = await pool.query(`
      UPDATE menu_items 
      SET image_url = $1, updated_at = now() 
      WHERE store_id = $2 AND name = $3
      RETURNING id, name, image_url
    `, [item.image_url, store.id, item.name]);

    if (res.rowCount > 0) {
      updatedCount += 1;
      console.log(`[ATUALIZADO] ${item.name} -> ${item.image_url}`);
    } else {
      console.warn(`[NÃO ENCONTRADO] ${item.name}`);
    }
  }

  console.log(`\nTotal atualizados: ${updatedCount} de ${ITEM_IMAGES.length}`);

  const verify = (await pool.query(`
    SELECT name, image_url 
    FROM menu_items 
    WHERE store_id = $1 
    ORDER BY sort_order
  `, [store.id])).rows;

  console.log('\nStatus final dos itens de Stop Beer no banco:');
  console.log(JSON.stringify(verify, null, 2));

  await pool.end();
}

main().catch(err => {
  console.error('Erro ao atualizar imagens:', err);
  process.exit(1);
});
