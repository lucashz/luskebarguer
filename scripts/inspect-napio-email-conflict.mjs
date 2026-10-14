import pg from 'pg';
const registrationId = '602d3542-d1db-4a4b-8239-6b9deea459e4';
const target = 'lucasbulow@hotmail.com';
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
try {
  const q = await pool.query(`
    select au.id,au.role,au.is_active,c.name company_name,
           case when au.id=ar.admin_id then 'napio' when au.role='superadmin' then 'platform_admin' else 'other' end account_kind
      from admin_users au
      left join companies c on c.id=au.company_id
      left join assisted_registrations ar on ar.id=$2
     where lower(au.email)=lower($1)
  `, [target, registrationId]);
  console.log(JSON.stringify(q.rows));
} finally { await pool.end(); }
