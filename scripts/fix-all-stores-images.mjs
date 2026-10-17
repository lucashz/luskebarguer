import { getLocalPool } from '../src/lib/local-postgrest-adapter.js';

try { process.loadEnvFile?.('.env'); } catch {}

const pool = getLocalPool();

const PIZZA_MAP = {
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

const BURGER_MAP = {
  'Batata Rústica com Cheddar e Crispy de Bacon (450g)': '/uploads/products/beer-point-1058328.webp',
  'Burger Clássico com Cheddar e Bacon': '/uploads/products/beer-point-1058316.webp',
  'Milkshake de Nutella com Ninho (400ml)': 'https://images.unsplash.com/photo-1572490122747-3968b75cc699?auto=format&fit=crop&w=1200&q=85',
  'Coca-Cola Lata 350ml': 'https://images.unsplash.com/photo-1622483767028-3f66f32aef97?auto=format&fit=crop&w=1200&q=85',
  'Anéis de Cebola Empanados Crocantes (12 un)': 'https://images.unsplash.com/photo-1639024471283-03518883512d?auto=format&fit=crop&w=1200&q=85',
  'Burger Costela BBQ com Cebola Caramelizada': '/uploads/products/beer-point-1058317.webp',
  'Smash Duplo com American Cheese': '/uploads/products/beer-point-1058318.webp'
};

const BAR_MAP = {
  'Heineken Long Neck 330ml': '/uploads/products/beer-point-1058473.webp',
  'Balde no Gelo com 6 Heineken Long Neck': 'https://images.unsplash.com/photo-1584225064785-c62a8b43d148?auto=format&fit=crop&w=1200&q=85',
  'Saco de Gelo Filtrado em Cubos 5kg': 'https://images.unsplash.com/photo-1548839140-29a749e1bc4e?auto=format&fit=crop&w=1200&q=85',
  'Combo Gin Tropical Especial': 'https://images.unsplash.com/photo-1551024709-8f23befc6f87?auto=format&fit=crop&w=1200&q=85',
  'Corona Extra 330ml com Limão': 'https://images.unsplash.com/photo-1608270197495-97e3a9c78d59?auto=format&fit=crop&w=1200&q=85',
  'Amendoim Salgado Crocante 150g': 'https://images.unsplash.com/photo-1567620905732-2d1ec7ab7445?auto=format&fit=crop&w=1200&q=85',
  'Combo Vodka Smirnoff + Energéticos 2L': 'https://images.unsplash.com/photo-1514362545857-3bc16c4c7d1b?auto=format&fit=crop&w=1200&q=85',
  'Brahma Duplo Malte Latão 473ml': '/uploads/products/beer-point-1058473.webp',
  'Batata Pringles Original 114g': 'https://images.unsplash.com/photo-1566478989037-eec170784d0b?auto=format&fit=crop&w=1200&q=85',
  'Amstel Lager Latão 473ml': '/uploads/products/beer-point-1058473.webp'
};

async function updateStore(slug, map) {
  const store = (await pool.query('SELECT id, name FROM stores WHERE slug = $1', [slug])).rows[0];
  if (!store) {
    console.log(`Loja ${slug} não encontrada`);
    return;
  }
  console.log(`\nAtualizando ${store.name} (${slug})...`);
  for (const [name, img] of Object.entries(map)) {
    await pool.query(
      `UPDATE menu_items SET image_url = $1, updated_at = NOW() WHERE store_id = $2 AND name = $3`,
      [img, store.id, name]
    );
  }
}

async function main() {
  // Hamburgueria
  await updateStore('fome-flix-hamburgueria', BURGER_MAP);

  // Pizzarias
  await updateStore('pizzaria-maria-gabriela-braco-do', PIZZA_MAP);
  await updateStore('dalu-pizzaria-braco-do-norte', PIZZA_MAP);

  // Bares
  await updateStore('ze-do-bar', BAR_MAP);
  await updateStore('casa-nova-bar', BAR_MAP);
  await updateStore('bar-do-mario', BAR_MAP);
  await updateStore('cervejaria-2', BAR_MAP);

  // Relatório geral
  const summary = await pool.query(`
    SELECT s.name, s.slug, count(mi.id)::int as total, count(mi.image_url)::int as with_image
    FROM stores s
    JOIN menu_items mi ON mi.store_id = s.id
    WHERE s.slug IN (
      'pizzaria-em-dois-corregos-rodizi',
      'beer-point',
      'fome-flix-hamburgueria',
      'pizzaria-maria-gabriela-braco-do',
      'dalu-pizzaria-braco-do-norte',
      'ze-do-bar',
      'casa-nova-bar',
      'bar-do-mario',
      'cervejaria-2'
    )
    GROUP BY s.name, s.slug
    ORDER BY s.slug
  `);

  console.log('\n=== STATUS FINAL DE TODAS AS 9 LOJAS DISPARADAS HOJE ===');
  console.table(summary.rows);

  await pool.end();
}

main().catch(console.error);
