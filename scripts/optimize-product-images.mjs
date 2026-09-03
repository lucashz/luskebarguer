import { readFileSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import pg from 'pg';
import sharp from 'sharp';

loadEnv(new URL('../.env', import.meta.url));

const apply = process.argv.includes('--apply');
const storeSlug = String(process.env.OPTIMIZE_STORE_SLUG || '').trim().toLowerCase();
const uploadDir = path.resolve(process.env.UPLOAD_DIR || new URL('../uploads', import.meta.url).pathname);
if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL ausente.');

const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
const report = [];
try {
  await client.connect();
  const rows = (await client.query(`
    select mi.id, mi.name, mi.image_url, s.slug as store_slug
      from public.menu_items mi
      join public.stores s on s.id = mi.store_id
     where mi.image_url like '/uploads/products/%'
       and ($1 = '' or lower(s.slug) = $1)
     order by s.slug, mi.name
  `, [storeSlug])).rows;

  for (const row of rows) {
    const relative = decodeURIComponent(row.image_url.replace(/^\/uploads\//, ''));
    const sourcePath = path.resolve(uploadDir, relative);
    if (!sourcePath.startsWith(`${uploadDir}${path.sep}`)) continue;
    const source = await readFile(sourcePath);
    const optimized = await sharp(source).rotate().resize({ width: 960, height: 960, fit: 'inside', withoutEnlargement: true }).webp({ quality: 80, effort: 4, smartSubsample: true }).toBuffer();
    const outputRelative = relative.replace(/\.[^.]+$/, '') + '.webp';
    const outputPath = path.resolve(uploadDir, outputRelative);
    const nextUrl = `/uploads/${outputRelative.replaceAll(path.sep, '/')}`;
    const shouldReplace = optimized.length < source.length && nextUrl !== row.image_url;
    if (apply && shouldReplace) {
      await mkdir(path.dirname(outputPath), { recursive: true });
      await writeFile(outputPath, optimized, { flag: 'wx' });
      await client.query('update public.menu_items set image_url=$1,updated_at=now() where id=$2 and image_url=$3', [nextUrl, row.id, row.image_url]);
    }
    report.push({ id: row.id, store: row.store_slug, name: row.name, before_bytes: source.length, after_bytes: optimized.length, reduction_percent: Math.round((1 - optimized.length / source.length) * 100), changed: apply && shouldReplace });
  }
  console.log(JSON.stringify({ mode: apply ? 'apply' : 'preview', upload_dir: uploadDir, images: report }, null, 2));
} finally {
  await client.end().catch(() => {});
}

function loadEnv(url) {
  const content = readFileSync(url, 'utf8');
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#') || !trimmed.includes('=')) continue;
    const [key, ...rest] = trimmed.split('=');
    process.env[key.trim()] ||= rest.join('=').trim().replace(/^["']|["']$/g, '');
  }
}
