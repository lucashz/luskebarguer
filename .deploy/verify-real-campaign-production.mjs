import pg from 'pg';
import { instagramPaidFunnel } from '/var/www/src/lib/platform-ad-funnel.js';

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const events = (await pool.query(`
  select id, company_id, store_id, event_name, visitor_key, attribution, properties, created_at
  from marketing_events
  where created_at >= now() - interval '90 days'
`)).rows;
const funnel = instagramPaidFunnel(events);

await pool.query('select * from company_subscriptions order by created_at desc limit 1');
await pool.query('select * from company_feature_overrides order by created_at desc limit 1');
await pool.query('select id, store_id, is_available from menu_items limit 1');

console.log(JSON.stringify({ funnel, client_queries: 'ok' }));
await pool.end();
