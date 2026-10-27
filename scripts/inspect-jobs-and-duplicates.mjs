import pg from 'pg';

async function main() {
  const client = new pg.Client({
    connectionString: 'postgresql://cardapio_user:ca3b7539eb748218ad8c652ae489f7087d42360367a9470d@localhost:5433/cardapio?schema=public'
  });
  await client.connect();

  console.log("=== ANÁLISE DE JOBS EM SALES_AUTOMATION_JOBS ===");
  const jobs = await client.query(`
    SELECT j.id, j.lead_id, j.status, j.idempotency_key, j.run_at, j.payload, l.business_name, l.phone, l.stage, l.attempt_count, l.last_contact_at
    FROM sales_automation_jobs j
    LEFT JOIN sales_leads l ON l.id = j.lead_id
    ORDER BY j.created_at DESC
  `);
  console.log(`Total jobs cadastrados: ${jobs.rows.length}`);
  for (const j of jobs.rows) {
    console.log(`- Job ${j.id.slice(0, 8)} | Status: ${j.status} | Lead: ${j.business_name} (${j.phone}) | LeadStage: ${j.stage} | Attempts: ${j.attempt_count} | Key: ${j.idempotency_key}`);
  }

  console.log("\n=== ANÁLISE DE DUPLICADOS EM SALES_LEADS ===");
  // Duplicados por telefone normalizado ou telefone
  const dupPhones = await client.query(`
    SELECT phone, count(*) as count, array_agg(id) as ids, array_agg(business_name) as names, array_agg(stage) as stages
    FROM sales_leads
    GROUP BY phone
    HAVING count(*) > 1
  `);
  console.log(`Telefones duplicados: ${dupPhones.rows.length}`);
  for (const d of dupPhones.rows) {
    console.log(`- Tel: ${d.phone} (x${d.count}) -> IDs: ${d.ids.join(', ')} | Nomes: ${d.names.join(' / ')} | Estágios: ${d.stages.join(', ')}`);
  }

  // Duplicados por nome de estabelecimento
  const dupNames = await client.query(`
    SELECT business_name, count(*) as count, array_agg(id) as ids, array_agg(phone) as phones, array_agg(stage) as stages
    FROM sales_leads
    GROUP BY business_name
    HAVING count(*) > 1
  `);
  console.log(`\nNomes duplicados: ${dupNames.rows.length}`);
  for (const d of dupNames.rows) {
    console.log(`- Nome: "${d.business_name}" (x${d.count}) -> IDs: ${d.ids.join(', ')} | Telefones: ${d.phones.join(', ')} | Estágios: ${d.stages.join(', ')}`);
  }

  // Leads que já receberam mensagem outbound hoje ou no histórico
  console.log("\n=== LEADS QUE JÁ RECEBERAM MENSAGEM NO HISTÓRICO ===");
  const messagedLeads = await client.query(`
    SELECT DISTINCT sl.id, sl.business_name, sl.phone, sl.stage, count(sm.id) as msg_count
    FROM sales_leads sl
    JOIN sales_messages sm ON sm.lead_id = sl.id
    WHERE sm.direction = 'outbound'
    GROUP BY sl.id, sl.business_name, sl.phone, sl.stage
  `);
  console.log(`Total de leads com mensagens outbound enviadas: ${messagedLeads.rows.length}`);
  for (const l of messagedLeads.rows) {
    console.log(`- ${l.business_name} (${l.phone}) [${l.stage}]: ${l.msg_count} mensagens enviadas`);
  }

  await client.end();
}

main().catch(console.error);

