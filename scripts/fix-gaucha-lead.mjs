import pg from 'pg';

const pool = new pg.Pool({
  connectionString: 'postgresql://cardapio_user:ca3b7539eb748218ad8c652ae489f7087d42360367a9470d@localhost:5433/cardapio?schema=public'
});

// 1. Inspecionar Restaurante da Gaúcha
const res = await pool.query(`
  SELECT id, business_name, phone, stage, attempt_count, metadata->>'outreach_strategy' as strat
  FROM sales_leads
  WHERE phone LIKE '%991569890%'
`);
console.log('Restaurante da Gaúcha:');
console.table(res.rows);

// 2. Atualizar para stage = 'awaiting_reply', attempt_count = 1, e strategy = 'trojan_inquiry_step1'
await pool.query(`
  UPDATE sales_leads
  SET stage = 'awaiting_reply',
      attempt_count = 1,
      metadata = jsonb_set(COALESCE(metadata, '{}'::jsonb), '{outreach_strategy}', '"trojan_inquiry_step1"'::jsonb),
      last_contact_at = now(),
      updated_at = now()
  WHERE phone LIKE '%991569890%'
`);
console.log('Restaurante da Gaúcha atualizado para awaiting_reply.');

// 3. Verificar se há outros leads que receberam mensagens hoje mas continuam com attempt_count = 0 ou stage = 'discovered'
const syncRes = await pool.query(`
  UPDATE sales_leads l
  SET stage = 'awaiting_reply',
      attempt_count = 1,
      metadata = jsonb_set(COALESCE(metadata, '{}'::jsonb), '{outreach_strategy}', '"trojan_inquiry_step1"'::jsonb),
      last_contact_at = now(),
      updated_at = now()
  WHERE l.stage = 'discovered'
    AND EXISTS (
      SELECT 1 FROM sales_messages m
      WHERE m.lead_id = l.id
        AND m.direction = 'outbound'
        AND m.status = 'sent'
    )
`);
console.log(`Leads sincronizados com mensagens enviadas: ${syncRes.rowCount}`);

await pool.end();

