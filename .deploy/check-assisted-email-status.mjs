import pg from 'pg';

const email = String(process.argv[2] || '').trim().toLowerCase();
if (!email) throw new Error('E-mail obrigatório.');

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
try {
  const result = await pool.query(`
    select
      ar.status as registration_status,
      ar.email_status,
      ar.email_last_error_code,
      ar.published_at,
      ar.updated_at,
      au.is_active,
      token.status as activation_status,
      token.created_at as activation_created_at,
      token.expires_at as activation_expires_at,
      token.used_at as activation_used_at
    from assisted_registrations ar
    left join admin_users au on au.id = ar.admin_id
    left join lateral (
      select status, created_at, expires_at, used_at
      from admin_activation_tokens
      where admin_user_id = au.id
      order by created_at desc
      limit 1
    ) token on true
    where lower(ar.email) = $1
    order by ar.updated_at desc
    limit 1
  `, [email]);
  console.log(JSON.stringify(result.rows[0] || { found: false }));
} finally {
  await pool.end();
}
