import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { request as httpRequest } from 'node:http';
import sharp from 'sharp';
import { createStudioServer } from '../src/lib/marketing-studio-server.js';
import { generateStudioCaption, generateStudioContentPlan, normalizeUpload, requestCloudflareImage, studioConfig } from '../src/lib/marketing-studio.js';

const env = { NODE_ENV: 'development', STUDIO_DEV_ENABLED: 'true' };
const brand = { name: 'Clínica Teste', color: '#345643', background: '#faf5ee', services: 'Cuidado estético', tone: 'acolhedor', contact: '@clinica', logoId: '' };
const image = await sharp({ create: { width: 300, height: 200, channels: 3, background: '#adbf91' } }).png().toBuffer();

test('development gates reject production and missing opt-in', async () => {
  for (const options of [{ NODE_ENV: 'production', STUDIO_DEV_ENABLED: 'true' }, { NODE_ENV: 'development' }, {}]) await assert.rejects(createStudioServer({ env: options }), /apenas/);
});

test('upload rejects disguised SVG, corrupt data and unsupported files', async () => {
  await assert.rejects(normalizeUpload(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>').toString('base64')), /inválida/);
  await assert.rejects(normalizeUpload('abc invalid'), /Envie/);
  const valid = await normalizeUpload(image.toString('base64'));
  assert.equal((await sharp(valid).metadata()).format, 'png');
});

test('HTTP flow: sessions, tenant isolation, versions, caption, limits and durable idempotency', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'studio-test-'));
  let imageCalls = 0; let captionCalls = 0; let firstEditInputs; let firstEditPrompt = '';
  const options = { env, organizations: ['alpha', 'beta'], root, config: { provider: 'openai', apiKey: 'fake-test-only', model: 'fake', quality: 'low' }, limits: { images: 2, captions: 1 },
    imageRequest: async (inputs, _name, prompt) => { imageCalls++; if (imageCalls === 1) { firstEditInputs = inputs; firstEditPrompt = prompt; } await new Promise((resolve) => setTimeout(resolve, 30)); return image; },
    captionRequest: async ({ image: final, subject }) => { captionCalls++; assert.equal((await sharp(final).metadata()).width, 1080); assert.equal(subject, 'Nosso espaço'); return 'Conheça nosso espaço. Fale com a clínica.'; },
  };
  let app = await createStudioServer(options); let origin = await app.listen(0);
  async function connect(org) {
    const link = new URL(app.developmentLink(org));
    const ticket = new URLSearchParams(link.hash.slice(1)).get('ticket');
    const response = await fetch(`${origin}/api/session`, { method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json' }, body: JSON.stringify({ ticket, organizationId: 'attacker' }) });
    assert.equal(response.status, 200); assert.match(response.headers.get('set-cookie'), /HttpOnly; SameSite=Strict/);
    const csrf = (await response.json()).csrf; const cookie = response.headers.get('set-cookie').split(';')[0];
    const replay = await fetch(`${origin}/api/session`, { method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json' }, body: JSON.stringify({ ticket }) }); assert.equal(replay.status, 401);
    return async (url, method = 'GET', data, headers = {}) => {
      const result = await fetch(origin + url, { method, headers: { Origin: origin, Cookie: cookie, 'X-Studio-Csrf': csrf, 'Content-Type': 'application/json', ...headers }, ...(data ? { body: JSON.stringify(data) } : {}) });
      return { status: result.status, data: result.headers.get('content-type')?.includes('json') ? await result.json() : Buffer.from(await result.arrayBuffer()) };
    };
  }
  try {
    assert.equal((await fetch(`${origin}/api/studio`)).status, 401);
    assert.equal((await fetch(`${origin}/api/generate`, { method: 'POST' })).status, 403);
    const a = await connect('alpha'); const b = await connect('beta');
    assert.equal((await a('/api/studio')).data.organization, 'alpha');
    const badHostStatus = await new Promise((resolve, reject) => { const req = httpRequest(origin + '/api/studio', { headers: { Host: 'evil.test' } }, (res) => { res.resume(); resolve(res.statusCode); }); req.on('error', reject); req.end(); });
    assert.equal(badHostStatus, 403);
    assert.equal((await a('/api/studio', 'GET', null, { 'X-Forwarded-For': '127.0.0.1' })).status, 403);
    assert.equal((await a('/api/brand', 'PUT', brand, { Origin: 'https://evil.test' })).status, 403);
    assert.equal((await a('/api/brand', 'PUT', brand, { 'X-Studio-Csrf': 'bad' })).status, 403);
    assert.equal((await a('/api/platform/marketing')).status, 404);
    assert.equal((await a('/api/brand', 'PUT', brand)).status, 200);
    assert.equal((await b('/api/studio')).data.brand.name, '');
    await b('/api/brand', 'PUT', { ...brand, name: 'Outra Clínica' });
    const uploaded = await a('/api/references', 'POST', { name: '../../escape.png', base64: image.toString('base64') }); assert.equal(uploaded.status, 201);
    assert.equal((await b(`/api/assets/${uploaded.data.id}`)).status, 404);
    assert.equal((await b('/api/brand', 'PUT', { ...brand, logoId: uploaded.data.id })).status, 404);
    assert.equal((await b('/api/generate', 'POST', { kind: 'image', key: randomUUID(), subject: 'x', format: '4:5', referenceIds: [uploaded.data.id] })).status, 404);
    const request = { kind: 'image', key: randomUUID(), subject: 'Nosso espaço', format: '4:5', referenceIds: [uploaded.data.id], organizationId: 'beta' };
    const [one, two] = await Promise.all([a('/api/generate', 'POST', request), a('/api/generate', 'POST', request)]);
    assert.equal(one.status, 200); assert.deepEqual(one, two); assert.equal(imageCalls, 1);
    assert.equal(firstEditInputs.length, 1); assert.deepEqual(firstEditInputs[0], image); assert.match(firstEditPrompt, /imagem 0 como imagem-base e edite-a diretamente/);
    assert.equal((await a('/api/generate', 'POST', { ...request, key: randomUUID() })).status, 200); assert.equal(imageCalls, 1);
    assert.equal((await a('/api/generate', 'POST', { ...request, subject: 'different' })).status, 409);
    const post = (await a('/api/studio')).data.posts[0];
    assert.equal((await b('/api/studio')).data.posts.length, 0);
    assert.equal((await b('/api/generate', 'POST', { kind: 'image', key: randomUUID(), postId: post.id, versionId: post.versions[0].id, adjustment: 'clarear' })).status, 404);
    const caption = await a('/api/generate', 'POST', { kind: 'caption', key: randomUUID(), ...one.data }); assert.equal(caption.status, 200); assert.equal(captionCalls, 1);
    assert.equal((await a('/api/caption', 'PUT', { ...one.data, caption: 'Minha legenda manual' })).status, 200);
    const edit = await a('/api/generate', 'POST', { kind: 'image', key: randomUUID(), ...one.data, adjustment: 'Fundo claro' }); assert.equal(edit.status, 200);
    const snapshot = (await a('/api/studio')).data; assert.equal(snapshot.posts[0].versions.length, 2); assert.equal(snapshot.posts[0].versions[0].caption, 'Minha legenda manual'); assert.equal(snapshot.posts[0].versions[1].caption, '');
    assert.equal(snapshot.posts[0].versions[1].parentId, one.data.versionId);
    const downloaded = await a(`/api/assets/${snapshot.posts[0].versions[1].assetId}?download`); const metadata = await sharp(downloaded.data).metadata(); assert.equal(metadata.width, 1080); assert.equal(metadata.height, 1350);
    assert.equal((await a('/api/generate', 'POST', { kind: 'image', key: randomUUID(), subject: 'Outro assunto', format: '9:16' })).status, 429);
    assert.equal((await a('/api/generate', 'POST', { kind: 'caption', key: randomUUID(), ...edit.data })).status, 429);
    assert.equal((await b('/api/generate', 'POST', { kind: 'image', key: randomUUID(), subject: 'Beta', format: '9:16' })).status, 200);
    await app.close(); app = await createStudioServer(options); origin = await app.listen(0);
    const restarted = await connect('alpha');
    assert.equal((await restarted('/api/generate', 'POST', request)).status, 200); assert.equal(imageCalls, 3);
    assert.equal((await restarted('/api/studio')).data.usage.images, 2);
  } finally { await app.close(); await rm(root, { recursive: true, force: true }); }
});

test('failed paid attempt is reserved, replay never calls provider again', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'studio-failure-')); let calls = 0;
  const app = await createStudioServer({ env, organizations: ['alpha'], root, config: { provider: 'openai', apiKey: 'fake' }, limits: { images: 1, captions: 1 }, imageRequest: async () => { calls++; throw new Error('timeout'); } });
  try {
    await app.store.brand('alpha', brand);
    const request = { kind: 'image', key: randomUUID(), subject: 'Teste', format: '4:5' };
    await assert.rejects(app.store.generate('alpha', request), /falhou/);
    await assert.rejects(app.store.generate('alpha', request), /registrada/);
    await assert.rejects(app.store.generate('alpha', { ...request, key: randomUUID(), subject: 'Novo' }), /Limite/);
    assert.equal(calls, 1); assert.equal((await app.store.snapshot('alpha')).usage.images, 1);
  } finally { await app.close(); await rm(root, { recursive: true, force: true }); }
});

