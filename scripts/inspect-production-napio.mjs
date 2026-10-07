const origin = String(process.env.PRODUCTION_ORIGIN || 'https://taprontomenu.com.br').replace(/\/$/, '');
const email = process.env.ADMIN_SEED_EMAIL;
const password = process.env.ADMIN_SEED_PASSWORD;
if (!email || !password) throw new Error('Credenciais administrativas não configuradas.');

const login = await fetch(`${origin}/api/admin/login`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ email, password })
});
const loginBody = await login.json().catch(() => ({}));
if (!login.ok) throw new Error(`Login de produção recusado (${login.status}).`);
if (loginBody.requires_2fa) {
  console.log(JSON.stringify({ requires_2fa: true, email_hint: loginBody.email_hint || '' }));
  process.exit(2);
}

const cookies = typeof login.headers.getSetCookie === 'function'
  ? login.headers.getSetCookie()
  : [login.headers.get('set-cookie')].filter(Boolean);
const cookie = cookies.map((entry) => entry.split(';', 1)[0]).join('; ');
const response = await fetch(`${origin}/api/platform/assisted-registrations?q=${encodeURIComponent('Nápio')}`, {
  headers: { cookie }
});
const body = await response.json().catch(() => ({}));
if (!response.ok) throw new Error(`Consulta de pré-cadastro recusada (${response.status}).`);
console.log(JSON.stringify({
  registrations: (body.registrations || []).map((item) => ({
    id: item.id,
    status: item.status,
    establishment_name: item.establishment_name,
    version: item.version
  }))
}, null, 2));
