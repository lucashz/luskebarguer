import pg from 'pg';

async function main() {
  const pool = new pg.Pool({
    connectionString: 'postgresql://cardapio_user:ca3b7539eb748218ad8c652ae489f7087d42360367a9470d@localhost:5433/cardapio?schema=public'
  });

  const res = await pool.query(`
    SELECT id, business_name, city, metadata
    FROM sales_leads
    WHERE metadata->>'outreach_strategy' = 'trojan_inquiry_step1'
  `);

  console.log('Checando stores dos 5 leads:');
  for (const r of res.rows) {
    console.log(`- ${r.business_name} (${r.city}) | store_id: ${r.metadata?.store_id} | menu_url: ${r.metadata?.menu_url}`);
  }

  await pool.end();
}

main().catch(console.error);

