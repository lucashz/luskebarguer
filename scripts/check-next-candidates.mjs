import pg from 'pg';

const pool = new pg.Pool({
  connectionString: 'postgresql://cardapio_user:ca3b7539eb748218ad8c652ae489f7087d42360367a9470d@localhost:5433/cardapio?schema=public'
});

const res = await pool.query(`
  SELECT id, business_name, phone, stage, attempt_count, metadata->>'outreach_strategy' as strat
  FROM sales_leads
  WHERE stage = 'discovered'
    AND attempt_count = 0
    AND phone IS NOT NULL
    AND (metadata->>'outreach_strategy') IS NULL
  ORDER BY COALESCE(score, 0) DESC, RANDOM()
  LIMIT 5
`);

console.log('Next candidates in queue (Restaurante da Gaúcha MUST NOT BE HERE):');
console.table(res.rows);

await pool.end();

