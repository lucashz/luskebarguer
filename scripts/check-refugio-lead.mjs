import { getLocalPool } from '../src/lib/local-postgrest-adapter.js';

const pool = getLocalPool();
const res = await pool.query("SELECT * FROM sales_leads WHERE business_name ILIKE '%refugio%' OR business_name ILIKE '%ref%gio%'");
console.log(JSON.stringify(res.rows, null, 2));
await pool.end();

