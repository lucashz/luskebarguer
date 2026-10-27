import pg from 'pg';

try { process.loadEnvFile?.('.env'); } catch {}

const dbUrl = process.env.DATABASE_URL || 'postgresql://cardapio_user:ca3b7539eb748218ad8c652ae489f7087d42360367a9470d@localhost:5433/cardapio?schema=public';
const pool = new pg.Pool({ connectionString: dbUrl });

async function main() {
  const elShaday = await pool.query("SELECT direction, body, status, created_at FROM sales_messages WHERE lead_id = '5ff87f0d-8131-4a26-bdfd-b125de8bb5e0' ORDER BY created_at ASC");
  console.log("EL SHADAY Messages:");
  console.table(elShaday.rows.map(r => ({ dir: r.direction, text: r.body.slice(0, 50), at: r.created_at })));

  const travessa = await pool.query("SELECT direction, body, status, created_at FROM sales_messages WHERE lead_id = 'f0ac5dc6-b4fb-4b3a-84a2-65121c02a07a' ORDER BY created_at ASC");
  console.log("\nTravessa Diagonal Messages:");
  console.table(travessa.rows.map(r => ({ dir: r.direction, text: r.body.slice(0, 50), at: r.created_at })));

  await pool.end();
}

main().catch(console.error);

