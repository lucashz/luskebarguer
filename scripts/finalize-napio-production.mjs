import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { copyFile, mkdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import pg from 'pg';
import { NAPIO_CATALOG } from './napio-catalog.mjs';

const REGISTRATION_ID = '602d3542-d1db-4a4b-8239-6b9deea459e4';
const APP_ORIGIN = process.env.NAPIO_APP_ORIGIN || 'http://127.0.0.1:3000';
const ASSET_SOURCE = process.env.NAPIO_ASSET_SOURCE || '/tmp/napio-assets';
const ORIGINAL_SOURCE = process.env.NAPIO_ORIGINAL_SOURCE || '/tmp/napio-originals';
const UPLOAD_ROOT = path.resolve(process.env.UPLOAD_DIR || '/var/www/uploads');
const ASSISTED_UPLOAD_ROOT = path.resolve(process.env.ASSISTED_UPLOAD_DIR || '/var/www/private-uploads/assisted');
if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL ausente.');

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 2 });
let temporarySessionHash = '';

try {
  await attachOriginalSources();
  await prepareRegistration();
  const publication = await publishThroughOfficialRoute();
  await applyMedia(publication.store.id);
  const verification = await verify(publication.store.id);
  console.log(JSON.stringify({ ok: true, registration_id: REGISTRATION_ID, store: publication.store, verification }, null, 2));
} finally {
  if (temporarySessionHash) await pool.query('delete from app_sessions where token=$1', [temporarySessionHash]).catch(() => {});
  await pool.end();
}

async function attachOriginalSources() {
  await mkdir(ASSISTED_UPLOAD_ROOT, { recursive: true });
  for (const name of ['NAPIO1.png', 'NAPIO2.png', 'NAPIO3.png', 'NAPIO4.png']) {
    const source = path.join(ORIGINAL_SOURCE, name);
    const buffer = await readFile(source);
    const checksum = createHash('sha256').update(buffer).digest('hex');
    const storageKey = `napio-${REGISTRATION_ID}-${name.toLowerCase()}`;
    const target = path.join(ASSISTED_UPLOAD_ROOT, storageKey);
    await copyFile(source, target);
    const size = (await stat(target)).size;
    await pool.query(`
      insert into assisted_registration_files (registration_id,original_name,safe_name,mime_type,size_bytes,storage_key,checksum_sha256,status)
      values ($1,$2,$2,'image/png',$3,$4,$5,'uploaded')
      on conflict (storage_key) do update set size_bytes=excluded.size_bytes,checksum_sha256=excluded.checksum_sha256,updated_at=now()
    `, [REGISTRATION_ID, name, size, storageKey, checksum]);
  }
}