test('missing provider credits fails clearly without creating a misleading local image', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'studio-no-credits-'));
  const app = await createStudioServer({ env, organizations: ['alpha'], root, config: { provider: 'openai', apiKey: 'fake' }, imageRequest: async () => { throw new Error('You have no credits remaining. Add credits to continue using the API.'); } });
  try {
    await app.store.brand('alpha', brand);
    await assert.rejects(app.store.generate('alpha', { kind: 'image', key: randomUUID(), subject: 'Cuidados com a pele', format: '4:5' }), /sem créditos/);
    const state = await app.store.snapshot('alpha');
    assert.equal(state.posts.length, 0); assert.equal(state.assets.length, 0);
  } finally { await app.close(); await rm(root, { recursive: true, force: true }); }
});

test('local composition and adjustment have no external image dependency', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'studio-local-'));
  const app = await createStudioServer({ env, organizations: ['alpha'], root, config: { provider: 'local', apiKey: '' } });
  try {
    await app.store.brand('alpha', brand);
    const created = await app.store.generate('alpha', { kind: 'image', key: randomUUID(), subject: 'Bem-vinda', format: '9:16' });
    await app.store.generate('alpha', { kind: 'image', key: randomUUID(), ...created, adjustment: 'clarear' });
    await assert.rejects(app.store.generate('alpha', { kind: 'image', key: randomUUID(), ...created, adjustment: 'Trocar fundo' }), /modo local/);
    const state = await app.store.snapshot('alpha'); assert.equal(state.usage.images, 2);
    const bytes = await app.store.asset('alpha', state.posts[0].versions[1].assetId); assert.equal((await sharp(bytes).metadata()).height, 1920);
    await assert.rejects(app.store.generate('alpha', { kind: 'caption', key: randomUUID(), ...created }), /OPENAI_API_KEY/);
    assert.equal((await app.store.snapshot('alpha')).usage.captions, 0);
  } finally { await app.close(); await rm(root, { recursive: true, force: true }); }
});

