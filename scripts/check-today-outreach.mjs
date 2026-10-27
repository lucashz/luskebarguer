import { getLocalPool } from '../src/lib/local-postgrest-adapter.js';
const pool = getLocalPool();

const events = await pool.query(`
  SELECT id, lead_id, event_type, stage, result, details, created_at
  FROM sales_automation_events 
  WHERE created_at >= '2026-10-19T00:00:00Z'
  ORDER BY created_at ASC
`);
console.log('Today events count:', events.rows.length);
console.log(JSON.stringify(events.rows, null, 2));

const runs = await pool.query(`
  SELECT * FROM sales_automation_jobs WHERE created_at >= '2026-10-19T00:00:00Z'
`).catch(() => ({ rows: [] }));
console.log('Jobs:', runs.rows);

await pool.end();

