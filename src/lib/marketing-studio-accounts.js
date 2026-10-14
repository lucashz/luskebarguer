import { randomBytes, randomUUID, createHash, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import sharp from 'sharp';
import { fail, normalizeUpload } from './marketing-studio.js';
const derive = promisify(scrypt);
const hash = value => createHash('sha256').update(value).digest('hex');
async function passwordHash(password) {
  if (typeof password !== 'string' || password.length < 8 || password.length > 128) throw fail(422, 'Use uma senha de 8 a 128 caracteres.');
  const salt = randomBytes(16).toString('hex'); return `${salt}:${(await derive(password, salt, 64)).toString('hex')}`;
}
async function verify(password, stored) {
  if (typeof password !== 'string' || password.length > 256) return false;
  const [salt, key] = String(stored || 'invalid:00').split(':');
  const actual = await derive(password, salt, 64); const expected = Buffer.from(key || '', 'hex');
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

export async function provisionStudioAdministrator(pool, org, username, displayName) {
  username = String(username).trim().toLowerCase();
  if (!/^[a-z0-9._-]{3,40}$/.test(username)) throw fail(422, 'Usuário inválido.');
  const token = randomBytes(32).toString('base64url');
  const result = await pool.query(`INSERT INTO marketing_studio_users(id,org_id,username,display_name,source,role,active,activation_hash,activation_expires)
    VALUES($1,$2,$3,$4,'local','admin',false,$5,now()+interval '48 hours') ON CONFLICT(org_id,username) DO NOTHING RETURNING id`, [randomUUID(), org, username, displayName, hash(token)]);
  if (!result.rowCount) throw fail(409, 'Esta conta já existe; nenhuma credencial foi alterada.');
  return { username, activationToken: token };
}

export async function createStudioAccounts({ pool, organizationId, clinicId }) {
  await pool.query(`CREATE TABLE IF NOT EXISTS marketing_studio_users (
    id uuid PRIMARY KEY, org_id text NOT NULL REFERENCES marketing_studio_orgs(id), username text NOT NULL,
    display_name text NOT NULL DEFAULT '', email text NOT NULL DEFAULT '', photo bytea,
    source text NOT NULL CHECK(source IN ('clinic','local')), role text NOT NULL DEFAULT 'admin' CHECK(role IN ('admin','editor')),
    password_hash text, active boolean NOT NULL DEFAULT true, activation_hash text UNIQUE, activation_expires timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(org_id,username));
    CREATE UNIQUE INDEX IF NOT EXISTS marketing_studio_clinic_user ON marketing_studio_users(org_id) WHERE source='clinic';
    ALTER TABLE marketing_studio_sessions ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES marketing_studio_users(id);
    ALTER TABLE marketing_studio_users ADD COLUMN IF NOT EXISTS clinic_access boolean NOT NULL DEFAULT false;`);
  const legacy = (await pool.query('SELECT username FROM clinic_admin_credentials WHERE clinic_id=$1', [clinicId])).rows[0];
  if (legacy) {
    await pool.query(`INSERT INTO marketing_studio_users(id,org_id,username,display_name,source) VALUES($1,$2,$3,$4,'clinic') ON CONFLICT DO NOTHING`, [randomUUID(), organizationId, legacy.username.toLowerCase(), legacy.username]);
    await pool.query(`UPDATE marketing_studio_sessions SET user_id=(SELECT id FROM marketing_studio_users WHERE org_id=$1 AND source='clinic') WHERE org_id=$1 AND user_id IS NULL`, [organizationId]);
  }
  async function account(id, client = pool) {
    const row = (await client.query(`SELECT u.*,c.username clinic_username,c.password_hash clinic_password_hash
      FROM marketing_studio_users u JOIN marketing_studio_orgs o ON o.id=u.org_id
      LEFT JOIN clinic_admin_credentials c ON c.clinic_id=o.clinic_id
      WHERE u.org_id=$1 AND u.id=$2`, [organizationId, id])).rows[0];
    if (!row) return null;
    const username = row.source === 'clinic' ? row.clinic_username : row.username;
    const secret = row.source === 'clinic' ? row.clinic_password_hash : row.password_hash;
    return { ...row, username, secret, version: hash(`${username}:${secret}`) };
  }
  const publicProfile = row => ({ id: row.id, username: row.username, displayName: row.display_name, email: row.email, hasPhoto: Boolean(row.photo), role: row.role, sharedClinicPassword: row.source === 'clinic' });
  async function throttle(ip) {
    const bucket = hash(organizationId + ':' + String(ip));
    const attempt = (await pool.query(`INSERT INTO marketing_studio_login_limits(bucket,attempts,resets_at) VALUES($1,1,now()+interval '15 minutes')
      ON CONFLICT(bucket) DO UPDATE SET attempts=CASE WHEN marketing_studio_login_limits.resets_at<now() THEN 1 ELSE marketing_studio_login_limits.attempts+1 END,
      resets_at=CASE WHEN marketing_studio_login_limits.resets_at<now() THEN now()+interval '15 minutes' ELSE marketing_studio_login_limits.resets_at END RETURNING attempts`, [bucket])).rows[0];
    if (attempt.attempts > 10) throw fail(429, 'Muitas tentativas. Aguarde 15 minutos para tentar novamente.');
    return bucket;
  }
  return {
    async login(username, password, ip, clinicOnly = false) {
      username = String(username || '').trim().toLowerCase();
      if (!username || username.length > 80 || !password || String(password).length > 256) throw fail(401, 'Usuário ou senha inválidos.');
      const bucket = await throttle(ip);
      const rows = (await pool.query(`SELECT id,source,username FROM marketing_studio_users WHERE org_id=$1 AND active AND (source='clinic' OR username=$2) ORDER BY source='local' DESC`, [organizationId, username])).rows;
      let user;
      for (const row of rows) { const candidate = await account(row.id); if (candidate.username?.toLowerCase() === username) { user = candidate; break; } }
      if (!await verify(password, user?.secret) || !user || (clinicOnly && user.source !== 'clinic' && !user.clinic_access)) throw fail(401, 'Usuário ou senha inválidos.');
      const token = randomBytes(32).toString('base64url'); const csrf = randomBytes(24).toString('base64url');
      await pool.query("INSERT INTO marketing_studio_sessions(token_hash,org_id,user_id,csrf,credential_version,expires_at) VALUES($1,$2,$3,$4,$5,now()+interval '8 hours')", [hash(token), organizationId, user.id, csrf, user.version]);
      await pool.query('DELETE FROM marketing_studio_login_limits WHERE bucket=$1 OR resets_at<now()', [bucket]);
      await pool.query('DELETE FROM marketing_studio_sessions WHERE expires_at<now()');
      return { token, csrf, username: user.username };
    },
    async session(token) {
      if (!/^[A-Za-z0-9_-]{43}$/.test(token || '')) return null;
      const session = (await pool.query('SELECT user_id,csrf,credential_version FROM marketing_studio_sessions WHERE token_hash=$1 AND org_id=$2 AND expires_at>now()', [hash(token), organizationId])).rows[0];
      if (!session?.user_id) return null;
      const user = await account(session.user_id);
      if (!user?.active || session.credential_version !== user.version) { await pool.query('DELETE FROM marketing_studio_sessions WHERE token_hash=$1', [hash(token)]); return null; }
      return { organizationId, userId: user.id, role: user.role, csrf: session.csrf, source: user.source, username: user.username, clinicAccess: user.source === 'clinic' || user.clinic_access };
    },
    async logout(token) { await pool.query('DELETE FROM marketing_studio_sessions WHERE token_hash=$1 AND org_id=$2', [hash(token || ''), organizationId]); },
    async profile(session) { const user = await account(session.userId); if (!user) throw fail(404, 'Perfil não encontrado.'); return publicProfile(user); },
    async updateProfile(session, data) {
      const name = String(data.displayName || '').trim(); const email = String(data.email || '').trim();
      if (!name || name.length > 80 || email.length > 160 || (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))) throw fail(422, 'Informe um nome e um e-mail válido (opcional).');
      await pool.query('UPDATE marketing_studio_users SET display_name=$3,email=$4 WHERE org_id=$1 AND id=$2', [organizationId, session.userId, name, email]);
      return publicProfile(await account(session.userId));
    },
    async photo(session, data) {
      if (data === undefined) { const user = await account(session.userId); if (!user?.photo) throw fail(404, 'Foto não encontrada.'); return user.photo; }
      let photo = null;
      if (data.remove !== true) {
        if (String(data.base64 || '').length > 2.8 * 1024 * 1024) throw fail(413, 'Envie uma foto de até 2 MB.');
        photo = await sharp(await normalizeUpload(data.base64)).resize(320, 320, { fit: 'cover' }).png().toBuffer();
      }
      await pool.query('UPDATE marketing_studio_users SET photo=$3 WHERE org_id=$1 AND id=$2', [organizationId, session.userId, photo]);
      return { hasPhoto: Boolean(photo) };
    },
    async changePassword(session, data) {
      await throttle('password:' + session.userId);
      if (data.newPassword !== data.confirmPassword) throw fail(422, 'A confirmação da senha não confere.');
      const secret = await passwordHash(data.newPassword); const client = await pool.connect();
      try {
        await client.query('BEGIN');
        await client.query('SELECT id FROM marketing_studio_users WHERE org_id=$1 AND id=$2 FOR UPDATE', [organizationId, session.userId]);
        let user = await account(session.userId, client);
        if (user.source === 'clinic') { await client.query('SELECT clinic_id FROM clinic_admin_credentials WHERE clinic_id=$1 FOR UPDATE', [clinicId]); user = await account(session.userId, client); }
        if (!await verify(data.currentPassword, user.secret)) throw fail(422, 'Senha atual incorreta.');
        if (user.source === 'clinic') await client.query('UPDATE clinic_admin_credentials SET password_hash=$2 WHERE clinic_id=$1', [clinicId, secret]);
        else await client.query('UPDATE marketing_studio_users SET password_hash=$3 WHERE org_id=$1 AND id=$2', [organizationId, user.id, secret]);
        await client.query('DELETE FROM marketing_studio_sessions WHERE org_id=$1 AND user_id=$2', [organizationId, user.id]);
        await client.query('COMMIT'); return { changed: true };
      } catch (error) { await client.query('ROLLBACK'); throw error; } finally { client.release(); }
    },
    async activate(data, ip) {
      await throttle('activation:' + ip);
      if (!/^[A-Za-z0-9_-]{43}$/.test(data.token || '')) throw fail(422, 'Link de ativação inválido ou expirado.');
      if (data.password !== data.confirmPassword) throw fail(422, 'A confirmação da senha não confere.');
      const secret = await passwordHash(data.password);
      const row = (await pool.query(`UPDATE marketing_studio_users SET password_hash=$3,active=true,activation_hash=NULL,activation_expires=NULL
        WHERE org_id=$1 AND activation_hash=$2 AND activation_expires>now() AND NOT active RETURNING username`, [organizationId, hash(data.token), secret])).rows[0];
      if (!row) throw fail(422, 'Link de ativação inválido ou expirado.'); return { username: row.username };
    },
  };
}
