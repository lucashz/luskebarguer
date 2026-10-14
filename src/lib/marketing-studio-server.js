import { createServer } from 'node:http';
import { randomBytes, createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { createStudioStore, fail } from './marketing-studio.js';

const hash = (token) => createHash('sha256').update(token).digest('hex');
const cookieName = 'studio_dev_session';
const ttl = 8 * 60 * 60 * 1000;

export async function createStudioServer({ env = process.env, organizations, root, config, limits, imageRequest, captionRequest }) {
  if (env.NODE_ENV !== 'development' || env.STUDIO_DEV_ENABLED !== 'true') throw new Error('Marketing Studio disponível apenas com NODE_ENV=development e STUDIO_DEV_ENABLED=true.');
  if (!organizations?.length || organizations.some((org) => !/^[a-z0-9][a-z0-9-]{0,63}$/.test(org))) throw new Error('Informe organizações válidas no servidor.');
  const store = await createStudioStore({ root, config, limits, imageRequest, captionRequest });
  const sessions = new Map(); const tickets = new Map();
  let origin = '';
  const json = (res, status, value) => { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(value)); };
  async function body(req) {
    if (!String(req.headers['content-type']).startsWith('application/json')) throw fail(415, 'Envie JSON.');
    let size = 0; const chunks = [];
    for await (const chunk of req) { size += chunk.length; if (size > 7.1 * 1024 * 1024) throw fail(413, 'Arquivo muito grande.'); chunks.push(chunk); }
    try { const data = JSON.parse(Buffer.concat(chunks).toString()); if (!data || Array.isArray(data) || typeof data !== 'object') throw new Error(); return data; }
    catch { throw fail(400, 'JSON inválido.'); }
  }
  const server = createServer(async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Content-Security-Policy', "default-src 'self'; img-src 'self' blob:; script-src 'self'; style-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
    try {
      if (req.socket.remoteAddress !== '127.0.0.1' || req.headers.host !== new URL(origin).host || Object.keys(req.headers).some((header) => header === 'forwarded' || header.startsWith('x-forwarded-'))) throw fail(403, 'Acesso somente pelo endereço local de desenvolvimento.');
      const url = new URL(req.url, origin);
      if (!['GET', 'POST', 'PUT'].includes(req.method)) throw fail(405, 'Método não permitido.');
      if (req.headers.origin && req.headers.origin !== origin) throw fail(403, 'Origem inválida.');
      if (['POST', 'PUT'].includes(req.method) && req.headers.origin !== origin) throw fail(403, 'Origem obrigatória.');
      const staticFiles = { '/': ['index.html', 'text/html'], '/studio.js': ['studio.js', 'text/javascript'], '/studio.css': ['studio.css', 'text/css'] };
      if (req.method === 'GET' && staticFiles[url.pathname]) {
        const [file, type] = staticFiles[url.pathname];
        res.writeHead(200, { 'Content-Type': `${type}; charset=utf-8` }); res.end(await readFile(new URL(`../../marketing-studio/${file}`, import.meta.url))); return;
      }
      if (req.method === 'POST' && url.pathname === '/api/session') {
        const data = await body(req); const key = hash(String(data.ticket || '')); const ticket = tickets.get(key);
        if (!ticket || ticket.expires < Date.now()) throw fail(401, 'Abra o link de desenvolvimento exibido no terminal.');
        tickets.delete(key);
        const token = randomBytes(32).toString('base64url'); const csrf = randomBytes(24).toString('base64url');
        sessions.set(hash(token), { organizationId: ticket.organizationId, csrf, expires: Date.now() + ttl });
        res.setHeader('Set-Cookie', `${cookieName}=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${ttl / 1000}`);
        json(res, 200, { csrf }); return;
      }
      const token = (req.headers.cookie || '').split(';').map((v) => v.trim()).find((v) => v.startsWith(`${cookieName}=`))?.slice(cookieName.length + 1) || '';
      const session = sessions.get(hash(token));
      if (!session || session.expires < Date.now()) { sessions.delete(hash(token)); throw fail(401, 'Sessão ausente ou expirada. Abra o link de desenvolvimento do terminal.'); }
      if (req.method !== 'GET' && req.headers['x-studio-csrf'] !== session.csrf) throw fail(403, 'Sessão inválida. Recarregue a página.');
      const org = session.organizationId;
      if (req.method === 'GET' && url.pathname === '/api/studio') { json(res, 200, { ...await store.snapshot(org), organization: org, csrf: session.csrf }); return; }
      const asset = url.pathname.match(/^\/api\/assets\/([a-f0-9-]{36})$/);
      if (req.method === 'GET' && asset) {
        const bytes = await store.asset(org, asset[1]);
        res.writeHead(200, { 'Content-Type': 'image/png', ...(url.searchParams.has('download') ? { 'Content-Disposition': `attachment; filename="post-${asset[1]}.png"` } : {}) }); res.end(bytes); return;
      }
      if (req.method === 'PUT' && url.pathname === '/api/brand') { json(res, 200, await store.brand(org, await body(req))); return; }
      if (req.method === 'POST' && url.pathname === '/api/references') { json(res, 201, await store.upload(org, await body(req))); return; }
      if (req.method === 'POST' && url.pathname === '/api/generate') { json(res, 200, await store.generate(org, await body(req))); return; }
      if (req.method === 'PUT' && url.pathname === '/api/caption') { json(res, 200, await store.saveCaption(org, await body(req))); return; }
      throw fail(404, 'Página não encontrada.');
    } catch (error) { if (!res.headersSent) json(res, error.status || 500, { error: error.status ? error.message : 'Falha interna no Studio.' }); else res.end(); }
  });
  return {
    server, store,
    async listen(port = 7071) {
      await new Promise((resolve, reject) => { server.once('error', reject); server.listen(port, '127.0.0.1', resolve); });
      origin = `http://127.0.0.1:${server.address().port}`;
      return origin;
    },
    developmentLink(org) {
      if (!organizations.includes(org) || !origin) throw new Error('Organização não configurada.');
      const ticket = randomBytes(32).toString('base64url');
      tickets.set(hash(ticket), { organizationId: org, expires: Date.now() + 10 * 60_000 });
      return `${origin}/#ticket=${ticket}`;
    },
    async close() {
      if (server.listening) await new Promise((resolve) => server.close(resolve));
      await store.close(); sessions.clear(); tickets.clear();
    },
  };
}
