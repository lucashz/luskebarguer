import pg from 'pg';

const client = new pg.Client('postgresql://cardapio_user:ca3b7539eb748218ad8c652ae489f7087d42360367a9470d@localhost:5433/cardapio?schema=public');
await client.connect();

const countRes = await client.query("select count(*) as cnt from sales_messages where direction = 'outbound' and sent_at >= '2026-10-24 00:00:00-03:00'");
console.log('Total outbound messages sent today (24/10):', countRes.rows[0].cnt);

const distinctLeads = await client.query("select count(distinct lead_id) as cnt from sales_messages where direction = 'outbound' and sent_at >= '2026-10-24 00:00:00-03:00'");
console.log('Distinct leads contacted today:', distinctLeads.rows[0].cnt);

const missingRes = await client.query("select count(*) as missing from menu_items where image_url is null or image_url = ''");
console.log('Total items in entire database without image:', missingRes.rows[0].missing);

const resentCount = await client.query("select count(*) as cnt from sales_messages where metadata->>'kind' in ('outreach_text_updated_photos', 'outreach_desktop_updated_photos', 'outreach_mobile_updated_photos')");
console.log('Total re-sent updated photo messages:', resentCount.rows[0].cnt);

await client.end();

