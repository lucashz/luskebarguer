import { getLocalPool } from './src/lib/local-postgrest-adapter.js';

const pool = getLocalPool();

async function main() {
  const events = await pool.query(`
    select table_name from information_schema.tables where table_schema='public' and table_name like 'sales%'
  `);

  console.log(`Found ${events.rows.length} sales tables:`);
  for (const e of events.rows) {
    console.log(`- ${e.table_name}`);
  }

  await pool.end();
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
