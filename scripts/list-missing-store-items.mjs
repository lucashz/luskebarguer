import pg from 'pg';

const client = new pg.Client('postgresql://cardapio_user:ca3b7539eb748218ad8c652ae489f7087d42360367a9470d@localhost:5433/cardapio?schema=public');
await client.connect();

const slugs = [
  'cervejaria-enigma-enigma-british',
  'via-daros-padaria-e-confeitaria',
  'cantina-roman',
  'open-house-beer',
  'bar-route-66'
];

for (const slug of slugs) {
  const store = (await client.query('select id, name, slug from stores where slug = $1', [slug])).rows[0];
  if (!store) continue;
  const items = (await client.query('select id, name from menu_items where store_id = $1 order by sort_order', [store.id])).rows;
  console.log(`\n=== ${store.name} (${store.slug}) ===`);
  items.forEach(i => console.log(`  - [${i.id}] ${i.name}`));
}

await client.end();

