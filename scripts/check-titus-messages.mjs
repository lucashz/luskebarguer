import pg from 'pg';

const pool = new pg.Pool({
  connectionString: 'postgresql://cardapio_user:ca3b7539eb748218ad8c652ae489f7087d42360367a9470d@localhost:5433/cardapio?schema=public'
});

const res = await pool.query(`
  SELECT m.id, m.created_at, m.metadata, l.business_name
  FROM sales_messages m
  LEFT JOIN sales_leads l ON l.id = m.lead_id
  WHERE l.business_name IN ('Titus lanches delivery', 'Prime Hamburgueria Artesanal', 'Brasa Hamburgueria Artesanal')
  ORDER BY m.created_at DESC
`);

console.log(JSON.stringify(res.rows, null, 2));

await pool.end();

