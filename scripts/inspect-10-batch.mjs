import pg from 'pg';

async function main() {
  const client = new pg.Client({
    connectionString: 'postgresql://cardapio_user:ca3b7539eb748218ad8c652ae489f7087d42360367a9470d@localhost:5433/cardapio?schema=public'
  });
  await client.connect();

  const slugs = [
    'imperio-do-sabor',
    'marmitaria-ki-delicia',
    'marmitaria-serra-negra',
    'monteiro-restaurante-e-marmitari',
    'prato-real-restaurante-e-marmita',
    'que-seja-sabor-restaurante-e-mar',
    'restaurante-cabana-e-churrascari',
    'restaurante-e-marmitaria-divino-',
    'restaurante-vitstela-explosao-de',
    'tempero-de-familia-restaurante-e'
  ];

  console.log("=== VERIFICAÇÃO DOS 10 LEADS DO LOTE ===");
  const leads = await client.query(`
    SELECT id, business_name, city, phone, normalized_phone, stage, attempt_count, last_contact_at, metadata
    FROM sales_leads
    WHERE city = 'Botucatu' AND segment = 'marmitaria'
    ORDER BY business_name
  `);

  for (const l of leads.rows) {
    const slug = l.metadata?.menu_slug || l.metadata?.slug;
    const hasJob = await client.query("SELECT id, status, idempotency_key FROM sales_automation_jobs WHERE lead_id = $1", [l.id]);
    const hasMessages = await client.query("SELECT id, direction, body, created_at FROM sales_messages WHERE lead_id = $1", [l.id]);
    console.log(`- ${l.business_name} (${l.phone}) | Stage: ${l.stage} | Attempts: ${l.attempt_count}`);
    console.log(`  Jobs: ${hasJob.rows.map(j => `${j.status} (${j.idempotency_key})`).join(', ') || 'NENHUM'}`);
    console.log(`  Msgs: ${hasMessages.rows.length}`);
  }

  await client.end();
}

main().catch(console.error);

