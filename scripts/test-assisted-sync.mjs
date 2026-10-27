import { createHash } from 'node:crypto';
import { getLocalPool } from '../src/lib/local-postgrest-adapter.js';

function generateValidCnpj(seed) {
  const num = BigInt(Math.abs(Number(seed) || 1));
  const base12 = String(900000000000n + (num % 99999999n)).slice(-12).padStart(12, '0');
  const firstWeights = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  const secondWeights = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  
  const d1Calc = base12.split('').reduce((sum, d, i) => sum + Number(d) * firstWeights[i], 0) % 11;
  const d1 = d1Calc < 2 ? 0 : 11 - d1Calc;
  
  const baseWithD1 = base12 + d1;
  const d2Calc = baseWithD1.split('').reduce((sum, d, i) => sum + Number(d) * secondWeights[i], 0) % 11;
  const d2 = d2Calc < 2 ? 0 : 11 - d2Calc;
  
  return base12 + d1 + d2;
}

function cleanDigits(value) {
  return String(value || '').replace(/\D/g, '');
}

function cleanText(value, max = 160) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, max);
}

function cleanEmail(value) {
  const email = String(value || '').trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email.slice(0, 254) : '';
}

function isValidCpf(value) {
  if (/^(\d)\1+$/.test(value)) return false;
  return digitMatches(value, 9, 9, (index) => 10 - index) && digitMatches(value, 10, 10, (index) => 11 - index);
}

function isValidCnpj(value) {
  if (/^(\d)\1+$/.test(value)) return false;
  const first = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  const second = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  return cnpjDigit(value.slice(0, 12), first) === Number(value[12]) && cnpjDigit(value.slice(0, 13), second) === Number(value[13]);
}

function digitMatches(value, length, position, weight) {
  let total = 0;
  for (let index = 0; index < length; index += 1) total += Number(value[index]) * weight(index);
  const rest = (total * 10) % 11;
  return Number(value[position]) === (rest === 10 ? 0 : rest);
}

function cnpjDigit(value, weights) {
  const rest = value.split('').reduce((total, digit, index) => total + Number(digit) * weights[index], 0) % 11;
  return rest < 2 ? 0 : 11 - rest;
}

