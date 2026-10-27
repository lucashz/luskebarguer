import pg from 'pg';

const pool = new pg.Pool({
  connectionString: 'postgresql://cardapio_user:ca3b7539eb748218ad8c652ae489f7087d42360367a9470d@localhost:5433/cardapio?schema=public'
});

const res = await pool.query(`
  SELECT m.id, m.body, m.created_at, m.metadata, l.business_name, l.phone, l.stage
  FROM sales_messages m
  LEFT JOIN sales_leads l ON l.id = m.lead_id
  WHERE m.created_at >= CURRENT_DATE
  ORDER BY m.created_at DESC
  LIMIT 25
`);

console.table(res.rows.map(r => ({
  business: r.business_name,
  phone: r.phone,
  stage: r.stage,
  time: new Date(r.created_at).toLocaleTimeString('pt-BR'),
  kind: r.metadata?.kind || r.metadata?.type || r.metadata?.step,
  body: r.body?.slice(0, 60)
})));

await pool.end();

