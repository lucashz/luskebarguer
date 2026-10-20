import { createHash } from 'node:crypto';

async function resolvePool(pool) {
  if (pool) return pool;
  try {
    const mod = await import('./local-postgrest-adapter.js');
    return mod.getLocalPool();
  } catch {
    const mod = await import('/app/src/lib/local-postgrest-adapter.js');
    return mod.getLocalPool();
  }
}

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

export async function deleteOutreachMenuForLead({ leadId, pool = null, reason = 'expired_15_hours_no_continuity' }) {
  const client = await resolvePool(pool);
  const leadRes = await client.query('SELECT * FROM sales_leads WHERE id = $1 LIMIT 1', [leadId]);
  const lead = leadRes.rows[0];
  if (!lead) throw new Error(`Lead ${leadId} não encontrado.`);

  const metadata = lead.metadata || {};
  if (metadata.menu_status === 'deleted') {
    const regId = metadata.registration_id;
    if (regId) {
      await client.query("DELETE FROM assisted_registrations WHERE id = $1 AND status NOT IN ('published', 'active', 'activated')", [regId]).catch(() => {});
    }
    await client.query("DELETE FROM assisted_registrations WHERE attribution->>'lead_id' = $1 AND status NOT IN ('published', 'active', 'activated')", [lead.id]).catch(() => {});
    return { ok: true, lead, alreadyDeleted: true };
  }

  if (metadata.is_showcase || metadata.continuity_confirmed || metadata.do_not_delete || ['engaged', 'showcase', 'won'].includes(lead.stage)) {
    return { ok: true, lead, protected: true, skipped: true, reason: 'protected_showcase_menu' };
  }

  let storeId = metadata.store_id || null;
  const menuUrl = metadata.menu_url || '';
  let storeSlug = metadata.menu_slug || '';
  if (!storeSlug && menuUrl) {
    try {
      const parsed = new URL(menuUrl);
      storeSlug = parsed.pathname.replace(/^\/+|\/+$/g, '');
    } catch {}
  }

  let store = null;
  if (storeId) {
    const storeRes = await client.query('SELECT * FROM stores WHERE id = $1 LIMIT 1', [storeId]);
    store = storeRes.rows[0];
  }
  if (!store && storeSlug) {
    const storeRes = await client.query('SELECT * FROM stores WHERE slug = $1 LIMIT 1', [storeSlug]);
    store = storeRes.rows[0];
    if (store) storeId = store.id;
  }

  if (store) {
    // Safety check 1: never delete store with real orders
    const orderCheck = await client.query('SELECT COUNT(*)::int AS count FROM orders WHERE store_id = $1', [store.id]);
    if (Number(orderCheck.rows[0]?.count || 0) > 0) {
      throw new Error(`Segurança: A loja ${store.slug} possui pedidos registrados e não pode ser excluída automaticamente.`);
    }

    // Safety check 2: never delete store if company has active paid subscription
    const subCheck = await client.query(
      "SELECT COUNT(*)::int AS count FROM company_subscriptions WHERE company_id = $1 AND status IN ('active', 'past_due')",
      [store.company_id]
    );
    if (Number(subCheck.rows[0]?.count || 0) > 0) {
      throw new Error(`Segurança: A loja ${store.slug} pertence a uma empresa com assinatura ativa.`);
    }

    const companyId = store.company_id;

    // Delete store (cascades to menu_categories, menu_items, store_settings, etc.)
    await client.query('DELETE FROM stores WHERE id = $1', [store.id]);

    // If company was created solely for this demo/preview store, clean it up too
    if (companyId) {
      const remainingStores = await client.query('SELECT COUNT(*)::int AS count FROM stores WHERE company_id = $1', [companyId]);
      const usersCount = await client.query('SELECT COUNT(*)::int AS count FROM admin_users WHERE company_id = $1', [companyId]);
      if (Number(remainingStores.rows[0]?.count || 0) === 0 && Number(usersCount.rows[0]?.count || 0) === 0) {
        await client.query('DELETE FROM companies WHERE id = $1', [companyId]).catch(() => {});
      }
    }
  }

  // Delete assisted registration associated with this lead/demo menu (if not already published/activated)
  let assistedRegistrationDeleted = false;
  const regId = metadata.registration_id;
  if (regId) {
    const delRes = await client.query(
      "DELETE FROM assisted_registrations WHERE id = $1 AND status NOT IN ('published', 'active', 'activated')",
      [regId]
    ).catch(() => ({ rowCount: 0 }));
    if (delRes?.rowCount > 0) assistedRegistrationDeleted = true;
  }

  const delLeadRes = await client.query(
    "DELETE FROM assisted_registrations WHERE attribution->>'lead_id' = $1 AND status NOT IN ('published', 'active', 'activated')",
    [lead.id]
  ).catch(() => ({ rowCount: 0 }));
  if (delLeadRes?.rowCount > 0) assistedRegistrationDeleted = true;

  if (storeId) {
    const delStoreRes = await client.query(
      "DELETE FROM assisted_registrations WHERE store_id = $1 AND status NOT IN ('published', 'active', 'activated')",
      [storeId]
    ).catch(() => ({ rowCount: 0 }));
    if (delStoreRes?.rowCount > 0) assistedRegistrationDeleted = true;
  }

  const updatedMetadata = {
    ...metadata,
    registration_id: null,
    menu_status: 'deleted',
    menu_deleted_at: new Date().toISOString(),
    menu_deletion_reason: reason
  };

  const nextStage = ['photos_ready', 'preview_ready', 'scheduled', 'awaiting_reply', 'basic_validated', 'activity_validated', 'menu_checked'].includes(lead.stage)
    ? 'lost'
    : lead.stage;

  const updateRes = await client.query(
    `UPDATE sales_leads
     SET metadata = $2::jsonb,
         stage = $3,
         stop_reason = CASE WHEN $3 = 'lost' THEN 'Cardápio temporário excluído após 15 horas sem continuidade.' ELSE stop_reason END,
         updated_at = NOW()
     WHERE id = $1
     RETURNING *`,
    [lead.id, JSON.stringify(updatedMetadata), nextStage]
  );

  await client.query(
    `INSERT INTO sales_automation_events (lead_id, event_type, stage, result, details, created_at)
     VALUES ($1, 'menu_auto_deleted', $2, 'success', $3::jsonb, NOW())`,
    [
      lead.id,
      nextStage,
      JSON.stringify({
        store_id: storeId,
        menu_slug: storeSlug,
        menu_url: menuUrl,
        registration_id: regId || null,
        assisted_registration_deleted: assistedRegistrationDeleted,
        reason,
        deleted_at: new Date().toISOString()
      })
    ]
  ).catch(() => {});

  return { ok: true, lead: updateRes.rows[0], storeDeleted: Boolean(store), assistedRegistrationDeleted };
}