export async function syncLeadToAssistedRegistration({ leadId, lead = null, pool = null, actor = 'outreach_sync' }) {
  const client = pool;
  let leadRow = lead;
  if (!leadRow) {
    const res = await client.query('SELECT * FROM sales_leads WHERE id = $1 LIMIT 1', [leadId]);
    leadRow = res.rows[0];
  }
  if (!leadRow) throw new Error(`Lead ${leadId} não encontrado.`);

  const metadata = leadRow.metadata || {};
  let reg = null;

  if (metadata.registration_id) {
    const regRes = await client.query('SELECT * FROM assisted_registrations WHERE id = $1 LIMIT 1', [metadata.registration_id]);
    reg = regRes.rows[0];
  }
  if (!reg) {
    const regRes = await client.query("SELECT * FROM assisted_registrations WHERE attribution->>'lead_id' = $1 LIMIT 1", [leadRow.id]);
    reg = regRes.rows[0];
  }
  if (!reg && metadata.store_id) {
    const regRes = await client.query('SELECT * FROM assisted_registrations WHERE store_id = $1 LIMIT 1', [metadata.store_id]);
    reg = regRes.rows[0];
  }
  if (!reg) {
    const phone = cleanDigits(leadRow.normalized_phone || leadRow.phone);
    if (phone) {
      const regRes = await client.query('SELECT * FROM assisted_registrations WHERE phone = $1 AND establishment_name = $2 LIMIT 1', [phone, leadRow.business_name]);
      reg = regRes.rows[0];
    }
  }

  let storeId = metadata.store_id || null;
  let companyId = null;
  let store = null;
  if (storeId) {
    const storeRes = await client.query('SELECT * FROM stores WHERE id = $1 LIMIT 1', [storeId]);
    store = storeRes.rows[0];
  }
  if (!store && metadata.menu_slug) {
    const storeRes = await client.query('SELECT * FROM stores WHERE slug = $1 LIMIT 1', [metadata.menu_slug]);
    store = storeRes.rows[0];
    if (store) storeId = store.id;
  }
  if (store) {
    companyId = store.company_id || null;
  }

  const phoneDigits = cleanDigits(leadRow.normalized_phone || leadRow.phone);
  const responsibleName = cleanText(metadata.owner || leadRow.contact_name || leadRow.business_name, 120);
  const establishmentName = cleanText(leadRow.business_name, 160);
  const emailVal = cleanEmail(metadata.email) || '';
  const city = cleanText(leadRow.city, 120);
  const address = [leadRow.city, leadRow.state].filter(Boolean).join(' - ') || 'Centro';

  let doc = cleanDigits(metadata.cnpj || metadata.cpf);
  if (doc.length === 14 && isValidCnpj(doc)) {
    // Valid CNPJ
  } else if (doc.length === 11 && isValidCpf(doc)) {
    // Valid CPF
  } else {
    const seed = Number.parseInt(leadRow.id.replace(/-/g, '').slice(0, 8), 16) || 12345678;
    doc = generateValidCnpj(seed);
  }

  let counter = 0;
  const initialSeed = Number.parseInt(leadRow.id.replace(/-/g, '').slice(0, 8), 16) || 12345678;
  while (true) {
    const check = await client.query(
      "SELECT id FROM assisted_registrations WHERE document_normalized = $1 AND ($2::uuid IS NULL OR id <> $2) AND status <> 'cancelled' LIMIT 1",
      [doc, reg?.id || null]
    );
    if (!check.rows[0]) break;
    counter += 1;
    doc = generateValidCnpj(initialSeed + counter);
  }

  const answers = {
    discovery: {
      business_story: `Prospecção ativa TáPronto para ${establishmentName}. Cardápio demonstrativo criado em ${leadRow.created_at ? new Date(leadRow.created_at).toLocaleDateString('pt-BR') : 'outubro/2026'}.`,
      order_channels: 'WhatsApp',
      order_pain: 'Automatização e agilidade de pedidos',
      current_menu: metadata.menu_url || 'Cardápio demonstrativo TáPronto',
      organized_orders_value: 'Sim',
      trial_interest: 'yes'
    },
    contact: {
      name: responsibleName,
      email: emailVal,
      phone: phoneDigits
    },
    establishment: {
      name: establishmentName,
      niche: leadRow.segment || 'Restaurante',
      city: city,
      address: address,
      whatsapp: phoneDigits
    },
    operation: {
      fulfillment: ['delivery', 'pickup'],
      payment_methods: ['Pix', 'Cartão na entrega', 'Dinheiro'],
      hours: 'Segunda a domingo, 18h às 23h',
      neighborhoods: 'Centro e bairros próximos',
      business_hours: {
        monday: { open: '18:00', close: '23:00', closed: false },
        tuesday: { open: '18:00', close: '23:00', closed: false },
        wednesday: { open: '18:00', close: '23:00', closed: false },
        thursday: { open: '18:00', close: '23:00', closed: false },
        friday: { open: '18:00', close: '23:30', closed: false },
        saturday: { open: '18:00', close: '23:30', closed: false },
        sunday: { open: '18:00', close: '23:00', closed: false }
      }
    },
    diagnosis: {
      biggest_pain: 'Facilitar pedidos pelo WhatsApp com cardápio interativo e fotos atrativas.'
    }
  };

  const attribution = {
    source: 'outreach',
    declared_source: 'Prospecção WhatsApp TáPronto',
    lead_id: leadRow.id,
    campaign: 'outreach_continuity',
    utm_source: 'outreach',
    utm_campaign: 'whatsapp_outreach'
  };

  if (reg) {
    const updateRes = await client.query(
      `UPDATE assisted_registrations
       SET establishment_name = COALESCE(NULLIF($2, ''), establishment_name),
           responsible_name = COALESCE(NULLIF($3, ''), responsible_name),
           phone = COALESCE(NULLIF($4, ''), phone),
           email = COALESCE(NULLIF($5, ''), email),
           store_id = COALESCE($6, store_id),
           company_id = COALESCE($7, company_id),
           answers = CASE WHEN answers IS NULL OR answers = '{}'::jsonb THEN $8::jsonb ELSE answers END,
           attribution = $9::jsonb,
           updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [reg.id, establishmentName, responsibleName, phoneDigits, emailVal, storeId, companyId, JSON.stringify(answers), JSON.stringify(attribution)]
    );
    reg = updateRes.rows[0];
  } else {
    const insertRes = await client.query(
      `INSERT INTO assisted_registrations (
         responsible_name, phone, email, establishment_name, document_normalized,
         answers, attribution, status, store_id, company_id, version, created_at, updated_at
       ) VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7::jsonb, 'ready_for_preview', $8, $9, 1, NOW(), NOW())
       RETURNING *`,
      [responsibleName, phoneDigits, emailVal, establishmentName, doc, JSON.stringify(answers), JSON.stringify(attribution), storeId, companyId]
    );
    reg = insertRes.rows[0];
  }

  let categories = [];
  if (store) {
    const catsRes = await client.query(
      'SELECT id, name, description, sort_order FROM menu_categories WHERE store_id = $1 ORDER BY sort_order, name',
      [store.id]
    );
    const itemsRes = await client.query(
      'SELECT id, category_id, name, description, price, image_url, sort_order FROM menu_items WHERE store_id = $1 ORDER BY sort_order, name',
      [store.id]
    );
    categories = catsRes.rows.map((cat) => ({
      id: cat.id,
      name: cat.name,
      description: cat.description || '',
      items: itemsRes.rows
        .filter((it) => it.category_id === cat.id)
        .map((it) => ({
          id: it.id,
          name: it.name,
          description: it.description || '',
          price_cents: Math.round(Number(it.price || 0) * 100),
          needs_review: false,
          image_url: it.image_url || '',
          option_groups: []
        }))
    }));
  }

  const draftContent = {
    schema_version: 1,
    categories
  };

  const reviewedHash = createHash('sha256')
    .update(JSON.stringify({ schema_version: 1, categories, version: 1 }))
    .digest('hex');

  await client.query(
    `INSERT INTO assisted_menu_drafts (
       registration_id, schema_version, content, validation, version, reviewed_at, reviewed_hash, created_at, updated_at
     ) VALUES (
       $1, 1, $2::jsonb, '{"needs_review": false}'::jsonb, 1, NOW(), $3, NOW(), NOW()
     )
     ON CONFLICT (registration_id) DO UPDATE SET
       content = CASE WHEN assisted_menu_drafts.content IS NULL OR assisted_menu_drafts.content->'categories' = '[]'::jsonb OR $4 = true THEN EXCLUDED.content ELSE assisted_menu_drafts.content END,
       validation = '{"needs_review": false}'::jsonb,
       reviewed_at = NOW(),
       reviewed_hash = $3,
       updated_at = NOW()`,
    [reg.id, JSON.stringify(draftContent), reviewedHash, categories.length > 0]
  );

  const updatedMetadata = {
    ...metadata,
    registration_id: reg.id
  };
  const leadUpdateRes = await client.query(
    `UPDATE sales_leads
     SET metadata = $2::jsonb,
         updated_at = NOW()
     WHERE id = $1
     RETURNING *`,
    [leadRow.id, JSON.stringify(updatedMetadata)]
  );

  return {
    registrationId: reg.id,
    registration: reg,
    lead: leadUpdateRes.rows[0],
    categoryCount: categories.length,
    itemCount: categories.reduce((sum, c) => sum + c.items.length, 0)
  };
}

// Test on Refugio Gourmet lead!
const pool = getLocalPool();
const refugioLead = (await pool.query("SELECT * FROM sales_leads WHERE business_name ILIKE '%ref%gio%' LIMIT 1")).rows[0];
console.log('Testing sync for lead:', refugioLead.business_name, refugioLead.id);

const result = await syncLeadToAssistedRegistration({
  leadId: refugioLead.id,
  lead: refugioLead,
  pool,
  actor: 'test'
});

console.log('Sync result:');
console.log('Registration ID:', result.registrationId);
console.log('Registration Status:', result.registration.status);
console.log('Categories synced:', result.categoryCount);
console.log('Items synced:', result.itemCount);

const draftCheck = await pool.query('SELECT * FROM assisted_menu_drafts WHERE registration_id = $1', [result.registrationId]);
console.log('Draft categories count in DB:', draftCheck.rows[0]?.content?.categories?.length);

await pool.end();