async function prepareRegistration() {
  const client = await pool.connect();
  try {
    await client.query('begin');
    const registration = (await client.query('select * from assisted_registrations where id=$1 for update', [REGISTRATION_ID])).rows[0];
    if (!registration) throw new Error('Pré-cadastro do Nápio não encontrado.');
    if (registration.company_id || registration.store_id) throw new Error('Pré-cadastro já publicado; execução interrompida para evitar duplicidade.');
    if (!registration.responsible_name || !registration.phone || !registration.email || ![11, 14].includes(String(registration.document_normalized).length)) {
      throw new Error('Identidade do pré-cadastro está incompleta.');
    }

    const currentDraft = (await client.query('select * from assisted_menu_drafts where registration_id=$1 for update', [REGISTRATION_ID])).rows[0];
    const version = Number(currentDraft?.version || 0) + 1;
    const categories = NAPIO_CATALOG.categories.map((category) => ({
      id: randomUUID(),
      name: category.name,
      description: '',
      items: category.items.map((item) => ({
        id: randomUUID(),
        name: item.name,
        description: item.description,
        price_cents: Math.round(item.price * 100),
        needs_review: false,
        option_groups: [],
        image_key: item.image_key
      }))
    }));
    const content = { schema_version: 1, categories };
    const reviewedHash = createHash('sha256').update(JSON.stringify({ schema_version: 1, categories, version })).digest('hex');
    const answers = registration.answers || {};
    const nextAnswers = {
      ...answers,
      establishment: {
        ...(answers.establishment || {}),
        name: NAPIO_CATALOG.store.name,
        city: 'Horizontina',
        address: NAPIO_CATALOG.store.address,
        niche: answers.establishment?.niche || 'Lanchonete'
      },
      operation: {
        ...(answers.operation || {}),
        hours: 'Quarta a sexta, 18h às 22h. Sábado, 10h às 14h e 18h às 22h. Domingo a terça, fechado.'
      },
      branding: {
        ...(answers.branding || {}),
        notes: 'Usar somente as imagens originais fornecidas: logo e cardápio do Nápio.',
        theme_color: '#a6121d'
      }
    };

    await client.query(`
      insert into assisted_menu_drafts (registration_id,content,validation,version,reviewed_at,reviewed_hash)
      values ($1,$2::jsonb,$3::jsonb,$4,now(),$5)
      on conflict (registration_id) do update set
        content=excluded.content, validation=excluded.validation, version=excluded.version,
        reviewed_at=excluded.reviewed_at, reviewed_by=null, reviewed_hash=excluded.reviewed_hash, updated_at=now()
    `, [REGISTRATION_ID, JSON.stringify(content), JSON.stringify({ needs_review: false }), version, reviewedHash]);
    await client.query(`update assisted_registrations set establishment_name=$2,answers=$3::jsonb,status='ready_to_publish',version=version+1,updated_at=now() where id=$1`, [REGISTRATION_ID, NAPIO_CATALOG.store.name, JSON.stringify(nextAnswers)]);
    await client.query('commit');
  } catch (error) {
    await client.query('rollback').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

async function publishThroughOfficialRoute() {
  const admin = (await pool.query("select id,name,email,role,company_id from admin_users where role='superadmin' and is_active=true order by created_at limit 1")).rows[0];
  if (!admin) throw new Error('Superadmin ativo não encontrado.');
  const token = randomBytes(32).toString('hex');
  temporarySessionHash = createHash('sha256').update(token).digest('hex');
  const sessionData = { session_version: 2, id: admin.id, name: admin.name, email: admin.email, role: 'superadmin', company_id: admin.company_id || null, store_id: null, active_store: null, stores: [] };
  await pool.query(`insert into app_sessions (token,type,owner_id,company_id,store_id,data,expires_at) values ($1,'admin',$2,$3,null,$4::jsonb,now()+interval '10 minutes')`, [temporarySessionHash, admin.id, admin.company_id || null, JSON.stringify(sessionData)]);
  await pool.query("update assisted_registrations set status='reviewing_menu',updated_at=now() where id=$1 and company_id is null", [REGISTRATION_ID]);
  const draftVersion = Number((await pool.query('select version from assisted_menu_drafts where registration_id=$1', [REGISTRATION_ID])).rows[0].version);
  await api('/menu-draft/review', { expected_version: draftVersion });
  const preview = await api('/preview', { confirm: true });
  await api('/preview-review', { menu_version: draftVersion });
  const completed = await api('/complete', { confirm: true });
  return { ...completed, store: preview.store, company: preview.company };

  async function api(suffix, body) {
    const response = await fetch(`${APP_ORIGIN}/api/platform/assisted-registrations/${REGISTRATION_ID}${suffix}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie: `admin_session=${token}` },
      body: JSON.stringify(body)
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(`Etapa ${suffix} recusada (${response.status}): ${payload.error || 'erro desconhecido'}`);
    return payload;
  }
}

async function applyMedia(storeId) {
  const destinations = {
    logo: 'store/logo/napio-logo.webp',
    cover: 'store/cover/napio-cover.webp',
    xis: 'products/napio-xis.webp',
    bife: 'products/napio-bife.webp',
    picadao: 'products/napio-picadao.webp',
    polenta: 'products/napio-polenta.webp',
    batata: 'products/napio-batata.webp',
    tilapia: 'products/napio-tilapia.webp',
    sanduiche: 'products/napio-sanduiche.webp'
  };
  for (const [key, relative] of Object.entries(destinations)) {
    const target = path.join(UPLOAD_ROOT, relative);
    await mkdir(path.dirname(target), { recursive: true });
    await copyFile(path.join(ASSET_SOURCE, `${key}.webp`), target);
  }
  await pool.query(`update stores set name=$2,slug=$3,public_url=$4,description=$5,updated_at=now() where id=$1`, [storeId, NAPIO_CATALOG.store.name, NAPIO_CATALOG.store.slug, `/${NAPIO_CATALOG.store.slug}`, NAPIO_CATALOG.store.description]);
  await pool.query(`update store_settings set name=$2,slug=$3,description=$4,address=$5,page_title=$6,logo_url=$7,cover_url=$8,business_hours=$9::jsonb,theme_settings=$10::jsonb,updated_at=now() where store_id=$1`, [
    storeId,
    NAPIO_CATALOG.store.name,
    NAPIO_CATALOG.store.slug,
    NAPIO_CATALOG.store.description,
    NAPIO_CATALOG.store.address,
    NAPIO_CATALOG.store.page_title,
    '/uploads/store/logo/napio-logo.webp',
    '/uploads/store/cover/napio-cover.webp',
    JSON.stringify(NAPIO_CATALOG.store.business_hours),
    JSON.stringify(NAPIO_CATALOG.store.theme_settings)
  ]);
  for (const category of NAPIO_CATALOG.categories) {
    for (const item of category.items) {
      await pool.query(`update menu_items set image_url=$3,updated_at=now() where store_id=$1 and lower(name)=lower($2)`, [storeId, item.name, `/uploads/${destinations[item.image_key]}`]);
    }
  }
}

async function verify(storeId) {
  const store = (await pool.query(`select s.slug,s.is_active,ss.address,ss.logo_url,ss.cover_url,ss.business_hours from stores s join store_settings ss on ss.store_id=s.id where s.id=$1`, [storeId])).rows[0];
  const categories = Number((await pool.query('select count(*) from menu_categories where store_id=$1 and is_active=true', [storeId])).rows[0].count);
  const items = Number((await pool.query('select count(*) from menu_items where store_id=$1 and is_available=true', [storeId])).rows[0].count);
  const images = Number((await pool.query("select count(*) from menu_items where store_id=$1 and coalesce(image_url,'')<>''", [storeId])).rows[0].count);
  const registration = (await pool.query('select status,email_status from assisted_registrations where id=$1', [REGISTRATION_ID])).rows[0];
  return { ...store, categories, items, images, registration_status: registration.status, email_status: registration.email_status };
}
