import pg from 'pg';

const pool = new pg.Pool({
  connectionString: 'postgresql://cardapio_user:ca3b7539eb748218ad8c652ae489f7087d42360367a9470d@localhost:5433/cardapio?schema=public'
});

async function main() {
  const res = await pool.query(`
    SELECT id, business_name, city, state, segment, phone, normalized_phone, metadata
    FROM sales_leads
    WHERE source = 'gosom_scraper'
      AND last_contact_at IS NULL 
      AND attempt_count = 0
    ORDER BY 
      CASE WHEN segment = 'marmitaria' THEN 1 WHEN segment = 'hamburgueria' THEN 2 ELSE 3 END,
      COALESCE((metadata->>'reviews_count')::int, 0) ASC
    LIMIT 10
  `);

  console.log(`Top 10 leads selecionados para provisionamento (${res.rows.length}):\n`);
  for (let i = 0; i < res.rows.length; i++) {
    const l = res.rows[i];
    console.log(`[${i + 1}] ${l.business_name} (${l.city}-${l.state})`);
    console.log(`    Segmento: ${l.segment} | Tel: ${l.phone} | Reviews: ${l.metadata?.reviews_count || 0}`);
    console.log(`    ID: ${l.id}\n`);
  }

  await pool.end();
}

main().catch(console.error);
