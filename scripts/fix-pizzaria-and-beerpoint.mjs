import { getLocalPool } from '../src/lib/local-postgrest-adapter.js';

try { process.loadEnvFile?.('.env'); } catch {}

const pool = getLocalPool();

// Imagens verificadas em alta resolução para Pizzaria Brothers
const PIZZARIA_IMAGES = {
  'Pizza Filé ao Alho e Óleo com Crispy de Cebola': 'https://images.unsplash.com/photo-1590947132387-155cc02f3212?auto=format&fit=crop&w=1200&q=85',
  'Pizza Calabresa Especial (Grande 8 fatias)': 'https://images.unsplash.com/photo-1628840042765-356cda07504e?auto=format&fit=crop&w=1200&q=85',
  'Coca-Cola Original 2L Gelada': 'https://images.unsplash.com/photo-1554866585-cd94860890b7?auto=format&fit=crop&w=1200&q=85',
  'Pizza Doce de Chocolate Preto com Morangos Frescos (Média)': 'https://images.unsplash.com/photo-1604382354936-07c5d9983bd3?auto=format&fit=crop&w=1200&q=85',
  'Pizza Bacon Supremo com Barbecue e Cream Cheese': 'https://images.unsplash.com/photo-1565299624946-b28f40a0ae38?auto=format&fit=crop&w=1200&q=85',
  'Pizza Frango com Catupiry Original (Grande)': 'https://images.unsplash.com/photo-1574071318508-1cdbab80d002?auto=format&fit=crop&w=1200&q=85',
  'Pizza Doce Romeu e Julieta Cremosa (Média)': 'https://images.unsplash.com/photo-1588315029754-2dd089d39a1a?auto=format&fit=crop&w=1200&q=85',
  'Guaraná Antarctica 2L Gelado': 'https://images.unsplash.com/photo-1622483767028-3f66f32aef97?auto=format&fit=crop&w=1200&q=85',
  'Pizza Quatro Queijos Nobres (Grande)': 'https://images.unsplash.com/photo-1513104890138-7c749659a591?auto=format&fit=crop&w=1200&q=85',
  'Cerveja Heineken Long Neck 330ml': '/uploads/products/beer-point-1058473.webp',
  'Pizza Portuguesa Tradicional (Grande)': 'https://images.unsplash.com/photo-1571407970349-bc81e7e96d47?auto=format&fit=crop&w=1200&q=85'
};

// Imagens verificadas para Beer Point
const BEERPOINT_IMAGES = {
  'Batata Rústica com Cheddar e Crispy de Bacon (450g)': '/uploads/products/beer-point-1058328.webp',
  'Burger Clássico com Cheddar e Bacon': '/uploads/products/beer-point-1058316.webp',
  'Milkshake de Nutella com Ninho (400ml)': 'https://images.unsplash.com/photo-1572490122747-3968b75cc699?auto=format&fit=crop&w=1200&q=85',
  'Coca-Cola Lata 350ml': 'https://images.unsplash.com/photo-1622483767028-3f66f32aef97?auto=format&fit=crop&w=1200&q=85',
  'Anéis de Cebola Empanados Crocantes (12 un)': 'https://images.unsplash.com/photo-1639024471283-03518883512d?auto=format&fit=crop&w=1200&q=85',
  'Burger Costela BBQ com Cebola Caramelizada': '/uploads/products/beer-point-1058317.webp',
  'Smash Duplo com American Cheese': '/uploads/products/beer-point-1058318.webp'
};

async function updateStoreImages(slug, mapping) {
  const storeRes = await pool.query('SELECT id, name FROM stores WHERE slug = $1', [slug]);
  const store = storeRes.rows[0];
  if (!store) {
    console.error(`Loja '${slug}' não encontrada!`);
    return;
  }

  console.log(`\nAtualizando imagens de: ${store.name} (${slug})`);
  let updated = 0;
  for (const [name, imageUrl] of Object.entries(mapping)) {
    const res = await pool.query(
      `UPDATE menu_items
       SET image_url = $1, updated_at = NOW()
       WHERE store_id = $2 AND name = $3
       RETURNING id, name, image_url`,
      [imageUrl, store.id, name]
    );

    if (res.rowCount > 0) {
      updated += 1;
      console.log(`  ✓ ${name} -> ${imageUrl.slice(0, 60)}...`);
    } else {
      console.warn(`  ⚠️ Não encontrou item: "${name}"`);
    }
  }

  console.log(`Sucesso: ${updated}/${Object.keys(mapping).length} itens atualizados com imagem.`);
}

async function main() {
  await updateStoreImages('pizzaria-em-dois-corregos-rodizi', PIZZARIA_IMAGES);
  await updateStoreImages('beer-point', BEERPOINT_IMAGES);

  // Verificar o resultado final
  console.log('\n=== VERIFICAÇÃO FINAL ===');
  for (const slug of ['pizzaria-em-dois-corregos-rodizi', 'beer-point']) {
    const res = await pool.query(`
      SELECT mi.name, mi.image_url
      FROM menu_items mi
      JOIN stores s ON s.id = mi.store_id
      WHERE s.slug = $1
      ORDER BY mi.sort_order ASC
    `, [slug]);
    console.log(`\nItens de ${slug}:`);
    console.table(res.rows);
  }

  await pool.end();
}

main().catch(console.error);
