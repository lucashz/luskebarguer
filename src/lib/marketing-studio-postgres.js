import { AsyncLocalStorage } from 'node:async_hooks';
import { createStudioAccounts } from './marketing-studio-accounts.js';
import { fail } from './marketing-studio.js';
const initialState = () => ({ brand: { name: '', color: '#496653', background: '#f5f1eb', services: '', tone: 'acolhedor e claro', contact: '', logoId: '' }, assets: [], posts: [], operations: [] });

export async function createStudioPostgres({ pool, organizationId, clinicId, limits = { images: 30, captions: 60 } }) {
  if (!/^[a-z0-9][a-z0-9-]{0,63}$/.test(organizationId) || !/^[a-f0-9-]{36}$/i.test(clinicId)) throw new Error('Invalid organization configuration');
  // Additive schema only; existing clinic tables are neither changed nor copied.
  await pool.query(`
    CREATE TABLE IF NOT EXISTS marketing_studio_orgs (
      id text PRIMARY KEY, clinic_id uuid NOT NULL, state jsonb NOT NULL,
      image_limit integer NOT NULL CHECK(image_limit BETWEEN 1 AND 1000),
      caption_limit integer NOT NULL CHECK(caption_limit BETWEEN 1 AND 1000), updated_at timestamptz NOT NULL DEFAULT now());
    CREATE TABLE IF NOT EXISTS marketing_studio_assets (
      org_id text NOT NULL REFERENCES marketing_studio_orgs(id), id uuid NOT NULL,
      bytes bytea NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(org_id,id));
    CREATE TABLE IF NOT EXISTS marketing_studio_sessions (
      token_hash text PRIMARY KEY, org_id text NOT NULL REFERENCES marketing_studio_orgs(id),
      csrf text NOT NULL, credential_version text NOT NULL, expires_at timestamptz NOT NULL);
    CREATE INDEX IF NOT EXISTS marketing_studio_sessions_expiry ON marketing_studio_sessions(expires_at);
    CREATE TABLE IF NOT EXISTS marketing_studio_login_limits (
      bucket text PRIMARY KEY, attempts integer NOT NULL, resets_at timestamptz NOT NULL);
  `);
  await pool.query('INSERT INTO marketing_studio_orgs(id,clinic_id,state,image_limit,caption_limit) VALUES($1,$2,$3,$4,$5) ON CONFLICT(id) DO NOTHING', [organizationId, clinicId, initialState(), limits.images, limits.captions]);
  const org = (await pool.query('SELECT clinic_id FROM marketing_studio_orgs WHERE id=$1', [organizationId])).rows[0];
  if (org.clinic_id !== clinicId) throw new Error('Organization is already bound to another clinic');
  const connections = new AsyncLocalStorage();
  function assertOrg(orgId) { if (orgId !== organizationId) throw fail(404, 'Organização não encontrada.'); }
  const accounts = await createStudioAccounts({ pool, organizationId, clinicId });
  return {
    ...accounts,
    persistence: {
      async snapshot(orgId) {
        assertOrg(orgId);
        const row = (await pool.query('SELECT state,image_limit,caption_limit FROM marketing_studio_orgs WHERE id=$1', [orgId])).rows[0];
        if (!row) throw fail(404, 'Organização não encontrada.');
        return { ...row.state, limits: { images: row.image_limit, captions: row.caption_limit } };
      },
      async exclusive(orgId, fn) {
        assertOrg(orgId);
        const client = await pool.connect(); let locked = false;
        try {
          // A session advisory lock spans reservations and provider calls. Saves are committed
          // separately so a worker crash cannot erase a paid-attempt reservation.
          await client.query("SELECT pg_advisory_lock(hashtextextended('marketing-studio:' || $1,0))", [orgId]); locked = true;
          const row = (await client.query('SELECT state,image_limit,caption_limit FROM marketing_studio_orgs WHERE id=$1', [orgId])).rows[0];
          if (!row) throw fail(404, 'Organização não encontrada.');
          const state = { ...row.state, limits: { images: row.image_limit, captions: row.caption_limit } };
          const save = async () => { await client.query('UPDATE marketing_studio_orgs SET state=$2,updated_at=now() WHERE id=$1', [orgId, state]); };
          return await connections.run(client, () => fn(state, save));
        } finally {
          let broken = false;
          if (locked) { try { await client.query("SELECT pg_advisory_unlock(hashtextextended('marketing-studio:' || $1,0))", [orgId]); } catch { broken = true; } }
          client.release(broken);
        }
      },
      async readAsset(orgId, id) {
        assertOrg(orgId);
        const row = (await (connections.getStore() || pool).query('SELECT bytes FROM marketing_studio_assets WHERE org_id=$1 AND id=$2', [orgId, id])).rows[0];
        if (!row) throw fail(404, 'Imagem não encontrada.'); return row.bytes;
      },
      async writeAsset(orgId, id, bytes) {
        assertOrg(orgId);
        await (connections.getStore() || pool).query('INSERT INTO marketing_studio_assets(org_id,id,bytes) VALUES($1,$2,$3)', [orgId, id, bytes]);
      },
    },
  };
}
