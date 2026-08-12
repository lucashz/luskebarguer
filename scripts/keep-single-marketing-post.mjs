import { existsSync, readFileSync, unlinkSync } from 'node:fs';
import path from 'node:path';
import pg from 'pg';

loadEnv(new URL('../.env', import.meta.url));
const keepContentId = process.argv[2];
if (!/^[0-9a-f-]{36}$/i.test(keepContentId || '')) throw new Error('Informe o UUID do conteúdo que deve ser preservado.');
if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL não configurada.');

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
const client = await pool.connect();
let removedFiles = 0;
try {
  await client.query('begin');
  const keep = (await client.query(`select c.id,a.id asset_id,a.storage_path from marketing_content_items c left join social_content_assets ca on ca.content_id=c.id left join social_media_assets a on a.id=ca.asset_id where c.id=$1 and c.channel='instagram'`, [keepContentId])).rows[0];
  if (!keep) throw new Error('O post escolhido para preservação não foi encontrado.');
  const candidates = (await client.query(`select distinct a.id,a.storage_path from marketing_content_items c join social_content_assets ca on ca.content_id=c.id join social_media_assets a on a.id=ca.asset_id where c.channel='instagram' and c.id<>$1`, [keepContentId])).rows;
  const runs = await client.query(`delete from marketing_autopilot_runs where content_id is distinct from $1 returning id`, [keepContentId]);
  const contents = await client.query(`delete from marketing_content_items where channel='instagram' and id<>$1 returning id`, [keepContentId]);
  const removedAssets = [];
  for (const asset of candidates) {
    if (asset.id === keep.asset_id) continue;
    const used = Number((await client.query('select count(*)::int total from social_content_assets where asset_id=$1', [asset.id])).rows[0].total);
    if (!used) {
      await client.query('delete from social_media_assets where id=$1', [asset.id]);
      if (asset.storage_path) removedAssets.push(asset.storage_path);
    }
  }
  await client.query(`update marketing_content_items set hashtags=$2,updated_at=now() where id=$1`, [keepContentId, ['#TáPronto','#CardápioDigital','#PedidosOnline','#Restaurante','#Delivery']]);
  await client.query('commit');

  const uploadRoot = path.resolve(process.env.UPLOAD_DIR || path.join(process.cwd(), 'uploads'));
  for (const storagePath of removedAssets) {
    const target = path.resolve(uploadRoot, storagePath);
    if (target !== uploadRoot && target.startsWith(`${uploadRoot}${path.sep}`) && existsSync(target)) { unlinkSync(target); removedFiles += 1; }
  }
  console.log(JSON.stringify({ kept_content_id: keepContentId, removed_contents: contents.rowCount, removed_runs: runs.rowCount, removed_assets: removedAssets.length, removed_files: removedFiles }));
} catch (error) {
  await client.query('rollback').catch(() => {});
  throw error;
} finally {
  client.release();
  await pool.end();
}

function loadEnv(url) {
  if (!existsSync(url)) return;
  for (const line of readFileSync(url, 'utf8').split(/\r?\n/)) {
    const value = line.trim(); if (!value || value.startsWith('#') || !value.includes('=')) continue;
    const index = value.indexOf('='); const key = value.slice(0, index).trim();
    if (!(key in process.env)) process.env[key] = value.slice(index + 1).trim().replace(/^['"]|['"]$/g, '');
  }
}
