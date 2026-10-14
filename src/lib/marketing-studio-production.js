import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { createStudioPostgres } from './marketing-studio-postgres.js';
import { createStudioStore, fail } from './marketing-studio.js';
import { importImageUrl } from './marketing-image-library.js';
import { createCanvaClient } from './marketing-canva.js';

const prefix = '/marketing';
const cookieName = '__Secure-studio_session';
const clinicCookie = '__Secure-clinic_session';
const cookie = (name, token, path, age = 28800) => `${name}=${token}; Path=${path}; Secure; HttpOnly; SameSite=Strict; Max-Age=${age}`;
const readCookie = (req, name) => (req.headers.cookie || '').split(';').map(v => v.trim()).find(v => v.startsWith(name + '='))?.slice(name.length + 1) || '';
const hash = (value) => createHash('sha256').update(value).digest('hex');
export async function createProductionStudio({ pool, organizationId, clinicId, root, origin, config, limits, imageRequest, captionRequest }) {
  if (new URL(origin).protocol !== 'https:') throw new Error('HTTPS is required');
  const auth = await createStudioPostgres({ pool, organizationId, clinicId, limits });
  const store = await createStudioStore({ root, config, limits, imageRequest, captionRequest, persistence: auth.persistence });
  const canvaClient = await createCanvaClient({ pool, config, origin });
  await pool.query(`CREATE TABLE IF NOT EXISTS marketing_studio_jobs (
    org_id text NOT NULL REFERENCES marketing_studio_orgs(id), key text NOT NULL, fingerprint text NOT NULL,
    status text NOT NULL, result jsonb, error text, created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(org_id,key));
    CREATE UNIQUE INDEX IF NOT EXISTS marketing_studio_one_active_job ON marketing_studio_jobs(org_id) WHERE status='running';`);
  const pending = new Set();
  const json = (res, status, data) => { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(data)); };
  const getJob = async (org, key) => (await pool.query('SELECT key,status,result,error,created_at FROM marketing_studio_jobs WHERE org_id=$1 AND key=$2', [org, key])).rows[0];
  async function body(req, limit = 8 * 1024 * 1024) {
    if (!String(req.headers['content-type'] || '').startsWith('application/json')) throw fail(415, 'Envie JSON.');
    let size = 0; const chunks = [];
    for await (const chunk of req) { size += chunk.length; if (size > limit) throw fail(413, 'Arquivo muito grande.'); chunks.push(chunk); }
    try { const data = JSON.parse(Buffer.concat(chunks).toString()); if (!data || Array.isArray(data) || typeof data !== 'object') throw new Error(); return data; } catch { throw fail(400, 'JSON inválido.'); }
  }
  async function enqueue(org, data) {
    if (!/^[a-zA-Z0-9-]{16,80}$/.test(data.key || '') || !['image', 'caption'].includes(data.kind)) throw fail(422, 'Solicitação inválida.');
    const fingerprint = hash(JSON.stringify(data));
    // An interrupted request is never automatically replayed after a process restart.
    await pool.query("UPDATE marketing_studio_jobs SET status='failed',error='Tentativa interrompida. Confira o histórico antes de tentar novamente.' WHERE org_id=$1 AND status='running' AND created_at<now()-interval '10 minutes'", [org]);
    let inserted;
    try { inserted = await pool.query("INSERT INTO marketing_studio_jobs(org_id,key,fingerprint,status) VALUES($1,$2,$3,'running') ON CONFLICT(org_id,key) DO NOTHING RETURNING key", [org, data.key, fingerprint]); }
    catch (error) { if (error.code === '23505') throw fail(409, 'Já existe uma geração em andamento. Aguarde a conclusão.'); throw error; }
    if (!inserted.rowCount) {
      const row = (await pool.query('SELECT fingerprint FROM marketing_studio_jobs WHERE org_id=$1 AND key=$2', [org, data.key])).rows[0];
      if (row.fingerprint !== fingerprint) throw fail(409, 'Esta chave pertence a outro pedido.');
      return { job: data.key };
    }
    const task = (async () => {
      try {
        const result = await store.generate(org, data);
        await pool.query("UPDATE marketing_studio_jobs SET status='done',result=$3 WHERE org_id=$1 AND key=$2", [org, data.key, result]);
      } catch (error) {
        await pool.query("UPDATE marketing_studio_jobs SET status='failed',error=$3 WHERE org_id=$1 AND key=$2", [org, data.key, error.status ? error.message : 'Falha na geração. Confira o histórico antes de repetir.']);
      }
    })();
    pending.add(task); task.catch(() => {}).finally(() => pending.delete(task));
    return { job: data.key };
  }
  return {
    store,
    async close() { await Promise.allSettled([...pending]); await store.close(); },
    async handle(req, res, next) {
      const pathname = new URL(req.url || '/', origin).pathname;
      const clinicRoute = pathname.replace(/^\/thai(?=\/api\/)/, '');
      const clinicAuth = /^\/api\/auth\/(login|session|logout)$/.test(clinicRoute);
      if (!clinicAuth && pathname !== prefix && !pathname.startsWith(prefix + '/')) return next();
      res.setHeader('Cache-Control', 'no-store'); res.setHeader('X-Content-Type-Options', 'nosniff'); res.setHeader('Referrer-Policy', 'no-referrer'); res.setHeader('X-Frame-Options', 'SAMEORIGIN');
      res.setHeader('Content-Security-Policy', "default-src 'self'; img-src 'self' blob:; script-src 'self'; style-src 'self'; connect-src 'self'; frame-ancestors 'self'; base-uri 'none'; form-action 'self'");
      try {
        if (req.headers.host !== new URL(origin).host) throw fail(403, 'Host inválido.');
        if (req.headers.origin && req.headers.origin !== origin) throw fail(403, 'Origem inválida.');
        if (!['GET', 'POST', 'PUT'].includes(req.method)) throw fail(405, 'Método não permitido.');
        if (req.method !== 'GET' && req.headers.origin !== origin) throw fail(403, 'Origem obrigatória.');
        if (clinicAuth) {
          if (clinicRoute === '/api/auth/login' && req.method === 'POST') {
            const data = await body(req, 4096);
            const result = await auth.login(data.username, data.password, String(req.headers['x-real-ip'] || req.socket.remoteAddress), true);
            res.setHeader('Set-Cookie', cookie(clinicCookie, result.token, '/'));
            json(res, 200, { username: result.username, csrf: result.csrf }); return;
          }
          const token = readCookie(req, clinicCookie);
          const session = await auth.session(token);
          if (!session?.clinicAccess) throw fail(401, 'Entre novamente na clínica.');
          if (clinicRoute === '/api/auth/session' && req.method === 'GET') { json(res, 200, { username: session.username, csrf: session.csrf }); return; }
          if (clinicRoute === '/api/auth/logout' && req.method === 'POST') {
            if (req.headers['x-studio-csrf'] !== session.csrf) throw fail(403, 'Sessão inválida.');
            await auth.logout(token); await auth.logout(readCookie(req, cookieName));
            res.setHeader('Set-Cookie', [cookie(clinicCookie, '', '/', 0), cookie(cookieName, '', '/marketing', 0)]);
            json(res, 200, {}); return;
          }
          throw fail(405, 'Método não permitido.');
        }
        const route = pathname.slice(prefix.length) || '/';
        const assets = { '/': ['index.html', 'text/html'], '/studio.js': ['studio.js', 'application/javascript'], '/studio.css': ['studio.css', 'text/css'] };
        if (req.method === 'GET' && assets[route]) {
          const [file, mime] = assets[route]; let bytes = await readFile(new URL(`../../marketing-studio/${file}`, import.meta.url));
          if (file === 'index.html') bytes = Buffer.from(bytes.toString().replace('href="/studio.css"', 'href="/marketing/studio.css"').replace('src="/studio.js"', 'src="/marketing/studio.js"').replace('href="/"', 'href="/marketing/"').replace('Prévia de desenvolvimento', 'Marketing da clínica'));
          res.writeHead(200, { 'Content-Type': `${mime}; charset=utf-8` }); res.end(bytes); return;
        }
        if (req.method === 'POST' && route === '/api/login') {
          const data = await body(req, 4096);
          const ip = String(req.headers['x-real-ip'] || req.socket.remoteAddress); // nginx overwrites X-Real-IP on this deployment.
          const session = await auth.login(data.username, data.password, ip);
          res.setHeader('Set-Cookie', `${cookieName}=${session.token}; Path=/marketing; Secure; HttpOnly; SameSite=Strict; Max-Age=28800`);
          json(res, 200, { csrf: session.csrf }); return;
        }
        if (req.method === 'POST' && route === '/api/activate') { json(res, 200, await auth.activate(await body(req, 4096), String(req.headers['x-real-ip'] || req.socket.remoteAddress))); return; }
        if (req.method === 'GET' && route === '/canva/callback') { await canvaClient.callback(new URL(req.url, origin).searchParams); res.writeHead(302, { Location: '/marketing/?canva=connected' }); res.end(); return; }
        let token = readCookie(req, clinicCookie);
        let session = await auth.session(token);
        if (!session?.clinicAccess) { token = readCookie(req, cookieName); session = await auth.session(token); }
        if (!session) throw fail(401, 'Entre com seu usuário e senha do marketing.');
        if (req.method !== 'GET' && req.headers['x-studio-csrf'] !== session.csrf) throw fail(403, 'Sessão inválida. Recarregue a página.');
        const org = session.organizationId;
        if (route === '/api/profile' && req.method === 'GET') { json(res, 200, await auth.profile(session)); return; }
        if (route === '/api/profile' && req.method === 'PUT') { json(res, 200, await auth.updateProfile(session, await body(req, 4096))); return; }
        if (route === '/api/profile/photo' && req.method === 'GET') { const photo = await auth.photo(session); res.writeHead(200, { 'Content-Type': 'image/png' }); res.end(photo); return; }
        if (route === '/api/profile/photo' && req.method === 'PUT') { json(res, 200, await auth.photo(session, await body(req, 3 * 1024 * 1024))); return; }
        if (route === '/api/profile/password' && req.method === 'PUT') {
          const result = await auth.changePassword(session, await body(req, 4096));
          res.setHeader('Set-Cookie', `${cookieName}=; Path=/marketing; Secure; HttpOnly; SameSite=Strict; Max-Age=0`); json(res, 200, result); return;
        }
        if (req.method === 'POST' && route === '/api/logout') {
          await auth.logout(token); res.setHeader('Set-Cookie', `${cookieName}=; Path=/marketing; Secure; HttpOnly; SameSite=Strict; Max-Age=0`); json(res, 200, {}); return;
        }
        if (req.method === 'GET' && route === '/api/studio') { json(res, 200, { ...await store.snapshot(org), organization: org, csrf: session.csrf }); return; }
        if (req.method === 'GET' && route === '/api/canva/status') { json(res, 200, await canvaClient.status(org)); return; }
        if (req.method === 'POST' && route === '/api/canva/connect') { json(res, 200, await canvaClient.connect(org)); return; }
        if (req.method === 'GET' && route === '/api/canva/search') { json(res, 200, { items: await canvaClient.search(org, new URL(req.url, origin).searchParams.get('q')) }); return; }
        const canvaThumb = route.match(/^\/api\/canva\/thumb\/([A-Za-z0-9_-]{5,160})$/);
        if (req.method === 'GET' && canvaThumb) { const bytes = await canvaClient.thumbnail(org, canvaThumb[1], true); res.writeHead(200, { 'Content-Type': 'image/png', 'Cache-Control': 'private, max-age=600' }); res.end(bytes); return; }
        if (req.method === 'POST' && route === '/api/canva/import') { const data = await body(req, 4096); const bytes = await canvaClient.thumbnail(org, data.id, true); json(res, 201, await store.upload(org, { name: String(data.title || 'Design do Canva').slice(0, 100), base64: bytes.toString('base64') })); return; }
        if (req.method === 'POST' && route === '/api/references/url') { const item = await importImageUrl((await body(req, 4096)).url); json(res, 201, await store.upload(org, { name: item.name, base64: item.bytes.toString('base64') })); return; }
        const image = route.match(/^\/api\/assets\/([a-f0-9-]{36})$/);
        if (req.method === 'GET' && image) {
          const bytes = await store.asset(org, image[1]); res.writeHead(200, { 'Content-Type': 'image/png', ...(new URL(req.url, origin).searchParams.has('download') ? { 'Content-Disposition': `attachment; filename="post-${image[1]}.png"` } : {}) }); res.end(bytes); return;
        }
        if (req.method === 'PUT' && route === '/api/brand') { json(res, 200, await store.brand(org, await body(req, 8192))); return; }
        if (req.method === 'POST' && route === '/api/references') { json(res, 201, await store.upload(org, await body(req))); return; }
        if (req.method === 'POST' && route === '/api/generate') { json(res, 202, await enqueue(org, await body(req, 8192))); return; }
        const jobMatch = route.match(/^\/api\/jobs\/([a-zA-Z0-9-]{16,80})$/);
        if (req.method === 'GET' && jobMatch) { const job = await getJob(org, jobMatch[1]); if (!job) throw fail(404, 'Geração não encontrada.'); json(res, 200, job); return; }
        if (req.method === 'PUT' && route === '/api/caption') { json(res, 200, await store.saveCaption(org, await body(req, 16384))); return; }
        throw fail(404, 'Página não encontrada.');
      } catch (error) { if (!res.headersSent) json(res, error.status || 500, { error: error.status ? error.message : 'Falha interna no Studio.' }); else res.end(); }
    },
  };
}
