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

export async function deleteOutreachMenuForLead({ leadId, pool = null, reason = 'expired_no_continuity' }) {
  const client = await resolvePool(pool);
  const leadRes = await client.query('SELECT * FROM sales_leads WHERE id = $1 LIMIT 1', [leadId]);
  const lead = leadRes.rows[0];
  if (!lead) throw new Error(`Lead ${leadId} não encontrado.`);

  const metadata = lead.metadata || {};
  if (metadata.menu_status === 'deleted') {
    return { ok: true, lead, alreadyDeleted: true };
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

  const updatedMetadata = {
    ...metadata,
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
         stop_reason = CASE WHEN $3 = 'lost' THEN 'Cardápio temporário excluído após 2 dias sem continuidade.' ELSE stop_reason END,
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
        reason,
        deleted_at: new Date().toISOString()
      })
    ]
  ).catch(() => {});

  return { ok: true, lead: updateRes.rows[0], storeDeleted: Boolean(store) };
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
        menu_url: metadata.menu_url || null
      })
    ]
  ).catch(() => {});

  return { ok: true, lead: updateRes.rows[0] };
}

export async function cleanupExpiredOutreachMenus({ pool = null, dryRun = false, days = 2 }) {
  const client = await resolvePool(pool);
  const cutoffDays = Math.max(1, Number(days) || 2);

  const query = `
    SELECT id, business_name, phone, stage, last_contact_at, metadata
    FROM sales_leads
    WHERE last_contact_at IS NOT NULL
      AND last_contact_at <= NOW() - ($1 || ' days')::interval
      AND COALESCE((metadata->>'continuity_confirmed')::boolean, false) = false
      AND COALESCE(metadata->>'menu_status', '') <> 'deleted'
      AND (metadata->>'store_id' IS NOT NULL OR metadata->>'menu_url' IS NOT NULL)
      AND stage NOT IN ('qualified', 'engaged', 'demo_requested', 'won')
    ORDER BY last_contact_at ASC
  `;

  const candidatesRes = await client.query(query, [cutoffDays]);
  const candidates = candidatesRes.rows;

  if (dryRun) {
    return {
      ok: true,
      dryRun: true,
      scanned: candidates.length,
      candidates: candidates.map((row) => ({
        id: row.id,
        business_name: row.business_name,
        last_contact_at: row.last_contact_at,
        menu_url: row.metadata?.menu_url,
        store_id: row.metadata?.store_id
      }))
    };
  }

  const results = [];
  for (const candidate of candidates) {
    try {
      const result = await deleteOutreachMenuForLead({
        leadId: candidate.id,
        pool: client,
        reason: 'expired_2_days_no_continuity'
      });
      results.push({ id: candidate.id, business_name: candidate.business_name, success: true, storeDeleted: result.storeDeleted });
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
