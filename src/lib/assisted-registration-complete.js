import { pbkdf2Sync, randomBytes } from 'node:crypto';
import { publicAssistedRegistration } from './assisted-registration.js';

export async function completeAssistedRegistration(pool, registrationId, actor = {}) {
  if (!actor?.id) throw statusError(403, 'Administrador não identificado.');
  const client = await pool.connect();
  try {
    await client.query('begin');
    const registration = (await client.query('select * from assisted_registrations where id=$1 for update', [registrationId])).rows[0];
    if (!registration) throw statusError(404, 'Cadastro assistido não encontrado.');
    if (registration.status === 'published') { const result = await linkedResult(client, registration); await client.query('commit'); return result; }
    if (registration.status !== 'preview_reviewed' || !registration.preview_reviewed_at) throw statusError(409, 'Revise e confirme a prévia antes de concluir o cadastro.');
    const draft = (await client.query('select version from assisted_menu_drafts where registration_id=$1 limit 1', [registrationId])).rows[0];
    if (!draft || Number(draft.version) !== Number(registration.preview_menu_version)) throw statusError(409, 'O cardápio mudou depois da revisão da prévia. Confirme novamente.');
    const changes = (await client.query(`select greatest(
      coalesce((select max(updated_at) from store_settings where store_id=$1),'-infinity'::timestamptz),
      coalesce((select max(updated_at) from menu_categories where store_id=$1),'-infinity'::timestamptz),
      coalesce((select max(updated_at) from menu_items where store_id=$1),'-infinity'::timestamptz),
      coalesce((select max(updated_at) from menu_modifier_groups where store_id=$1),'-infinity'::timestamptz),
      coalesce((select max(updated_at) from menu_modifiers where store_id=$1),'-infinity'::timestamptz)
    ) latest_change`, [registration.store_id])).rows[0]?.latest_change;
    if (changes && new Date(changes).getTime() > new Date(registration.preview_reviewed_at).getTime()) throw statusError(409, 'A loja mudou depois da confirmação. Revise a prévia novamente.');
    const admin = (await client.query('select id,name,email,is_active from admin_users where id=$1 limit 1', [registration.admin_id])).rows[0];
    if (!admin) throw statusError(404, 'Administrador da futura conta não encontrado.');
    const rawToken = randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 7 * 86400000).toISOString();
    await client.query("update admin_activation_tokens set status='cancelled' where admin_user_id=$1 and status='pending'", [admin.id]);
    await client.query("insert into admin_activation_tokens (admin_user_id,token_hash,status,expires_at) values ($1,$2,'pending',$3)", [admin.id, activationTokenHash(rawToken), expiresAt]);
    const published = (await client.query("update assisted_registrations set status='published',published_at=coalesce(published_at,now()),email_status='not_sent',email_last_error_code=null,updated_at=now() where id=$1 returning *", [registrationId])).rows[0];
    await client.query('commit');
    return { registration: publicAssistedRegistration(published), activation: { token: rawToken, admin_id: admin.id, name: admin.name, email: admin.email, expires_at: expiresAt }, company: { id: registration.company_id }, store: { id: registration.store_id } };
  } catch (error) { await client.query('rollback').catch(() => {}); throw error; }
  finally { client.release(); }
}

export function activationTokenHash(token) { return pbkdf2Sync(String(token || ''), 'admin_account_activation', 120000, 32, 'sha256').toString('hex'); }
async function linkedResult(client, registration) { const admin=(await client.query('select id,name,email,is_active from admin_users where id=$1 limit 1',[registration.admin_id])).rows[0]; return { registration:publicAssistedRegistration(registration),activation:{token:null,admin_id:admin?.id,name:admin?.name,email:admin?.email,expires_at:null},company:{id:registration.company_id},store:{id:registration.store_id} }; }
function statusError(status,message){const error=new Error(message);error.status=status;return error;}
