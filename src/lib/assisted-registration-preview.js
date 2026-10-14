import { createHash, randomBytes } from 'node:crypto';
import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { assertMenuDraftPublishable } from './assisted-menu-review.js';
import { assertAssistedIdentityComplete, publicAssistedRegistration } from './assisted-registration.js';

export async function createAssistedPreview(pool, id, actor = {}, options = {}) {
  const client = await pool.connect();
  const createdMedia = [];
  try {
    await client.query('begin');
    const registration = (await client.query('select * from assisted_registrations where id=$1 for update', [id])).rows[0];
    if (!registration) throw statusError(404, 'Cadastro assistido não encontrado.');
    if (registration.company_id && ['preview_created','preview_reviewed','published','activated'].includes(registration.status)) {
      const result = await linkedResult(client, registration); await client.query('commit'); return result;
    }
    if (registration.status !== 'ready_for_preview') throw statusError(422, 'Revise o cardápio antes de criar a prévia.');
    assertAssistedIdentityComplete(registration);
    const menu = (await client.query('select * from assisted_menu_drafts where registration_id=$1 for update', [id])).rows[0];
    if (!menu?.reviewed_at || !menu.reviewed_hash) throw statusError(422, 'A revisão obrigatória do cardápio está pendente.');
    const content = { ...menu.content, version: menu.version };
    assertMenuDraftPublishable(content);
    const expectedHash = createHash('sha256').update(JSON.stringify({ schema_version: content.schema_version || 1, categories: content.categories, version: content.version || 1 })).digest('hex');
    if (expectedHash !== menu.reviewed_hash) throw statusError(409, 'O cardápio mudou depois da revisão. Revise novamente.');
    const duplicate = await client.query(`select c.id from companies c left join admin_users au on au.company_id=c.id where regexp_replace(coalesce(c.document,''), '\\D', '', 'g')=$1 or regexp_replace(coalesce(c.phone,''), '\\D', '', 'g')=$2 or lower(coalesce(c.billing_email,''))=$3 or lower(coalesce(au.email,''))=$3 limit 1`, [registration.document_normalized, registration.phone, registration.email]);
    if (duplicate.rows[0]) throw statusError(409, 'Já existe uma empresa com este CPF ou CNPJ.');

    const company = (await client.query(`insert into companies (name,document,billing_email,phone,status,marketing_attribution) values ($1,$2,$3,$4,'onboarding',$5::jsonb) returning *`, [registration.establishment_name, registration.document_normalized, registration.email || null, registration.phone || null, JSON.stringify(registration.attribution || {})])).rows[0];
    const slug = `${slugify(registration.establishment_name)}-${id.slice(0, 6)}`;
    const store = (await client.query(`insert into stores (company_id,name,slug,description,public_url,is_active) values ($1,$2,$3,$4,$5,false) returning *`, [company.id, registration.establishment_name, slug, 'Cardápio criado com a ajuda da equipe TáPronto.', `/${slug}`])).rows[0];
    const answers = registration.answers || {};
    await client.query(`insert into store_settings (store_id,name,slug,description,whatsapp_number,address,payment_methods,business_hours,is_open,accepts_delivery,accepts_pickup,onboarding_completed) values ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,false,$9,$10,true)`, [store.id, store.name, slug, store.description, answers.establishment?.whatsapp || registration.phone || null, answers.establishment?.address || null, answers.operation?.payment_methods || [], JSON.stringify(answers.operation?.business_hours || {}), (answers.operation?.fulfillment || []).includes('delivery'), (answers.operation?.fulfillment || []).includes('pickup')]);
    const admin = (await client.query(`insert into admin_users (company_id,name,email,password_hash,role,is_active) values ($1,$2,$3,$4,'owner',false) returning id,name,email,is_active`, [company.id, registration.responsible_name, registration.email, `pending_activation$${randomBytes(32).toString('hex')}`])).rows[0];
    await client.query(`insert into admin_user_store_access (admin_user_id,company_id,store_id,role,permissions,is_active) values ($1,$2,$3,'owner',array[]::text[],false)`, [admin.id, company.id, store.id]);
    const itemIdsByDraftId = {};
    for (const [categoryIndex, category] of content.categories.entries()) {
      const savedCategory = (await client.query(`insert into menu_categories (store_id,name,description,sort_order,is_active) values ($1,$2,$3,$4,true) returning id`, [store.id, category.name, category.description || null, categoryIndex])).rows[0];
      for (const [itemIndex, item] of category.items.entries()) {
        const savedItem = (await client.query(`insert into menu_items (store_id,category_id,name,description,price,sort_order,is_available) values ($1,$2,$3,$4,$5,$6,true) returning id`, [store.id, savedCategory.id, item.name, item.description || null, item.price_cents / 100, itemIndex])).rows[0];
        itemIdsByDraftId[item.id] = savedItem.id;
        for (const [groupIndex, group] of (item.option_groups || []).entries()) {
          const savedGroup = (await client.query(`insert into menu_modifier_groups (store_id,menu_item_id,name,min_choices,max_choices,is_required,sort_order) values ($1,$2,$3,$4,$5,$6,$7) returning id`, [store.id, savedItem.id, group.name, group.min_choices || 0, group.max_choices || 1, Boolean(group.is_required), groupIndex])).rows[0];
          for (const [optionIndex, option] of (group.options || []).entries()) await client.query(`insert into menu_modifiers (store_id,group_id,name,price_delta,is_available,sort_order) values ($1,$2,$3,$4,true,$5)`, [store.id, savedGroup.id, option.name, Number(option.price_cents || 0) / 100, optionIndex]);
        }
      }
    }
    if (options.fail_at === 'after_menu') throw new Error('injected_preview_failure');
    const promoted = await promoteConfirmedAssistedMedia({ pool: client, registrationId: id, storeId: store.id, itemIdsByDraftId, sourceDir: options.sourceDir, publicDir: options.publicDir });
    createdMedia.push(...promoted.created_paths);
    const plan = (await client.query("select id from subscription_plans where is_active=true order by sort_order asc limit 1")).rows[0];
    const subscription = (await client.query(`insert into company_subscriptions (company_id,plan_id,status,metadata) values ($1,$2,'pending_activation',$3::jsonb) returning *`, [company.id, plan?.id || null, JSON.stringify({ source: 'assisted_registration', registration_id: id })])).rows[0];
    const preview = (await client.query(`update assisted_registrations set status='preview_created',publish_key=coalesce(publish_key,$2),company_id=$3,store_id=$4,admin_id=$5,subscription_id=$6,preview_created_at=now(),preview_menu_version=$7,email_status='not_sent',updated_at=now() where id=$1 returning *`, [id, `assisted:${id}`, company.id, store.id, admin.id, subscription.id, menu.version])).rows[0];
    await client.query('commit');
    return { registration: publicAssistedRegistration(preview), company: safeCompany(company), store: safeStore(store), admin, subscription: safeSubscription(subscription), preview: { menu_version: menu.version, orders_enabled: false } };
  } catch (error) { await client.query('rollback').catch(() => {}); await Promise.all(createdMedia.map((file) => unlink(file).catch(()=>{}))); throw error; }
  finally { client.release(); }
}

