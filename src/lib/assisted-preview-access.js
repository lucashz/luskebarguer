import { createHash, randomBytes } from 'node:crypto';
import { publicAssistedRegistration } from './assisted-registration.js';

export async function createAssistedPreviewAccess(pool, registrationId, platformAdmin, ttlSeconds = 1800) {
  if (!platformAdmin?.id) throw statusError(403, 'Administrador da plataforma não identificado.');
  const preview = (await pool.query(`select ar.*,c.name company_name,s.name store_name,s.slug store_slug from assisted_registrations ar join companies c on c.id=ar.company_id join stores s on s.id=ar.store_id where ar.id=$1 and ar.status in ('preview_created','preview_reviewed') limit 1`, [registrationId])).rows[0];
  if (!preview) throw statusError(409, 'Crie a prévia antes de abrir o painel.');
  const ttl = Math.max(60, Math.min(1800, Number(ttlSeconds) || 1800));
  const expiresAt = new Date(Date.now() + ttl * 1000).toISOString();
  const token = randomBytes(32).toString('hex');
  const data = {
    id: platformAdmin.id,
    name: platformAdmin.name || 'Administrador TáPronto',
    email: platformAdmin.email || '',
    role: 'admin',
    company_id: preview.company_id,
    store_id: preview.store_id,
    session_version: 2,
    active_store: { id: preview.store_id, company_id: preview.company_id, name: preview.store_name, slug: preview.store_slug, public_url: `/${preview.store_slug}` },
    stores: [{ id: preview.store_id, company_id: preview.company_id, name: preview.store_name, slug: preview.store_slug, public_url: `/${preview.store_slug}` }],
    plan_access: {},
    support_mode: {
      active: true,
      assisted_preview: true,
      registration_id: preview.id,
      started_at: new Date().toISOString(),
      expires_at: expiresAt,
      original_admin_id: platformAdmin.id,
      original_admin_email: platformAdmin.email || '',
      original_session_token: platformAdmin.original_session_token || '',
      target_company_id: preview.company_id,
      target_company_name: preview.company_name,
      target_store_id: preview.store_id,
      target_store_name: preview.store_name,
      target_store_slug: preview.store_slug,
      return_url: '/platform.html?view=assisted'
    }
  };
  await pool.query(`insert into app_sessions (token,type,owner_id,company_id,store_id,data,expires_at) values ($1,'admin',$2,$3,$4,$5::jsonb,$6)`, [hashToken(token), platformAdmin.id, preview.company_id, preview.store_id, JSON.stringify(data), expiresAt]);
  return { redirect_url: '/admin.html?assisted_preview=1', expires_at: expiresAt, session_token: token, store_id: preview.store_id };
}

export async function confirmAssistedPreviewReview(pool, registrationId, actor, menuVersion) {
  if (!actor?.id) throw statusError(403, 'Administrador não identificado.');
  const current = (await pool.query(`select ar.*,md.version menu_version from assisted_registrations ar join assisted_menu_drafts md on md.registration_id=ar.id where ar.id=$1 and ar.status in ('preview_created','preview_reviewed') limit 1`, [registrationId])).rows[0];
  if (!current) throw statusError(409, 'A prévia não está pronta para revisão.');
  if (Number(menuVersion) !== Number(current.menu_version) || Number(current.preview_menu_version) !== Number(current.menu_version)) throw statusError(409, 'O cardápio mudou. Atualize a prévia antes de confirmar esta versão.');
  const reviewed = (await pool.query(`update assisted_registrations set status='preview_reviewed',preview_reviewed_at=now(),preview_menu_version=$2,updated_at=now() where id=$1 returning *`, [registrationId, current.menu_version])).rows[0];
  return publicAssistedRegistration(reviewed);
}

function hashToken(value) { return createHash('sha256').update(String(value)).digest('hex'); }
function statusError(status, message) { const error = new Error(message); error.status = status; return error; }
