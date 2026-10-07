import pg from 'pg';

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
try {
  const result = await pool.query(`
    select status, count(*)::int as total
    from companies
    group by status
    order by status
  `);
  const terminal = await pool.query(`
    select c.status, count(*)::int as total,
      count(s.id)::int as stores
    from companies c
    left join stores s on s.company_id=c.id
    where c.status in ('cancelled','archived')
    group by c.status
    order by c.status
  `);
  const inventory = await pool.query(`
    select c.id, c.name, c.status,
      count(distinct s.id)::int as stores,
      count(distinct au.id)::int as admins,
      count(distinct cs.id)::int as subscriptions
    from companies c
    left join stores s on s.company_id=c.id
    left join admin_users au on au.company_id=c.id
    left join company_subscriptions cs on cs.company_id=c.id
    group by c.id
    order by c.name
  `);
  console.log(JSON.stringify({ statuses: result.rows, terminal: terminal.rows, inventory: inventory.rows }));
} finally {
  await pool.end();
}
