import { randomUUID } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import pg from 'pg';
import { assertSafeMediaUrl, assertTransition, assetsApprovalHash, claimNextPublication, contentApprovalHash, createOAuthState, decryptSocialSecret, encryptSocialSecret, processClaimedPublication, publicationIdempotencyKey, verifyOAuthState } from '../src/lib/social-publishing.js';

loadEnv(new URL('../.env', import.meta.url));
if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL não configurada.');
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const config = { encryptionKey: 'smoke-social-key-with-more-than-32-characters', publicBase: 'https://taprontomenu.com.br', allowedMediaHosts: new Set(['taprontomenu.com.br']) };
const ids = { account: randomUUID(), content: randomUUID(), asset: randomUUID(), publication: randomUUID() };

try {
  const schema = await pool.query(`select to_regclass('public.social_accounts') accounts,to_regclass('public.social_publications') publications,to_regclass('public.social_publication_attempts') attempts`);
  assert(schema.rows[0].accounts && schema.rows[0].publications && schema.rows[0].attempts, 'Schema social ausente.');
  const encrypted = encryptSocialSecret('token-ultrassecreto', config);
  assert(encrypted !== 'token-ultrassecreto' && decryptSocialSecret(encrypted, config) === 'token-ultrassecreto', 'Criptografia de token falhou.');
  const oauth = createOAuthState(); assert(verifyOAuthState(oauth.state, oauth.hash) && !verifyOAuthState(`${oauth.state}x`, oauth.hash), 'Proteção do state OAuth falhou.');
  assertTransition('draft', 'review');
  assertThrows(() => assertTransition('draft', 'published'), 'Transição editorial inválida foi aceita.');
  assertThrows(() => assertSafeMediaUrl('https://evil.example/uploads/social/a.jpg', config), 'SSRF por host externo foi aceita.');
  assert(assertSafeMediaUrl('https://taprontomenu.com.br/uploads/social/a.jpg', config), 'URL segura foi rejeitada.');

  await pool.query(`insert into social_accounts(id,mode,provider_account_id,username,status,publishing_paused) values($1,'simulation',$2,'smoke','connected',false)`, [ids.account, `smoke-${ids.account}`]);
  await pool.query(`insert into marketing_content_items(id,title,channel,format,caption,cta,utm_url,status,scheduled_at,social_account_id) values($1,'Smoke social','instagram','image','Legenda smoke','Teste agora','https://taprontomenu.com.br/?utm_source=smoke','review',now()-interval '1 minute',$2)`, [ids.content, ids.account]);
  await pool.query(`insert into social_media_assets(id,kind,file_name,storage_path,public_url,content_type,size_bytes,checksum_sha256,processing_status) values($1,'image','smoke.png','social/smoke.png','https://taprontomenu.com.br/uploads/social/smoke.png','image/png',100,'smoke-checksum','ready')`, [ids.asset]);
  await pool.query(`insert into social_content_assets(content_id,asset_id,sort_order,role) values($1,$2,0,'media')`, [ids.content, ids.asset]);
  const content = (await pool.query('select * from marketing_content_items where id=$1', [ids.content])).rows[0];
  const asset = { ...(await pool.query('select * from social_media_assets where id=$1', [ids.asset])).rows[0], sort_order: 0, role: 'media' };
  content.status = 'scheduled'; content.approved_assets_hash = assetsApprovalHash([asset]); content.approved_version_hash = contentApprovalHash(content, [asset]);
  await pool.query(`update marketing_content_items set status='scheduled',approved_at=now(),approved_caption=caption,approved_assets_hash=$2,approved_version_hash=$3 where id=$1`, [ids.content, content.approved_assets_hash, content.approved_version_hash]);
  const account = (await pool.query('select * from social_accounts where id=$1', [ids.account])).rows[0];
  await pool.query(`insert into social_publications(id,content_id,account_id,content_version,idempotency_key,approved_hash,mode,status,scheduled_at) values($1,$2,$3,1,$4,$5,'simulation','queued',now()-interval '1 minute')`, [ids.publication, ids.content, ids.account, publicationIdempotencyKey(content, account), content.approved_version_hash]);
  const [first, second] = await Promise.all([claimNextPublication(pool, 'smoke-a'), claimNextPublication(pool, 'smoke-b')]);
  assert(Boolean(first) !== Boolean(second), 'Dois workers capturaram a mesma publicação.');
  await processClaimedPublication(pool, first || second, { ...process.env, INSTAGRAM_SIMULATION_MODE: 'true', SOCIAL_TOKEN_ENCRYPTION_KEY: config.encryptionKey, PUBLIC_APP_URL: config.publicBase });
  const result = await pool.query('select status from social_publications where id=$1', [ids.publication]);
  assert(result.rows[0]?.status === 'simulated', 'Worker simulado não concluiu a publicação.');
  console.log('Social publishing smoke: OK');
} finally {
  await pool.query('delete from social_publications where id=$1', [ids.publication]).catch(() => {});
  await pool.query('delete from marketing_content_items where id=$1', [ids.content]).catch(() => {});
  await pool.query('delete from social_media_assets where id=$1', [ids.asset]).catch(() => {});
  await pool.query('delete from social_accounts where id=$1', [ids.account]).catch(() => {});
  await pool.end();
}

function assert(condition, message) { if (!condition) throw new Error(message); }
function assertThrows(fn, message) { try { fn(); } catch { return; } throw new Error(message); }
function loadEnv(url) {
  if (!existsSync(url)) return;
  for (const line of readFileSync(url, 'utf8').split(/\r?\n/)) {
    const value = line.trim(); if (!value || value.startsWith('#') || !value.includes('=')) continue;
    const index = value.indexOf('='); const key = value.slice(0, index).trim();
    if (!(key in process.env)) process.env[key] = value.slice(index + 1).trim().replace(/^['"]|['"]$/g, '');
  }
}
