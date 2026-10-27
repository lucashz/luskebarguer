import pg from 'pg';
import 'dotenv/config';

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

async function run() {
  const { rows } = await pool.query(`
    SELECT metadata
    FROM sales_leads
    WHERE metadata IS NOT NULL AND jsonb_typeof(metadata) = 'object'
    LIMIT 5;
  `);
  console.log('Sample 5 metadatas:');
  console.log(JSON.stringify(rows.map(r => r.metadata), null, 2));

  await pool.end();
}

run().catch(console.error);
