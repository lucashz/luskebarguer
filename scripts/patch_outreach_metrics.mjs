import { readFileSync, writeFileSync } from 'node:fs';

const filePath = 'D:/lsk/TáProntomenu.com.br/.worktrees/release-production-outreach-20261014/src/lib/outreach-metrics.js';
let content = readFileSync(filePath, 'utf8');

const oldFnStart = 'function recentLeads(leads, events, messages) {';
const oldFnEnd = '  }).sort((a, b) => timestamp(b.last_event_at) - timestamp(a.last_event_at)).slice(0, 30);\n}';
const oldFnEndCrlf = '  }).sort((a, b) => timestamp(b.last_event_at) - timestamp(a.last_event_at)).slice(0, 30);\r\n}';

const newFn = `function recentLeads(leads, events, messages = []) {
  const latestByLead = new Map();
  for (const event of events) updateLatest(latestByLead, event.lead_id, event.created_at);
  for (const message of messages) updateLatest(latestByLead, message.lead_id, messageDate(message));

  const messagesByLead = new Map();
  for (const msg of messages) {
    const lid = String(msg.lead_id || '');
    if (!lid) continue;
    if (!messagesByLead.has(lid)) messagesByLead.set(lid, []);
    messagesByLead.get(lid).push(msg);
  }

  return leads.map((lead) => {
    const lid = String(lead.id);
    const meta = lead.metadata || {};
    const leadMsgs = messagesByLead.get(lid) || [];
    const inbounds = leadMsgs.filter((m) => m.direction === 'inbound');
    const outbounds = leadMsgs.filter((m) => m.direction === 'outbound');
    const lastInbound = inbounds[inbounds.length - 1] || null;
    const lastOutbound = outbounds[outbounds.length - 1] || null;

    const hasContact = Boolean(lead.last_contact_at || outbounds.length > 0);
    const hasInbound = inbounds.length > 0;
    const hasClick = Boolean(meta.link_clicked || Number(meta.link_clicks || 0) > 0);
    const hasMenu = Boolean(meta.menu_url || meta.store_id);

    // Dynamic stage and priority calculation
    let priority = 4;
    let stageKey = String(lead.stage || 'discovered');
    let stageBadge = 'Na fila de prospecção';
    let stageType = 'neutral';

    if (meta.continuity_confirmed || lead.stage === 'won') {
      priority = 1;
      stageKey = 'won';
      stageBadge = '✓ Cliente Mantido';
      stageType = 'success';
    } else if (hasClick) {
      priority = 1;
      stageKey = 'link_clicked';
      const clicks = Number(meta.link_clicks || 1);
      stageBadge = \`👁️ Visualizou Cardápio (\${clicks}x)\`;
      stageType = 'success';
    } else if (meta.outreach_strategy === 'trojan_demo_delivered' || meta.demo_delivered) {
      priority = 1;
      stageKey = 'trojan_demo_delivered';
      stageBadge = '📱 Cardápio Entregue';
      stageType = 'info';
    } else if (meta.outreach_strategy === 'trojan_pivot_step2') {
      priority = 1;
      stageKey = 'trojan_pivot_step2';
      stageBadge = '🎯 Apresentando Solução';
      stageType = 'accent';
    } else if (hasInbound && hasContact) {
      priority = 1;
      stageKey = 'replied';
      stageBadge = '💬 Respondeu no WhatsApp';
      stageType = 'accent';
    } else if (lead.stage === 'awaiting_reply' || lead.stage === 'contacted' || outbounds.length > 0) {
      priority = 2;
      stageKey = 'awaiting_reply';
      stageBadge = '⏳ Aguardando Resposta';
      stageType = 'warning';
    } else if (hasMenu) {
      priority = 2;
      stageKey = 'preview_ready';
      stageBadge = '📋 Cardápio Pronto';
      stageType = 'info';
    } else if (lead.stage === 'scheduled') {
      priority = 3;
      stageKey = 'scheduled';
      stageBadge = '⏰ Agendado p/ envio';
      stageType = 'info';
    } else if (lead.stage === 'human_handoff') {
      priority = 2;
      stageKey = 'human_handoff';
      stageBadge = '👤 Atendimento Humano';
      stageType = 'warning';
    } else if (lead.stage === 'opted_out') {
      priority = 5;
      stageKey = 'opted_out';
      stageBadge = '🚫 Sem Interesse (Opt-out)';
      stageType = 'muted';
    } else if (lead.stage === 'discarded') {
      priority = 5;
      stageKey = 'discarded';
      stageBadge = '✕ Descartado';
      stageType = 'muted';
    }

    const lastContact = lead.last_contact_at ? validDate(lead.last_contact_at) : null;
    const expiresAt = lastContact ? new Date(lastContact.getTime() + 15 * 3600000).toISOString() : null;
    const hoursRemaining = lastContact ? Math.round((new Date(expiresAt).getTime() - Date.now()) / 3600000) : null;

    const lastMsgTimestamp = leadMsgs.length ? timestamp(messageDate(leadMsgs[leadMsgs.length - 1])) : 0;
    const lastContactTimestamp = lastContact ? lastContact.getTime() : 0;
    const lastEventTimestamp = timestamp(latestByLead.get(lid));
    const lastActivity = Math.max(lastMsgTimestamp, lastContactTimestamp, lastEventTimestamp, timestamp(lead.updated_at), timestamp(lead.created_at));

    return {
      id: lead.id,
      business_name: String(lead.business_name || ''),
      phone: maskPhone(lead.normalized_phone || lead.phone),
      raw_phone: lead.normalized_phone || lead.phone || '',
      city: String(lead.city || ''),
      state: String(lead.state || ''),
      segment: String(lead.segment || ''),
      stage: stageKey,
      stage_badge: stageBadge,
      stage_type: stageType,
      priority,
      menu_url: meta.menu_url || null,
      store_id: meta.store_id || null,
      continuity_confirmed: Boolean(meta.continuity_confirmed),
      continuity_confirmed_at: meta.continuity_confirmed_at || null,
      registration_id: meta.registration_id || null,
      menu_status: meta.menu_status || (meta.store_id || meta.menu_url ? 'active' : null),
      link_clicked: Boolean(meta.link_clicked),
      link_clicks: Number(meta.link_clicks || 0),
      last_link_click_at: meta.last_link_click_at || null,
      last_contact_at: lead.last_contact_at || null,
      inbound_count: inbounds.length,
      outbound_count: outbounds.length,
      last_inbound_body: lastInbound?.body ? String(lastInbound.body).slice(0, 150) : null,
      last_inbound_at: lastInbound ? messageDate(lastInbound) : null,
      expires_at: expiresAt,
      hours_remaining: hoursRemaining,
      last_activity: lastActivity,
      last_event_at: latestByLead.get(lid) || lead.updated_at || lead.created_at || null
    };
  }).sort((a, b) => {
    if (a.priority !== b.priority) return a.priority - b.priority;
    return b.last_activity - a.last_activity;
  }).slice(0, 50);
}`;

const startIndex = content.indexOf(oldFnStart);
if (startIndex === -1) {
  throw new Error('oldFnStart not found');
}
let endIndex = content.indexOf(oldFnEndCrlf, startIndex);
if (endIndex === -1) {
  endIndex = content.indexOf(oldFnEnd, startIndex);
  if (endIndex === -1) throw new Error('oldFnEnd not found');
  endIndex += oldFnEnd.length;
} else {
  endIndex += oldFnEndCrlf.length;
}

content = content.slice(0, startIndex) + newFn + content.slice(endIndex);
writeFileSync(filePath, content, 'utf8');
console.log('Successfully updated outreach-metrics.js!');

