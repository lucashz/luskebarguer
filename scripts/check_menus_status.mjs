import pg from 'pg';

try { process.loadEnvFile?.('.env'); } catch {}

const dbUrl = process.env.DATABASE_URL || 'postgresql://cardapio_user:ca3b7539eb748218ad8c652ae489f7087d42360367a9470d@localhost:5433/cardapio?schema=public';
const pool = new pg.Pool({ connectionString: dbUrl });

async function main() {
  const withMenu = await pool.query("SELECT count(*) FROM sales_leads WHERE metadata->>'menu_url' IS NOT NULL OR metadata->>'store_id' IS NOT NULL");
  const total = await pool.query("SELECT count(*) FROM sales_leads");
  const pederneiras = await pool.query("SELECT count(*) FROM sales_leads WHERE city ILIKE '%Pederneiras%'");
  const pederneirasWithMenu = await pool.query("SELECT count(*) FROM sales_leads WHERE city ILIKE '%Pederneiras%' AND (metadata->>'menu_url' IS NOT NULL OR metadata->>'store_id' IS NOT NULL)");

  console.log({
    totalLeads: total.rows[0].count,
    leadsWithMenu: withMenu.rows[0].count,
    pederneirasTotal: pederneiras.rows[0].count,
    pederneirasWithMenu: pederneirasWithMenu.rows[0].count
  });

  await pool.end();
}

main().catch(console.error);

