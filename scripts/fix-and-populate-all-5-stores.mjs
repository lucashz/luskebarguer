import pg from 'pg';
import { resolveProductIllustration } from '../src/lib/outreach-store-provisioning.js';

const client = new pg.Client('postgresql://cardapio_user:ca3b7539eb748218ad8c652ae489f7087d42360367a9470d@localhost:5433/cardapio?schema=public');
await client.connect();

const targetSlugs = [
  'cervejaria-enigma-enigma-british',
  'via-daros-padaria-e-confeitaria',
  'cantina-roman',
  'open-house-beer',
  'bar-route-66'
];

console.log('Iniciando atualização de imagens para as 5 lojas...');

for (const slug of targetSlugs) {
  const store = (await client.query('SELECT id, name, slug FROM stores WHERE slug = $1', [slug])).rows[0];
  if (!store) {
    console.error(`Loja ${slug} não encontrada!`);
    continue;
  }

  const items = (await client.query(`
    SELECT i.id, i.name, c.name as category_name, i.image_url
    FROM menu_items i
    LEFT JOIN menu_categories c ON c.id = i.category_id
    WHERE i.store_id = $1
  `, [store.id])).rows;

  console.log(`\nAtualizando [${store.name}] (${items.length} itens):`);

  let updatedCount = 0;
  for (const item of items) {
    const segmentKey = slug.includes('padaria') ? 'padaria' : 'bar';
    const newImage = resolveProductIllustration(item.name, item.category_name, segmentKey);

    await client.query(`
      UPDATE menu_items
      SET image_url = $2, updated_at = now()
      WHERE id = $1
    `, [item.id, newImage]);

    console.log(`  ✓ ${item.name} -> ${newImage.slice(0, 60)}...`);
    updatedCount++;
  }

  // Verificar se sobrou algum item sem foto
  const check = (await client.query(`
    SELECT count(*)::int as missing
    FROM menu_items
    WHERE store_id = $1 AND (image_url IS NULL OR image_url = '')
  `, [store.id])).rows[0];

  console.log(`Lojas ${slug}: ${updatedCount} atualizados. Sem foto restantes: ${check.missing}`);
}

await client.end();
console.log('\nTodos os itens das 5 lojas foram atualizados com sucesso!');

