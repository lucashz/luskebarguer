import pg from 'pg';

async function main() {
  const client = new pg.Client({
    connectionString: 'postgresql://cardapio_user:ca3b7539eb748218ad8c652ae489f7087d42360367a9470d@localhost:5433/cardapio?schema=public'
  });
  await client.connect();

  console.log("=== ANÁLISE DE LEADS DISPONÍVEIS PARA AMANHÃ (SEGUNDA-FEIRA) ===");

  // 1. Total de leads no banco
  const total = await client.query("SELECT COUNT(*) FROM sales_leads");
  console.log("Total geral de leads no DB:", total.rows[0].count);

  // 2. Leads por estágio
  const stages = await client.query("SELECT stage, count(*) FROM sales_leads GROUP BY stage ORDER BY count DESC");
  console.log("Leads por estágio:", stages.rows);

  // 3. Leads 100% novos e não contatados
  const uncontacted = await client.query(`
    SELECT id, business_name, phone, city, state, segment, stage, source, created_at, metadata
    FROM sales_leads
    WHERE attempt_count = 0 
      AND last_contact_at IS NULL
      AND stage NOT IN ('discarded', 'lost', 'won', 'opt_out')
      AND NOT EXISTS (
        SELECT 1 FROM sales_messages WHERE sales_messages.lead_id = sales_leads.id
      )
    ORDER BY created_at DESC
  `);
  console.log(`\nLeads 100% INTACTOS e não contatados: ${uncontacted.rows.length}`);

  // Classificar por segmento e cidade
  const bySegment = {};
  const byCity = {};
  for (const lead of uncontacted.rows) {
    bySegment[lead.segment || 'outro'] = (bySegment[lead.segment || 'outro'] || 0) + 1;
    byCity[lead.city || 'outra'] = (byCity[lead.city || 'outra'] || 0) + 1;
  }
  console.log("Por segmento:", bySegment);
  console.log("Por cidade:", byCity);

  // 4. Jobs agendados na fila
  const jobCols = await client.query("SELECT * FROM sales_automation_jobs LIMIT 1");
  console.log("Job columns:", Object.keys(jobCols.rows[0] || {}));

  const pendingJobs = await client.query("SELECT * FROM sales_automation_jobs WHERE status IN ('pending', 'processing')");
  console.log("Pending jobs count:", pendingJobs.rows.length);

  // 5. Amostra detalhada dos leads intactos prontos para amanhã
  console.log("\nAmostra dos 20 melhores leads intactos prontos para prospecção amanhã:");
  for (const l of uncontacted.rows.slice(0, 20)) {
    console.log(`- [${l.segment?.padEnd(12)}] ${l.business_name.padEnd(40)} | ${l.city} - ${l.state} | Tel: ${l.phone}`);
  }

  await client.end();
}

main().catch(console.error);

