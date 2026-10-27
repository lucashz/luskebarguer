import pg from 'pg';

try { process.loadEnvFile?.('.env'); } catch {}

const dbUrl = process.env.DATABASE_URL || 'postgresql://cardapio_user:ca3b7539eb748218ad8c652ae489f7087d42360367a9470d@localhost:5433/cardapio?schema=public';
const pool = new pg.Pool({ connectionString: dbUrl });

async function main() {
  const query = `
    SELECT id, business_name, city, state, segment, phone, normalized_phone, metadata
    FROM sales_leads
    WHERE stage IN ('discovered', 'verified')
      AND attempt_count = 0
      AND phone IS NOT NULL
      AND segment = 'marmitaria'
    ORDER BY 
      COALESCE((metadata->>'reviews_count')::int, 0) DESC,
      created_at DESC
    LIMIT 20
  `;
  const res = await pool.query(query);
  console.log(`\n=== 20 MARMITARIAS ESCALADAS PARA 10H30 ===`);
  console.table(res.rows.map((r, i) => ({
    '#': i + 1,
    Nome: r.business_name.slice(0, 28),
    Cidade: r.city,
    Cardápio: r.metadata?.menu_url ? 'Pronto' : 'Pendente',
    Reviews: r.metadata?.reviews_count || 0
  })));

  const nightQuery = `
    SELECT id, business_name, city, state, segment, phone, normalized_phone, metadata
    FROM sales_leads
    WHERE stage IN ('discovered', 'verified')
      AND attempt_count = 0
      AND phone IS NOT NULL
      AND segment != 'marmitaria'
    ORDER BY 
      COALESCE((metadata->>'reviews_count')::int, 0) DESC,
      created_at DESC
    LIMIT 20
  `;
  const nightRes = await pool.query(nightQuery);
  console.log(`\n=== 20 LEADS DA NOITE ESCALADOS PARA 18H00 ===`);
  console.table(nightRes.rows.map((r, i) => ({
    '#': i + 1,
    Nome: r.business_name.slice(0, 28),
    Segmento: r.segment,
    Cidade: r.city,
    Cardápio: r.metadata?.menu_url ? 'Pronto' : 'Pendente',
    Reviews: r.metadata?.reviews_count || 0
  })));

  await pool.end();
}

main().catch(console.error);