export async function promoteConfirmedAssistedMedia({ pool, registrationId, storeId, itemIdsByDraftId, sourceDir, publicDir }) {
  const sourceRoot = path.resolve(sourceDir || process.env.ASSISTED_UPLOAD_DIR || path.join(process.cwd(), 'private-uploads', 'assisted'));
  const publicRoot = path.resolve(publicDir || process.env.UPLOAD_DIR || path.join(process.cwd(), 'uploads'));
  const files = (await pool.query(`select f.*,l.draft_item_id from assisted_registration_files f left join assisted_product_photo_links l on l.file_id=f.id and l.status='confirmed' where f.registration_id=$1 and (f.purpose in ('store_logo','store_cover') or l.id is not null)`, [registrationId])).rows;
  const created_paths = [];
  for (const file of files) {
    const usage = file.purpose === 'product_photo' ? 'products' : file.purpose === 'store_logo' ? 'store/logo' : 'store/cover';
    const bytes = await readFile(path.join(sourceRoot, file.storage_key));
    const output = file.purpose === 'product_photo' ? await sharp(bytes).rotate().resize({ width:960,height:960,fit:'inside',withoutEnlargement:true }).webp({quality:80}).toBuffer() : bytes;
    const extension = file.purpose === 'product_photo' ? '.webp' : path.extname(file.safe_name || file.original_name) || '.jpg';
    const relative = `${usage}/${Date.now()}-${randomBytes(6).toString('hex')}${extension}`;
    const absolute = path.join(publicRoot, relative); await mkdir(path.dirname(absolute), { recursive:true }); await writeFile(absolute, output, { flag:'wx' }); created_paths.push(absolute);
    const url = `/uploads/${relative.replaceAll(path.sep,'/')}`;
    if (file.purpose === 'store_logo') await pool.query('update store_settings set logo_url=$2 where store_id=$1', [storeId,url]);
    else if (file.purpose === 'store_cover') await pool.query('update store_settings set cover_url=$2 where store_id=$1', [storeId,url]);
    else if (itemIdsByDraftId[file.draft_item_id]) await pool.query('update menu_items set image_url=$2 where id=$1 and store_id=$3', [itemIdsByDraftId[file.draft_item_id],url,storeId]);
  }
  return { created_paths };
}

async function linkedResult(client, registration) { const [company,store,subscription,admin] = await Promise.all([client.query('select * from companies where id=$1',[registration.company_id]),client.query('select * from stores where id=$1',[registration.store_id]),client.query('select * from company_subscriptions where id=$1',[registration.subscription_id]),client.query('select id,name,email,is_active from admin_users where id=$1',[registration.admin_id])]); return { registration:publicAssistedRegistration(registration),company:safeCompany(company.rows[0]),store:safeStore(store.rows[0]),admin:admin.rows[0],subscription:safeSubscription(subscription.rows[0]),preview:{menu_version:registration.preview_menu_version,orders_enabled:false} }; }
function safeCompany(row={}){return{id:row.id,name:row.name,status:row.status};} function safeStore(row={}){return{id:row.id,name:row.name,slug:row.slug,is_active:row.is_active};} function safeSubscription(row={}){return{id:row.id,status:row.status,trial_ends_at:row.trial_ends_at,current_period_starts_at:row.current_period_starts_at};}
function slugify(value){return String(value||'loja').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,45)||'loja';}
function statusError(status,message){const error=new Error(message);error.status=status;return error;}
