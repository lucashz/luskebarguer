import pg from 'pg';

async function main() {
  const client = new pg.Client({
    connectionString: 'postgresql://cardapio_user:ca3b7539eb748218ad8c652ae489f7087d42360367a9470d@localhost:5433/cardapio?schema=public'
  });
  await client.connect();

  const res = await client.query(`
    UPDATE sales_leads 
    SET source = 'google_outreach',
        metadata = jsonb_set(COALESCE(metadata, '{}'::jsonb), '{scraper_engine}', '"gosom_scraper"')
    WHERE source = 'gosom_scraper'
  `);
  console.log(`Updated ${res.rowCount} leads from 'gosom_scraper' to 'google_outreach'.`);

  // Also promote lucasbulow@hotmail.com to superadmin if desired
  const lucas = await client.query("SELECT id, email, role FROM admin_users WHERE email = 'lucasbulow@hotmail.com'");
  console.log("Lucas user:", lucas.rows);

  await client.end();
}

main().catch(console.error);