test('caption adapter sends final image and compact context, no conversation history', async () => {
  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = async (url, options) => {
      assert.equal(url, 'https://api.openai.com/v1/responses');
      const payload = JSON.parse(options.body); assert.equal(payload.store, false); assert.equal(payload.input.length, 1); assert.equal(payload.max_output_tokens, 420);
      assert.match(payload.input[0].content[1].image_url, /^data:image\/jpeg;base64,/);
      return { ok: true, json: async () => ({ status: 'completed', output: [{ content: [{ type: 'output_text', text: 'Uma legenda.' }] }] }) };
    };
    assert.equal(await generateStudioCaption({ image, brand, subject: 'Espaço', adjustment: '', config: { apiKey: 'fake', captionModel: 'test' } }), 'Uma legenda.');
  } finally { globalThis.fetch = originalFetch; }
});

test('Cloudflare adapter edits image 0 through multipart and returns the generated image', async () => {
  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = async (url, options) => {
      assert.equal(url, 'https://api.cloudflare.com/client/v4/accounts/account-test/ai/run/@cf/black-forest-labs/flux-2-klein-4b');
      assert.equal(options.headers.Authorization, 'Bearer token-test');
      assert.equal(options.body.get('prompt'), 'Edite a imagem 0');
      assert.equal(options.body.get('width'), '1024'); assert.equal(options.body.get('height'), '1280');
      assert.ok(options.body.get('input_image_0') instanceof Blob);
      assert.equal(options.body.get('input_image_1'), null);
      const compact = Buffer.from(await options.body.get('input_image_0').arrayBuffer());
      const meta = await sharp(compact).metadata(); assert.ok(meta.width <= 511); assert.ok(meta.height <= 511);
      return new Response(image, { status: 200, headers: { 'Content-Type': 'image/png' } });
    };
    const result = await requestCloudflareImage([image], 'base.png', 'Edite a imagem 0', {
      cloudflareAccountId: 'account-test', cloudflareApiToken: 'token-test', cloudflareImageModel: '@cf/black-forest-labs/flux-2-klein-4b',
    }, 'low', '4:5');
    assert.deepEqual(result, image);
    assert.equal(studioConfig({ MARKETING_IMAGE_PROVIDER: 'cloudflare' }).provider, 'cloudflare');
  } finally { globalThis.fetch = originalFetch; }
});

