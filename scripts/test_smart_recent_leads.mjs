import pg from 'pg';

try { process.loadEnvFile?.('.env'); } catch {}

const dbUrl = process.env.DATABASE_URL || 'postgresql://cardapio_user:ca3b7539eb748218ad8c652ae489f7087d42360367a9470d@localhost:5433/cardapio?schema=public';
const pool = new pg.Pool({ connectionString: dbUrl });

async function main() {
  const leadsRes = await pool.query(`
    SELECT id, business_name, phone, normalized_phone, city, state, segment, stage, discard_code, source, metadata, last_contact_at, created_at, updated_at
    FROM sales_leads
    WHERE source = 'google_outreach'
    ORDER BY updated_at DESC
    LIMIT 200
  `);

  const messagesRes = await pool.query(`
    SELECT id, lead_id, direction, intent, status, body, sent_at, received_at, created_at
    FROM sales_messages
    ORDER BY created_at ASC
  `);

  const eventsRes = await pool.query(`
    SELECT id, lead_id, event_type, stage, created_at
    FROM sales_automation_events
    ORDER BY created_at ASC
  `);

  const leads = leadsRes.rows;
  const messages = messagesRes.rows;
  const events = eventsRes.rows;

  // Build message stats by lead
  const messagesByLead = new Map();
  for (const m of messages) {
    const lid = String(m.lead_id || '');
    if (!lid) continue;
    if (!messagesByLead.has(lid)) messagesByLead.set(lid, []);
    messagesByLead.get(lid).push(m);
  }

  const processed = leads.map(lead => {
    const lid = String(lead.id);
    const leadMsgs = messagesByLead.get(lid) || [];
    const inbounds = leadMsgs.filter(m => m.direction === 'inbound');
    const outbounds = leadMsgs.filter(m => m.direction === 'outbound');
    const meta = lead.metadata || {};
    const hasContact = Boolean(lead.last_contact_at || outbounds.length > 0);
    const hasInbound = inbounds.length > 0;
    const hasClick = Boolean(meta.link_clicked || Number(meta.link_clicks || 0) > 0);
    const hasMenu = Boolean(meta.menu_url || meta.store_id);

    let priority = 4; // discovered
    let stageBadge = 'Na fila';
    let stageKey = lead.stage || 'discovered';

    if (meta.continuity_confirmed || lead.stage === 'won') {
      priority = 1;
      stageBadge = '✓ Cliente Mantido';
      stageKey = 'won';
    } else if (hasClick) {
      priority = 1;
      const clicks = Number(meta.link_clicks || 1);
      stageBadge = `👁️ Visualizou Cardápio (${clicks}x)`;
      stageKey = 'link_clicked';
    } else if (meta.outreach_strategy === 'trojan_demo_delivered') {
      priority = 1;
      stageBadge = '📱 Cardápio Entregue';
      stageKey = 'trojan_demo_delivered';
    } else if (meta.outreach_strategy === 'trojan_pivot_step2') {
      priority = 1;
      stageBadge = '🎯 Apresentando Solução';
      stageKey = 'trojan_pivot_step2';
    } else if (hasInbound && hasContact) {
      priority = 1;
      stageBadge = '💬 Respondeu no WhatsApp';
      stageKey = 'replied';
    } else if (lead.stage === 'awaiting_reply' || lead.stage === 'contacted' || outbounds.length > 0) {
      priority = 2;
      stageBadge = '⏳ Aguardando Resposta';
      stageKey = 'awaiting_reply';
    } else if (hasMenu) {
      priority = 2;
      stageBadge = '📋 Cardápio Pronto';
      stageKey = 'preview_ready';
    } else if (lead.stage === 'scheduled') {
      priority = 3;
      stageBadge = '⏰ Agendado';
      stageKey = 'scheduled';
    } else if (lead.stage === 'opted_out') {
      priority = 5;
      stageBadge = '🚫 Sem Interesse';
      stageKey = 'opted_out';
    } else if (lead.stage === 'discarded') {
      priority = 5;
      stageBadge = '✕ Descartado';
      stageKey = 'discarded';
    }

    const lastMsgDate = leadMsgs.length ? new Date(leadMsgs[leadMsgs.length - 1].created_at).getTime() : 0;
    const lastContactDate = lead.last_contact_at ? new Date(lead.last_contact_at).getTime() : 0;
    const lastActivity = Math.max(lastMsgDate, lastContactDate, new Date(lead.updated_at || lead.created_at).getTime());

    return {
      business_name: lead.business_name,
      city: lead.city,
      phone: lead.phone,
      stageBadge,
      stageKey,
      priority,
      hasMenu,
      menu_url: meta.menu_url,
      lastActivity,
      inboundCount: inbounds.length,
      outboundCount: outbounds.length
    };
  });

  // Sort by priority (1 is highest), then lastActivity desc
  processed.sort((a, b) => {
    if (a.priority !== b.priority) return a.priority - b.priority;
    return b.lastActivity - a.lastActivity;
  });

  console.log(`Top 25 Leads ordered:`);
  console.table(processed.slice(0, 25).map(p => ({
    Nome: p.business_name.slice(0, 25),
    Cidade: p.city,
    Etapa: p.stageBadge,
    Cardápio: p.hasMenu ? 'Sim' : '—',
    In: p.inboundCount,
    Out: p.outboundCount
  })));

  await pool.end();
}

main().catch(console.error);

