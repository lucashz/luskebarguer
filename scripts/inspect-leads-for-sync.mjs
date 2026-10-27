import { getLocalPool } from '../src/lib/local-postgrest-adapter.js';

const pool = getLocalPool();
const total = await pool.query('SELECT count(*)::int as count FROM sales_leads');
const byStage = await pool.query('SELECT stage, count(*)::int as count FROM sales_leads GROUP BY stage ORDER BY count DESC');
const withStore = await pool.query(`SELECT count(*)::int as count FROM sales_leads WHERE metadata->>'store_id' IS NOT NULL OR metadata->>'menu_url' IS NOT NULL`);
console.log('Total sales leads:', total.rows[0].count);
console.log('By stage:', byStage.rows);
console.log('With store/menu:', withStore.rows[0].count);
await pool.end();
