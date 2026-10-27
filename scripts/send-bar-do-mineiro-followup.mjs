import pg from 'pg';
import {
  evolutionV2SalesConfig,
  sendEvolutionV2SalesText
} from '../src/lib/evolution-v2-sales.js';

try { process.loadEnvFile?.('.env'); } catch {}

const pool = new pg.Pool({
  connectionString: 'postgresql://cardapio_user:ca3b7539eb748218ad8c652ae489f7087d42360367a9470d@localhost:5433/cardapio?schema=public'
});

async function main() {
  const phone = '5514981921392';
  const leadRes = await pool.query(`SELECT id, business_name FROM sales_leads WHERE phone LIKE $1`, [`%${phone}%`]);
  if (!leadRes.rows.length) {
    throw new Error('Lead não encontrado no banco.');
  }
  const lead = leadRes.rows[0];
  console.log(`Lead localizado: ${lead.business_name} (${lead.id})`);

  // Harvey Copy: Saturday night hook, anti-AI (< 40 words, no em dash, conversational)
  const messageText = `Opa, boa noite! Passando rapidinho antes do movimento de sábado: conseguiram dar uma olhada no cardápio de vocês? Se quiser, deixo liberado hoje pro pessoal pedir direto pelo WhatsApp sem taxa nenhuma.`;

  console.log('Mensagem a enviar:\n', messageText);

  // Send via Evolution API
  const config = evolutionV2SalesConfig();
  console.log(`Enviando via Evolution (${config.instance})...`);
  const evoResult = await sendEvolutionV2SalesText({ phone, text: messageText }, config);
  console.log('Sucesso! Provider Message ID:', evoResult.id);

  // Record in sales_conversations & sales_messages
  const convRes = await pool.query(`
    INSERT INTO sales_conversations (lead_id, status, created_at, updated_at)
    VALUES ($1, 'active', now(), now())
    ON CONFLICT (lead_id) WHERE status = 'active'
    DO UPDATE SET updated_at = now()
    RETURNING id
  `, [lead.id]);
  const convId = convRes.rows[0]?.id;

  await pool.query(`
    INSERT INTO sales_messages (
      lead_id, conversation_id, provider_message_id, direction,
      body, status, requires_approval, approved_at, sent_at, metadata, created_at
    ) VALUES (
      $1, $2, $3, 'outbound',
      $4, 'sent', false, now(), now(), jsonb_build_object('kind', 'followup_revival_pricing'), now()
    ) ON CONFLICT (provider_message_id) DO NOTHING
  `, [lead.id, convId, evoResult.id, messageText]);

  // Update lead stage to engaged / followup
  await pool.query(`
    UPDATE sales_leads 
    SET followup_count = COALESCE(followup_count, 0) + 1,
        last_contact_at = now(),
        updated_at = now()
    WHERE id = $1
  `, [lead.id]);

  console.log('Mensagem registrada no banco de dados com sucesso!');
  await pool.end();
}

main().catch(console.error);

