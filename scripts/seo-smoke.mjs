import { spawn } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';

loadEnv(new URL('../.env', import.meta.url));

const port = 3800 + Math.floor(Math.random() * 500);
const baseUrl = `http://127.0.0.1:${port}`;
let child;

try {
  child = await startServer();

  const robots = await page('/robots.txt', 'taprontomenu.com.br');
  assert(robots.status === 200, 'robots.txt publico nao respondeu 200.');
  assert(robots.type.includes('text/plain'), 'robots.txt nao retornou text/plain.');
  assert(robots.body.includes('Sitemap: https://taprontomenu.com.br/sitemap.xml'), 'robots.txt nao anuncia o sitemap canonico.');

  const privateRobots = await page('/robots.txt', 'app.taprontomenu.com.br');
  assert(privateRobots.body.includes('Disallow: /'), 'Host privado nao bloqueia rastreadores.');

  const sitemap = await page('/sitemap.xml', 'taprontomenu.com.br');
  assert(sitemap.status === 200 && sitemap.type.includes('application/xml'), 'Indice de sitemap invalido.');
  assert(sitemap.body.includes('/sitemap-pages.xml') && sitemap.body.includes('/sitemap-stores.xml'), 'Indice de sitemap incompleto.');

  const pages = await page('/sitemap-pages.xml', 'taprontomenu.com.br');
  assert(pages.body.includes('/cardapio-digital</loc>'), 'Landing principal ausente no sitemap.');
  assert(pages.body.includes('/sistema-de-pedidos-online</loc>'), 'Landing de pedidos ausente no sitemap.');
  assert(pages.body.includes('/guias</loc>') && pages.body.includes('/guias/como-criar-cardapio-digital</loc>'), 'Hub ou guias ausentes no sitemap.');
  assert(!pages.body.includes('/painel') && !pages.body.includes('/pagamento'), 'Sitemap contem rota privada.');

  const landing = await page('/cardapio-digital', 'taprontomenu.com.br');
  assert(landing.status === 200, 'Landing SEO nao respondeu 200.');
  assert(landing.body.includes('<link rel="canonical" href="https://taprontomenu.com.br/cardapio-digital">'), 'Canonical da landing ausente.');
  assert(landing.body.includes('FAQPage') && landing.body.includes('BreadcrumbList'), 'Dados estruturados da landing incompletos.');
  assert(landing.body.includes('<h1>'), 'Landing nao possui H1 renderizado no servidor.');

  const guidesHub = await page('/guias', 'taprontomenu.com.br');
  assert(guidesHub.status === 200, 'Hub de guias nao respondeu 200.');
  assert(guidesHub.body.includes('/guias/como-criar-cardapio-digital'), 'Hub nao aponta para os guias publicados.');

  const privatePage = await page('/admin.html', 'app.taprontomenu.com.br');
  assert(/noindex/i.test(privatePage.robots), 'Painel privado nao retorna X-Robots-Tag noindex.');

  const notFound = await page(`/seo-rota-inexistente-${Date.now()}`, 'taprontomenu.com.br');
  assert(notFound.status === 404, 'Rota publica inexistente nao retorna 404 real.');
  assert(/noindex/i.test(notFound.robots), 'Pagina 404 nao bloqueia indexacao.');

  console.log('SEO smoke: OK');
} finally {
  if (child && child.exitCode === null) {
    child.stdout?.removeAllListeners();
    child.stderr?.removeAllListeners();
    child.kill();
  }
}

async function page(pathname, host) {
  const response = await fetch(`${baseUrl}${pathname}`, { headers: { Host: host } });
  return {
    status: response.status,
    type: response.headers.get('content-type') || '',
    robots: response.headers.get('x-robots-tag') || '',
    body: await response.text()
  };
}

async function startServer() {
  const processChild = spawn(process.execPath, ['server.js'], {
    cwd: new URL('..', import.meta.url),
    env: {
      ...process.env,
      HOST: '127.0.0.1',
      PORT: String(port),
      COOKIE_SECURE: 'false',
      ADMIN_2FA_REQUIRED: 'false',
      APP_URL: baseUrl,
      PUBLIC_APP_URL: 'https://taprontomenu.com.br',
      PANEL_APP_URL: 'https://app.taprontomenu.com.br',
      PANEL_HOSTS: 'app.taprontomenu.com.br',
      PLATFORM_HOSTS: 'central.taprontomenu.com.br'
    },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  let logs = '';
  processChild.stdout.on('data', (chunk) => { logs += chunk.toString(); });
  processChild.stderr.on('data', (chunk) => { logs += chunk.toString(); });
  for (let attempt = 0; attempt < 60; attempt += 1) {
    if (processChild.exitCode !== null) throw new Error(`Servidor encerrou durante o boot.\n${logs}`);
    try {
      if ((await fetch(`${baseUrl}/api/health`)).ok) return processChild;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  processChild.kill();
  throw new Error(`Servidor nao respondeu.\n${logs}`);
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function loadEnv(url) {
  if (!existsSync(url)) return;
  for (const line of readFileSync(url, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#') || !trimmed.includes('=')) continue;
    const [key, ...rest] = trimmed.split('=');
    process.env[key.trim()] ||= rest.join('=').trim().replace(/^["']|["']$/g, '');
  }
}
