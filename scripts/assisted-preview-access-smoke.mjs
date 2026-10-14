import assert from 'node:assert/strict';
import { createAssistedPreviewAccess, confirmAssistedPreviewReview } from '../src/lib/assisted-preview-access.js';

const calls = [];
const pool = { query: async (sql, params) => {
  calls.push({ sql, params });
  if (sql.startsWith('select ar.')) return { rows: [{ id: 'r1', status: 'preview_created', company_id: 'c1', store_id: 's1', preview_menu_version: 3, menu_version: 3, company_name: 'Loja', store_name: 'Loja', store_slug: 'loja' }] };
  if (sql.startsWith('insert into app_sessions')) return { rows: [] };
  if (sql.startsWith('update assisted_registrations')) return { rows: [{ id: 'r1', status: 'preview_reviewed', preview_reviewed_at: '2026-09-30T12:00:00Z', preview_menu_version: 3 }] };
  return { rows: [] };
} };
const access = await createAssistedPreviewAccess(pool, 'r1', { id: 'a1', name: 'Admin', email: 'admin@example.com' }, 99999);
assert.match(access.redirect_url, /^\/admin\.html\?assisted_preview=1/);
assert.ok(new Date(access.expires_at).getTime() - Date.now() <= 1800_500, 'TTL máximo deve ser 30 minutos.');
assert.ok(access.session_token && !access.redirect_url.includes(access.session_token), 'Token deve ir somente em cookie HttpOnly.');
const sessionInsert = calls.find((call) => call.sql.startsWith('insert into app_sessions'));
assert.equal(sessionInsert.params[3], 's1', 'Sessão precisa ficar limitada à loja da prévia.');
await assert.rejects(() => createAssistedPreviewAccess(pool, 'r1', {}, 300), /Administrador/);

await assert.rejects(() => confirmAssistedPreviewReview(pool, 'r1', { id: 'a1' }, 2), /mudou|versão/i);
const reviewed = await confirmAssistedPreviewReview(pool, 'r1', { id: 'a1' }, 3);
assert.equal(reviewed.status, 'preview_reviewed');

console.log('Assisted preview access: OK');
