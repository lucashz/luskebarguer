import { existsSync, readFileSync } from 'node:fs';
import { mkdir, stat } from 'node:fs/promises';
import path from 'node:path';
import pg from 'pg';
import { renderReel } from '../src/lib/reel-renderer.js';

loadEnv(new URL('../.env', import.meta.url));
if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL não configurada.');
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 2 });
const once = process.argv.includes('--once');
const rootDir = process.env.APP_ROOT ? path.resolve(process.env.APP_ROOT) : process.cwd();
const uploadDir = path.resolve(rootDir, process.env.UPLOAD_DIR || 'uploads');
const publicBase = String(process.env.PUBLIC_APP_URL || process.env.APP_URL || 'https://taprontomenu.com.br').replace(/\/$/, '');
let stopping = false;
process.on('SIGTERM', () => { stopping = true; }); process.on('SIGINT', () => { stopping = true; });

try { do { await cycle(); if (!once && !stopping) await wait(15000); } while (!once && !stopping); } finally { await pool.end(); }

async function cycle() {
  const client = await pool.connect(); let job;
  try {
    await client.query('begin');
    job = (await client.query(`select * from social_reel_render_jobs where status in ('pending','failed') and (next_attempt_at is null or next_attempt_at<=now()) and (lock_expires_at is null or lock_expires_at<now()) order by created_at for update skip locked limit 1`)).rows[0];
    if (!job) { await client.query('commit'); return; }
    await client.query(`update social_reel_render_jobs set status='claimed',attempt_count=attempt_count+1,lock_expires_at=now()+interval '5 minutes',updated_at=now() where id=$1`, [job.id]);
    await client.query(`update marketing_content_items set render_status='preparing_assets',render_progress=5,render_error='',updated_at=now() where id=$1`, [job.content_id]);
    await client.query('commit');
    await processJob(client, job);
  } catch (error) {
    await client.query('rollback').catch(() => {});
    if (job) await markFailed(client, job, error);
    console.error(JSON.stringify({ scope: 'reel-render-worker', job_id: job?.id, message: error.message }));
  } finally { client.release(); }
}

async function processJob(client, job) {
  const context = (await client.query(`select c.*,a.storage_path source_storage from marketing_content_items c left join social_content_assets ca on ca.content_id=c.id and ca.role='media' left join social_media_assets a on a.id=ca.asset_id and a.kind='image' where c.id=$1 order by ca.sort_order limit 1`, [job.content_id])).rows[0];
  if (!context) throw new Error('Conteúdo do Reel não encontrado.');
  const outputDir = path.join(uploadDir, 'social', 'reels'); await mkdir(outputDir, { recursive: true });
  const sourcePath = context.source_storage ? path.join(uploadDir, context.source_storage.replace(/^\/?uploads\//, '')) : '';
  await client.query(`update social_reel_render_jobs set status='rendering',updated_at=now() where id=$1`, [job.id]);
  await client.query(`update marketing_content_items set render_status='rendering',render_progress=10,updated_at=now() where id=$1`, [job.content_id]);
  const result = await renderReel({ content: context, sourceImagePath: sourcePath && existsSync(sourcePath) ? sourcePath : '', outputDir, duration: job.duration_seconds, template: job.template, onProgress: (progress) => client.query(`update marketing_content_items set render_progress=$2,updated_at=now() where id=$1`, [job.content_id, progress]).catch(() => {}) });
  const relativeVideo = path.relative(uploadDir, result.outputPath).replaceAll('\\','/');
  const relativeCover = path.relative(uploadDir, result.coverPath).replaceAll('\\','/');
  const coverInfo = await stat(result.coverPath); const coverChecksum = `${result.checksum}-cover`;
  await client.query('begin');
  try {
    const video = (await client.query(`insert into social_media_assets(provider,kind,file_name,storage_path,public_url,content_type,size_bytes,width,height,duration_seconds,aspect_ratio,checksum_sha256,processing_status,validation_details) values('instagram','video',$1,$2,$3,'video/mp4',$4,1080,1920,$5,'9:16',$6,'ready',$7::jsonb) on conflict do nothing returning *`, [path.basename(result.outputPath), relativeVideo, `${publicBase}/uploads/${relativeVideo}`, result.size, result.script.duration, result.checksum, JSON.stringify({ generated_by:'local_reel_renderer', codec:'h264', template:job.template })])).rows[0] || (await client.query('select * from social_media_assets where checksum_sha256=$1', [result.checksum])).rows[0];
    const cover = (await client.query(`insert into social_media_assets(provider,kind,file_name,storage_path,public_url,content_type,size_bytes,width,height,aspect_ratio,checksum_sha256,processing_status,validation_details) values('instagram','image',$1,$2,$3,'image/jpeg',$4,1080,1920,'9:16',$5,'ready',$6::jsonb) on conflict do nothing returning *`, [path.basename(result.coverPath), relativeCover, `${publicBase}/uploads/${relativeCover}`, coverInfo.size, coverChecksum, JSON.stringify({ generated_by:'local_reel_renderer', role:'cover' })])).rows[0] || (await client.query('select * from social_media_assets where checksum_sha256=$1', [coverChecksum])).rows[0];
    await client.query(`delete from social_content_assets where content_id=$1 and role='media'`, [job.content_id]);
    await client.query(`insert into social_content_assets(content_id,asset_id,role,sort_order) values($1,$2,'media',0)`, [job.content_id, video.id]);
    await client.query(`update marketing_content_items set format='reel',aspect_ratio='9:16',duration_seconds=$2,video_template=$3,scenes=$4::jsonb,render_status='ready',render_progress=100,render_error='',rendered_at=now(),cover_asset_id=$5,content_version=content_version+1,updated_at=now() where id=$1`, [job.content_id, result.script.duration, job.template, JSON.stringify(result.script.scenes), cover.id]);
    await client.query(`update social_reel_render_jobs set status='ready',output_asset_id=$2,cover_asset_id=$3,lock_expires_at=null,last_error='',updated_at=now() where id=$1`, [job.id, video.id, cover.id]);
    await client.query('commit');
  } catch (error) { await client.query('rollback'); throw error; }
}

async function markFailed(client, job, error) { const message = String(error.message || '').slice(0,1000); const retry = Number(job.attempt_count || 0) < 3; await client.query(`update social_reel_render_jobs set status=$2,next_attempt_at=case when $2='pending' then now()+interval '2 minutes' else null end,lock_expires_at=null,last_error=$3,updated_at=now() where id=$1`, [job.id,retry?'pending':'failed',message]); await client.query(`update marketing_content_items set render_status=$2,render_error=$3,updated_at=now() where id=$1`, [job.content_id,retry?'pending':'failed',message]); }
function wait(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }
function loadEnv(url) { if (!existsSync(url)) return; for (const line of readFileSync(url,'utf8').split(/\r?\n/)) { const value=line.trim(); if(!value||value.startsWith('#')||!value.includes('=')) continue; const [key,...rest]=value.split('='); process.env[key.trim()] ||= rest.join('=').trim().replace(/^["']|["']$/g,''); } }
