import pg from 'pg';

const client = new pg.Client('postgresql://cardapio_user:ca3b7539eb748218ad8c652ae489f7087d42360367a9470d@localhost:5433/cardapio?schema=public');
await client.connect();

const ids = [
  '4f54fa98-ab89-4c43-818b-cef4fdc814a3',
  'a3897392-9e43-4bd0-9440-1fdeae55c881',
  'e8b421c2-f61b-4903-b889-562171643a12',
  'edb7c40b-e6d3-4a97-b73c-a953e41a1db7',
  'ee482c4f-4e26-489f-82a6-4930221649a8'
];

const leads = (await client.query(`
  SELECT id, business_name, phone, normalized_phone, city, state, metadata
  FROM sales_leads
  WHERE id = ANY($1::uuid[])
`, [ids])).rows;

for (const l of leads) {
  console.log(`Lead: ${l.business_name} | Phone: ${l.normalized_phone || l.phone} | Slug: ${l.metadata?.menu_slug}`);
}

await client.end();

