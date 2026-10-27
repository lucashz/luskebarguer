import pg from 'pg';

const pool = new pg.Pool({
  connectionString: 'postgresql://cardapio_user:ca3b7539eb748218ad8c652ae489f7087d42360367a9470d@localhost:5433/cardapio?schema=public'
});

async function main() {
  const res = await pool.query(`
    SELECT business_name, phone, stage, attempt_count, last_contact_at, metadata->>'menu_url' as menu 
    FROM sales_leads 
    WHERE source = 'gosom_scraper' AND attempt_count = 1 
    ORDER BY last_contact_at DESC
  `);
  console.log(`\n======================================================`);
  console.log(`  LEADS PROVISIONADOS E DISPARADOS COM SUCESSO (${res.rows.length}):`);
  console.log(`======================================================\n`);
  for (let i = 0; i < res.rows.length; i++) {
    const r = res.rows[i];
    console.log(`[${i + 1}] ${r.business_name}`);
    console.log(`    WhatsApp: ${r.phone} | Status: ${r.stage}`);
    console.log(`    Link: ${r.menu}`);
    console.log(`    Último contato: ${r.last_contact_at?.toISOString?.()}\n`);
  }
  await pool.end();
}

main().catch(console.error);
