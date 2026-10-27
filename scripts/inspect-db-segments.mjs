import pg from 'pg';

try { process.loadEnvFile?.('.env'); } catch {}

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

async function main() {
  const res = await pool.query(`
    SELECT segment, stage, count(*)
    FROM sales_leads
    GROUP BY segment, stage
    ORDER BY segment, stage
  `);
  console.log("Segments and stages:");
  console.table(res.rows);

  await pool.end();
}

main().catch(console.error);
