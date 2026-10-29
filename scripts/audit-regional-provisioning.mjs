import pg from 'pg';

const dbUrl = process.env.DATABASE_URL || 'postgresql://cardapio_user:ca3b7539eb748218ad8c652ae489f7087d42360367a9470d@localhost:5433/cardapio?schema=public';
const pool = new pg.Pool({ connectionString: dbUrl });

async function audit() {
  const turns = await pool.query(`
    SELECT state, metadata->>'target_turn' as turno, count(*) as provisioned_stores
    FROM sales_leads
    WHERE stage = 'preview_ready' AND source = 'regional_expansion_gmaps'
    GROUP BY state, metadata->>'target_turn'
    ORDER BY turno, state;
  `);
  console.log('--- LOJAS PRONTAS POR ESTADO E TURNO ---');
  console.table(turns.rows);

  const imagesAudit = await pool.query(`
    SELECT 
      count(*) as total_items_created,
      count(*) FILTER (WHERE image_url IS NULL OR image_url = '') as items_without_image
    FROM menu_items mi
    JOIN stores s ON s.id = mi.store_id
    WHERE s.id IN (
      SELECT (metadata->>'store_id')::uuid 
      FROM sales_leads 
      WHERE stage = 'preview_ready' AND source = 'regional_expansion_gmaps'
    );
  `);
  console.log('--- AUDITORIA DA REGRA DE OURO (IMAGENS) ---');
  console.table(imagesAudit.rows);

  const totalMined = await pool.query(`
    SELECT state, count(*) as total_mined
    FROM sales_leads
    WHERE source = 'regional_expansion_gmaps'
    GROUP BY state
    ORDER BY state;
  `);
  console.log('--- TOTAL MINERADO POR ESTADO ---');
  console.table(totalMined.rows);

  const sampleUrls = await pool.query(`
    SELECT business_name, city, state, metadata->>'target_turn' as turno, metadata->>'menu_url' as url
    FROM sales_leads
    WHERE stage = 'preview_ready' AND source = 'regional_expansion_gmaps'
    ORDER BY state, turno
    LIMIT 12;
  `);
  console.log('--- AMOSTRA DE CARDÁPIOS COM URLs LIMPAS ---');
  console.table(sampleUrls.rows);

  await pool.end();
}
audit();