export async function syncLeadToAssistedRegistration({ leadId, lead = null, pool = null, actor = 'outreach_sync' }) {
  const client = await resolvePool(pool);
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

  let store = null;
  if (metadata.store_id) {
    const storeRes = await client.query('SELECT * FROM stores WHERE id = $1 LIMIT 1', [metadata.store_id]);
    store = storeRes.rows[0];
  }
  if (!store && metadata.menu_slug) {
    const storeRes = await client.query('SELECT * FROM stores WHERE slug = $1 LIMIT 1', [metadata.menu_slug]);
    store = storeRes.rows[0];
  }
  const storeId = store ? store.id : null;
  const companyId = store ? (store.company_id || null) : null;

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

export async function confirmLeadContinuity({ leadId, pool = null, actor = 'admin' }) {
  const client = await resolvePool(pool);
  const leadRes = await client.query('SELECT * FROM sales_leads WHERE id = $1 LIMIT 1', [leadId]);
  const lead = leadRes.rows[0];
  if (!lead) throw new Error(`Lead ${leadId} não encontrado.`);

  const metadata = lead.metadata || {};
  const updatedMetadata = {
    ...metadata,
    continuity_confirmed: true,
    continuity_confirmed_at: new Date().toISOString(),
    continuity_confirmed_by: actor,
    menu_status: 'kept'
  };

  const nextStage = ['discovered', 'photos_ready', 'preview_ready', 'scheduled', 'awaiting_reply', 'basic_validated', 'activity_validated', 'menu_checked'].includes(lead.stage)
    ? 'engaged'
    : lead.stage;

  const updateRes = await client.query(
    `UPDATE sales_leads
     SET metadata = $2::jsonb,
         stage = $3,
         updated_at = NOW()
     WHERE id = $1
     RETURNING *`,
    [lead.id, JSON.stringify(updatedMetadata), nextStage]
  );

  const syncResult = await syncLeadToAssistedRegistration({
    leadId: lead.id,
    lead: updateRes.rows[0],
    pool: client,
    actor
  });

  await client.query(
    `INSERT INTO sales_automation_events (lead_id, event_type, stage, result, details, created_at)
     VALUES ($1, 'outreach_continuity_confirmed', $2, 'success', $3::jsonb, NOW())`,
    [
      lead.id,
      nextStage,
      JSON.stringify({
        actor,
        confirmed_at: new Date().toISOString(),
        store_id: metadata.store_id || null,
        menu_url: metadata.menu_url || null,
        registration_id: syncResult.registrationId
      })
    ]
  ).catch(() => {});

  return { ok: true, lead: syncResult.lead, registrationId: syncResult.registrationId };
}

export async function cleanupExpiredOutreachMenus({ pool = null, dryRun = false, hours = 15, days = null }) {
  const client = await resolvePool(pool);
  const cutoffHours = (days !== null && days !== undefined) ? Math.max(1, Number(days) * 24) : Math.max(1, Number(hours) || 15);

  const query = `
    SELECT id, business_name, phone, stage, last_contact_at, metadata
    FROM sales_leads
    WHERE last_contact_at IS NOT NULL
      AND last_contact_at <= NOW() - ($1 || ' hours')::interval
      AND COALESCE((metadata->>'continuity_confirmed')::boolean, false) = false
      AND COALESCE((metadata->>'is_showcase')::boolean, false) = false
      AND COALESCE((metadata->>'do_not_delete')::boolean, false) = false
      AND COALESCE(metadata->>'menu_status', '') <> 'deleted'
      AND (metadata->>'store_id' IS NOT NULL OR metadata->>'menu_url' IS NOT NULL OR metadata->>'registration_id' IS NOT NULL)
      AND stage NOT IN ('qualified', 'engaged', 'demo_requested', 'won', 'showcase')
    ORDER BY last_contact_at ASC
  `;

  const candidatesRes = await client.query(query, [cutoffHours]);
  const candidates = candidatesRes.rows;

  if (dryRun) {
    return {
      ok: true,
      dryRun: true,
      cutoffHours,
      scanned: candidates.length,
      candidates: candidates.map((row) => ({
        id: row.id,
        business_name: row.business_name,
        last_contact_at: row.last_contact_at,
        menu_url: row.metadata?.menu_url,
        store_id: row.metadata?.store_id,
        registration_id: row.metadata?.registration_id
      }))
    };
  }

  const results = [];
  for (const candidate of candidates) {
    try {
      const result = await deleteOutreachMenuForLead({
        leadId: candidate.id,
        pool: client,
        reason: `expired_${cutoffHours}_hours_no_continuity`
      });
      results.push({
        id: candidate.id,
        business_name: candidate.business_name,
        success: true,
        storeDeleted: result.storeDeleted,
        assistedRegistrationDeleted: result.assistedRegistrationDeleted
      });
    } catch (err) {
      results.push({ id: candidate.id, business_name: candidate.business_name, success: false, error: err.message });
    }
  }

  return {
    ok: true,
    scanned: candidates.length,
    processed: results.length,
    results
  };
}

