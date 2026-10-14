import { createHash, randomBytes } from 'node:crypto';
import pg from 'pg';

const registrationId = '602d3542-d1db-4a4b-8239-6b9deea459e4';
const newEmail = 'utlucasdsg@gmail.com';
const origin = process.env.NAPIO_APP_ORIGIN || 'http://127.0.0.1:3000';
if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL ausente.');

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 2 });
let sessionHash = '';
try {
  const client = await pool.connect();
  try {
    await client.query('begin');
    const registration = (await client.query('select * from assisted_registrations where id=$1 for update', [registrationId])).rows[0];
    if (!registration || registration.status !== 'published') throw new Error('Cadastro não está publicado ou não foi encontrado.');
    const duplicate = (await client.query(`
      select id from admin_users where lower(email)=lower($1) and id<>$2 limit 1
    `, [newEmail, registration.admin_id])).rows[0];
    if (duplicate) throw new Error('O e-mail já está associado a outra conta.');

    const answers = registration.answers || {};
    answers.contact = { ...(answers.contact || {}), email: newEmail };
    await client.query('update assisted_registrations set email=$2,answers=$3::jsonb,updated_at=now() where id=$1', [registrationId, newEmail, JSON.stringify(answers)]);
    await client.query('update admin_users set email=$2,updated_at=now() where id=$1', [registration.admin_id, newEmail]);
    await client.query('update companies set billing_email=$2,updated_at=now() where id=$1', [registration.company_id, newEmail]);
    await client.query('commit');
  } catch (error) {
    await client.query('rollback').catch(() => {});
    throw error;
  } finally { client.release(); }

  const admin = (await pool.query("select id,name,email,role,company_id from admin_users where role='superadmin' and is_active=true order by created_at limit 1")).rows[0];
  if (!admin) throw new Error('Superadmin ativo não encontrado.');
  const token = randomBytes(32).toString('hex');
  sessionHash = createHash('sha256').update(token).digest('hex');
  const data = { session_version: 2, id: admin.id, name: admin.name, email: admin.email, role: 'superadmin', company_id: admin.company_id || null, store_id: null, active_store: null, stores: [] };
  await pool.query(`insert into app_sessions (token,type,owner_id,company_id,store_id,data,expires_at) values ($1,'admin',$2,$3,null,$4::jsonb,now()+interval '10 minutes')`, [sessionHash, admin.id, admin.company_id || null, JSON.stringify(data)]);

  const response = await fetch(`${origin}/api/platform/assisted-registrations/${registrationId}/resend-activation`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie: `admin_session=${token}` },
    body: JSON.stringify({})
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`Reenvio recusado (${response.status}): ${result.error || 'erro desconhecido'}`);
  const status = (await pool.query('select email_status from assisted_registrations where id=$1', [registrationId])).rows[0]?.email_status;
  console.log(JSON.stringify({ ok: true, email_status: status, resend_result: result.email_status || null }));
  if (status !== 'sent' || result.email_status === 'failed') process.exitCode = 2;
} finally {
  if (sessionHash) await pool.query('delete from app_sessions where token=$1', [sessionHash]).catch(() => {});
  await pool.end();
}
