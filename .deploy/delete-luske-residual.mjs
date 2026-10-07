import pg from 'pg';

const companyId = 'a1fdc78b-eaca-499b-beab-e39defb6044d';
const expectedName = 'Luske Alimentacao';
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
const client = await pool.connect();
try {
  await client.query('begin');
  const company = (await client.query('select id,name,status from companies where id=$1 for update', [companyId])).rows[0];
  if (!company || company.name !== expectedName) throw new Error('A empresa alvo não corresponde ao registro autorizado.');
  const dependencies = (await client.query(`
    select
      (select count(*)::int from stores where company_id=$1) as stores,
      (select count(*)::int from admin_users where company_id=$1) as admins,
      (select count(*)::int from company_subscriptions where company_id=$1) as subscriptions
  `, [companyId])).rows[0];
  if (dependencies.admins !== 0 || dependencies.subscriptions !== 0) throw new Error('O registro deixou de ser residual; exclusão cancelada.');
  const removed = (await client.query('delete from companies where id=$1 returning id,name', [companyId])).rows[0];
  await client.query('commit');
  console.log(JSON.stringify({ removed, dependencies }));
} catch (error) {
  await client.query('rollback');
  throw error;
} finally {
  client.release();
  await pool.end();
}
