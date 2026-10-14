import { createHash, randomBytes } from 'node:crypto';
import pg from 'pg';
import assert from 'node:assert/strict';
const origin = 'https://thaina.taprontomenu.com.br';
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL.replace(/\/[^/?]+(\?|$)/, '/clinica_estetica$1'), max: 1 });
const hash = value => createHash('sha256').update(value).digest('hex');
const token = randomBytes(32).toString('base64url'); const tokenHash = hash(token);
try {
  assert.equal((await fetch(origin + '/marketing/api/studio')).status, 401);
  assert.equal((await fetch(origin + '/marketing/api/generate', { method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json' }, body: JSON.stringify({ kind: 'image', key: 'unauthenticated-health-test' }) })).status, 401);
  const account = (await pool.query("SELECT c.username,c.password_hash,u.id user_id FROM clinic_admin_credentials c JOIN marketing_studio_orgs o ON o.clinic_id=c.clinic_id JOIN marketing_studio_users u ON u.org_id=o.id AND u.source='clinic' WHERE o.id='thaina'")).rows[0];
  assert.ok(account, 'Clinic credentials missing');
  // A temporary maintenance session checks the deployed cookie/auth path without
  // knowing/resetting the user's password. It is removed in finally.
  await pool.query("INSERT INTO marketing_studio_sessions(token_hash,org_id,csrf,credential_version,expires_at,user_id) VALUES($1,'thaina',$2,$3,now()+interval '1 minute',$4)", [tokenHash, randomBytes(24).toString('base64url'), hash(account.username + ':' + account.password_hash), account.user_id]);
  const response = await fetch(origin + '/marketing/api/studio', { headers: { Cookie: '__Secure-studio_session=' + token } });
  const clinicHeaders = { Cookie: '__Secure-clinic_session=' + token };
  assert.equal((await fetch(origin + '/api/auth/session')).status, 401);
  assert.equal((await fetch(origin + '/api/auth/session', { headers: clinicHeaders })).status, 200);
  assert.equal((await fetch(origin + '/thai/api/auth/session', { headers: clinicHeaders })).status, 200);
  assert.equal((await fetch(origin + '/marketing/api/studio', { headers: clinicHeaders })).status, 200);
  const library = await fetch(origin + '/marketing/api/library/search?q=skin%20care', { headers: { Cookie: '__Secure-studio_session=' + token } });
  if (library.status !== 404) throw new Error(`Removed public library endpoint returned ${library.status}`);
  assert.equal(response.status, 200); const state = await response.json();
  assert.equal(state.organization, 'thaina'); assert.ok(['openai', 'cloudflare'].includes(state.provider)); assert.equal(state.captionReady, true);
  assert.equal(state.usage.limits.images, 30); assert.equal(state.usage.limits.captions, 60);
  const profile = await fetch(origin + '/marketing/api/profile', { headers: { Cookie: '__Secure-studio_session=' + token } });
  assert.equal(profile.status, 200); assert.equal((await profile.json()).role, 'admin');
  assert.equal((await fetch(origin + '/marketing/api/profile')).status, 401);
  const denied = await fetch(origin + '/marketing/api/brand', { method: 'PUT', headers: { Cookie: '__Secure-studio_session=' + token, Origin: origin, 'Content-Type': 'application/json' }, body: '{}' });
  assert.equal(denied.status, 403);
  console.log('Public production: anonymous access blocked; persisted session accepted; organization and AI configuration valid; CSRF enforced. No content generated or changed.');
} finally { await pool.query('DELETE FROM marketing_studio_sessions WHERE token_hash=$1', [tokenHash]); await pool.end(); }
