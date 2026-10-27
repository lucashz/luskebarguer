import pg from 'pg';

const client = new pg.Client('postgresql://cardapio_user:ca3b7539eb748218ad8c652ae489f7087d42360367a9470d@localhost:5433/cardapio?schema=public');
await client.connect();

const leads = (await client.query(`
  select distinct l.id,
         coalesce(l.metadata->>'trade_name', l.metadata->>'name') as name,
         l.metadata->>'menu_slug' as slug,
         l.metadata->>'store_id' as store_id,
         l.phone,
         l.normalized_phone
  from sales_messages m
  join sales_leads l on l.id = m.lead_id
  where m.direction = 'outbound'
    and m.sent_at >= '2026-10-24 00:00:00-03:00'
`)).rows;

console.log(`Checking ${leads.length} leads contacted today:`);

for (const lead of leads) {
  let store = null;
  if (lead.store_id) {
    store = (await client.query('select id, name, slug from stores where id = $1', [lead.store_id])).rows[0];
  }
  if (!store && lead.slug) {
    store = (await client.query('select id, name, slug from stores where slug = $1', [lead.slug])).rows[0];
  }

  if (!store) {
    console.log(`[NO STORE] ${lead.name} (slug: ${lead.slug})`);
    continue;
  }

  const counts = (await client.query(`
    select count(*)::int as total,
           count(image_url)::int as with_img,
           coalesce(sum(case when image_url is null or image_url = '' then 1 else 0 end), 0)::int as without_img
    from menu_items
    where store_id = $1
  `, [store.id])).rows[0];

  console.log(`${store.slug.padEnd(36)} | Total: ${String(counts.total).padStart(2)} | With Img: ${String(counts.with_img).padStart(2)} | WITHOUT: ${counts.without_img}`);
}

await client.end();

