import pg from 'pg';

try { process.loadEnvFile?.('.env'); } catch {}

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

async function main() {
  const stages = await pool.query(`SELECT stage, count(*) FROM sales_leads GROUP BY stage ORDER BY count DESC`);
  console.log("Total geral de leads por estágio no banco:", stages.rows);

  const total = await pool.query(`SELECT count(*) FROM sales_leads`);
  console.log("Total geral de leads:", total.rows[0].count);

  await pool.end();
}

main().catch(console.error);

