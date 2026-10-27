import pg from 'pg';

async function main() {
  const client = new pg.Client({
    connectionString: 'postgresql://cardapio_user:ca3b7539eb748218ad8c652ae489f7087d42360367a9470d@localhost:5433/cardapio?schema=public'
  });
  await client.connect();

  const messagesToday = await client.query(`
    SELECT sm.id, sm.lead_id, sl.business_name, sl.phone, sm.direction, sm.status, sm.created_at, sm.body
    FROM sales_messages sm
    LEFT JOIN sales_leads sl ON sl.id = sm.lead_id
    WHERE sm.created_at >= '2026-10-27 00:00:00'
    ORDER BY sm.created_at DESC
  `);

  console.log(`Mensagens enviadas/recebidas hoje (2026-10-27): ${messagesToday.rows.length}`);
  for (const m of messagesToday.rows) {
    console.log(`- [${m.direction}] [${m.status}] ${m.business_name} (${m.phone}): ${m.body?.slice(0, 60)}... em ${m.created_at}`);
  }

  const jobsRes = await client.query(`
    SELECT * FROM sales_automation_jobs
    WHERE created_at >= '2026-10-27 00:00:00' OR status IN ('pending', 'processing')
  `);
  console.log(`Jobs hoje ou pendentes: ${jobsRes.rows.length}`);

  const recentContacted = await client.query(`
    SELECT id, business_name, phone, stage, last_contact_at
    FROM sales_leads
    WHERE last_contact_at >= '2026-10-27 00:00:00'
  `);
  console.log(`Leads com last_contact_at hoje: ${recentContacted.rows.length}`);
  for (const l of recentContacted.rows) {
    console.log(`- ${l.business_name} (${l.phone}) - stage: ${l.stage} - at: ${l.last_contact_at}`);
  }

  await client.end();
}

main().catch(console.error);

