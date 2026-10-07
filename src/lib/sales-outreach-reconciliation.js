const OUTREACH_ELIGIBLE_STAGES = new Set([
  'discovered', 'qualified', 'awaiting_first_message_approval', 'first_message_sent'
]);

export async function reconcileSalesOutreach(client, manifest, { apply = false } = {}) {
  const summary = {
    apply,
    total: manifest.length,
    matched: 0,
    missing: 0,
    pending: 0,
    inserted: 0,
    updated: 0,
    unchanged: 0,
    missingLeads: []
  };

  for (const entry of manifest) {
    validateEntry(entry);
    const lead = (await client.query(
      `select id,business_name,stage,attempt_count,last_contact_at
       from sales_leads where normalized_phone=$1 limit 1`,
      [entry.normalizedPhone]
    )).rows[0];

    if (!lead) {
      summary.missing += 1;
      summary.missingLeads.push({ businessName: entry.businessName, normalizedPhone: entry.normalizedPhone });
      continue;
    }

    summary.matched += 1;
    const existing = await findEvent(client, lead.id, entry.campaignKey);
    if (existing) {
      summary.unchanged += 1;
      continue;
    }

    summary.pending += 1;
    if (!apply) continue;

    await client.query(`select pg_advisory_xact_lock(hashtext($1))`, [`sales-outreach:${lead.id}:${entry.campaignKey}`]);
    if (await findEvent(client, lead.id, entry.campaignKey)) {
      summary.unchanged += 1;
      continue;
    }

    const nextStage = OUTREACH_ELIGIBLE_STAGES.has(lead.stage) ? 'awaiting_reply' : lead.stage;
    const details = {
      campaign_key: entry.campaignKey,
      channel: 'whatsapp',
      message_version: entry.messageVersion,
      part_count: entry.partCount,
      delivery_status: entry.deliveryStatus,
      source: 'historical_reconciliation'
    };
    await client.query(
      `insert into sales_automation_events(lead_id,event_type,previous_stage,next_stage,details,created_at)
       values($1,'outreach_sent',$2,$3,$4::jsonb,$5::timestamptz)`,
      [lead.id, lead.stage, nextStage, JSON.stringify(details), entry.contactedAt]
    );
    await client.query(
      `update sales_leads
       set stage=$2,
           attempt_count=attempt_count+1,
           last_contact_at=case when last_contact_at is null or last_contact_at<$3::timestamptz then $3::timestamptz else last_contact_at end,
           updated_at=now()
       where id=$1`,
      [lead.id, nextStage, entry.contactedAt]
    );
    summary.inserted += 1;
    summary.updated += 1;
  }

  return summary;
}

async function findEvent(client, leadId, campaignKey) {
  return (await client.query(
    `select id from sales_automation_events
     where lead_id=$1 and event_type='outreach_sent' and details->>'campaign_key'=$2
     limit 1`,
    [leadId, campaignKey]
  )).rows[0] || null;
}

function validateEntry(entry) {
  if (!entry?.businessName || !/^55\d{10,11}$/.test(String(entry.normalizedPhone || ''))) {
    throw new Error('Entrada de reconciliação inválida: estabelecimento e telefone brasileiro são obrigatórios.');
  }
  if (!entry.campaignKey || !entry.messageVersion || !Number.isInteger(entry.partCount) || entry.partCount < 1) {
    throw new Error(`Entrada de reconciliação inválida para ${entry.businessName}.`);
  }
  if (!entry.contactedAt || Number.isNaN(Date.parse(entry.contactedAt))) {
    throw new Error(`Data de contato inválida para ${entry.businessName}.`);
  }
}