test('content planner returns three short validated sections and strips numbers', async () => {
  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = async () => new Response(JSON.stringify({ result: { choices: [{ message: { content: JSON.stringify({
      title: 'Harmonização facial', subtitle: 'Informação para escolhas conscientes', cta: 'Converse com a equipe',
      highlights: [{ title: 'Benefícios', text: 'Avaliação individual antes de decidir' }, { title: 'Exageros', text: 'Preço R$ 599 e 3 aplicações' }, { title: 'Tendências', text: 'Abordagens mais sutis e individualizadas' }],
    }) } }] }, success: true }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    const plan = await generateStudioContentPlan({ brand, subject: 'Harmonização facial', config: { cloudflareAccountId: 'account', cloudflareApiToken: 'token' } });
    assert.equal(plan.highlights.length, 3); assert.doesNotMatch(JSON.stringify(plan), /599|\b3\b|R\s*\$/);
  } finally { globalThis.fetch = originalFetch; }
});

test('simple adjustments reuse local composition even with the paid provider selected', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'studio-savings-')); let calls = 0;
  const app = await createStudioServer({ env, organizations: ['alpha'], root, config: { provider: 'openai', apiKey: 'fake' }, imageRequest: async () => { calls++; return image; } });
  try {
    await app.store.brand('alpha', brand);
    const result = await app.store.generate('alpha', { kind: 'image', key: randomUUID(), subject: 'Cuidados', format: '4:5' });
    await app.store.generate('alpha', { kind: 'image', key: randomUUID(), ...result, adjustment: 'clarear' });
    assert.equal(calls, 1); assert.equal((await app.store.snapshot('alpha')).posts[0].versions.length, 2);
  } finally { await app.close(); await rm(root, { recursive: true, force: true }); }
});

test('central source remains independent of the Studio and image adapter keeps original logic', async () => {
  for (const file of ['server.js', 'public/platform.js', 'src/lib/social-publishing.js']) assert.doesNotMatch(await readFile(new URL(`../${file}`, import.meta.url), 'utf8'), /marketing-studio/);
  const source = await readFile(new URL('../src/lib/marketing-autopilot.js', import.meta.url), 'utf8');
  assert.match(source, /export async function requestOpenAiImage/);
});
