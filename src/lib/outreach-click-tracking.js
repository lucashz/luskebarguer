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

export function isCrawlerUserAgent(userAgent = '') {
  const ua = String(userAgent || '').toLowerCase();
  if (!ua) return false;
  return /facebookexternalhit|whatsapp|bot|crawl|spider|slurp|facebook|meta-externalagent|googlebot|bingbot|yahoo|duckduckbot|baiduspider|yandexbot|curl|wget/i.test(ua);
}

export function buildTrackedMenuUrl({ menuUrl, leadId }) {
  const cleanUrl = String(menuUrl || '').trim();
  if (!cleanUrl) return cleanUrl;
  if (!leadId) return cleanUrl;
  const separator = cleanUrl.includes('?') ? '&' : '?';
  return `${cleanUrl}${separator}ref=wa&lid=${encodeURIComponent(leadId)}`;
}

export async function trackOutreachLinkClick({
  leadId = null,
  leadSlug = null,
  userAgent = '',
  ip = '',
  pool = null
} = {}) {
  const ua = String(userAgent || '').trim();
  const isBot = isCrawlerUserAgent(ua);

  const client = await resolvePool(pool);

  // 1. Resolve lead by ID or menu_slug
  let lead = null;
  const cleanId = String(leadId || '').trim();
  const cleanSlug = String(leadSlug || '').trim().replace(/^\/+/, '');

  if (cleanId) {
    // Check exact UUID or prefix
    const isFullUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(cleanId);
    if (isFullUuid) {
      const res = await client.query('SELECT * FROM sales_leads WHERE id = $1 LIMIT 1', [cleanId]);
      lead = res.rows[0];
    } else {
      const res = await client.query('SELECT * FROM sales_leads WHERE id::text LIKE $1 LIMIT 1', [`${cleanId}%`]);
      lead = res.rows[0];
    }
  }

  if (!lead && cleanSlug) {
    const res = await client.query("SELECT * FROM sales_leads WHERE metadata->>'menu_slug' = $1 LIMIT 1", [cleanSlug]);
    lead = res.rows[0];
  }

  if (!lead) {
    return {
      ok: false,
      error: 'lead_not_found',
      menuUrl: cleanSlug ? `https://taprontomenu.com.br/${cleanSlug}` : 'https://taprontomenu.com.br/cardapio'
    };
  }

  const metadata = lead.metadata || {};
  const destinationUrl = metadata.menu_url || (metadata.menu_slug ? `https://taprontomenu.com.br/${metadata.menu_slug}` : 'https://taprontomenu.com.br/cardapio');

  // If request came from a crawler/bot, don't register as a human click
  if (isBot) {
    return {
      ok: true,
      lead,
      isBot: true,
      menuUrl: destinationUrl
    };
  }

  // 2. Human click: update metadata and advance stage if appropriate
  const currentClicks = Number(metadata.link_clicks || 0);
  const nowIso = new Date().toISOString();

  const updatedMetadata = {
    ...metadata,
    link_clicked: true,
    link_clicks: currentClicks + 1,
    last_link_click_at: nowIso,
    first_link_click_at: metadata.first_link_click_at || nowIso
  };

  const advanceStages = ['discovered', 'photos_ready', 'preview_ready', 'scheduled', 'awaiting_reply', 'basic_validated', 'activity_validated'];
  const nextStage = advanceStages.includes(lead.stage) ? 'engaged' : lead.stage;

  await client.query(
    `UPDATE sales_leads
     SET metadata = $2::jsonb,
         stage = $3,
         updated_at = NOW()
     WHERE id = $1`,
    [lead.id, JSON.stringify(updatedMetadata), nextStage]
  );

  // 3. Record automation event
  await client.query(
    `INSERT INTO sales_automation_events (lead_id, event_type, stage, result, details, created_at)
     VALUES ($1, 'outreach_link_clicked', $2, 'success', $3::jsonb, NOW())`,
    [
      lead.id,
      nextStage,
      JSON.stringify({
        click_number: currentClicks + 1,
        user_agent: ua.slice(0, 200),
        ip: String(ip || '').slice(0, 45),
        lead_id: lead.id,
        business_name: lead.business_name,
        menu_url: destinationUrl
      })
    ]
  ).catch((err) => console.warn('[trackOutreachLinkClick event error]', err.message));

  return {
    ok: true,
    lead: {
      ...lead,
      stage: nextStage,
      metadata: updatedMetadata
    },
    isBot: false,
    clicks: currentClicks + 1,
    menuUrl: destinationUrl
  };
}
