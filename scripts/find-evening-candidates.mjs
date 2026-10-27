import pg from 'pg';

async function main() {
  const pool = new pg.Pool({
    connectionString: 'postgresql://cardapio_user:ca3b7539eb748218ad8c652ae489f7087d42360367a9470d@localhost:5433/cardapio?schema=public'
  });

  const res = await pool.query(`
    SELECT id, business_name, phone, normalized_phone, city, segment, metadata
    FROM sales_leads
    WHERE last_contact_at IS NULL
      AND attempt_count = 0
      AND stage IN ('discovered', 'verified')
      AND segment IN ('hamburgueria', 'pizzaria', 'lanchonete', 'restaurante', 'bar')
      AND phone IS NOT NULL
    ORDER BY 
      CASE WHEN city = 'Botucatu' THEN 1 WHEN city = 'Bauru' THEN 2 WHEN city = 'Jaú' THEN 3 ELSE 4 END,
      created_at DESC
    LIMIT 20
  `);

  console.log(`Candidatos encontrados: ${res.rows.length}`);
  for (const r of res.rows) {
    const reviews = r.metadata?.reviews_count || r.metadata?.review_count || 0;
    console.log(`- [${r.city}] ${r.business_name} | ${r.phone} | ${r.segment} | Reviews: ${reviews}`);
  }

  await pool.end();
}

main().catch(console.error);

