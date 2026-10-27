import pg from 'pg';

try { process.loadEnvFile?.('.env'); } catch {}

async function main() {
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  const leadId = '5ff87f0d-8131-4a26-bdfd-b125de8bb5e0';

  const res = await pool.query('SELECT metadata FROM sales_leads WHERE id = $1', [leadId]);
  const meta = res.rows[0].metadata || {};
  console.log('--- STATUS DE CLIQUE EL SHADAY ---');
  console.log('Link clicks:', meta.link_clicks || 0);
  console.log('Link clicked:', meta.link_clicked || false);
  console.log('Last click at:', meta.last_link_click_at || 'Nunca');
  await pool.end();
}

main().catch(console.error);
