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
  const phone = '555433581112';
  const leadRes = await pool.query(`SELECT id, business_name FROM sales_leads WHERE phone LIKE $1`, [`%${phone}%`]);
  if (!leadRes.rows.length) {
    throw new Error('Lead Via Daros não encontrado no banco.');
  }
  const lead = leadRes.rows[0];
  console.log(`Lead localizado: ${lead.business_name} (${lead.id})`);

  const messageText = `Boa tarde! Tudo bem por aí?

Peço mil desculpas pela mensagem anterior, foi um disparo automático que acabou entrando na frente!

Passei aqui com calma só para dar um alô: vi a padaria de vocês aí em Lagoa Vermelha e as encomendas e doces são lindos demais. Montei aquela demonstração pensando com muito carinho em valorizar as fotos de vocês pros clientes verem direto no WhatsApp, sem ter que ficar abrindo PDF pesado.

Quando der uma folga na correria do balcão, dá uma olhada com calma no link. Qualquer produto ou foto que você quiser ajustar ou testar, é só me chamar por aqui!`;

  console.log('Mensagem a enviar para Via Daros:\n', messageText);

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
      $4, 'sent', false, now(), now(), jsonb_build_object('kind', 'human_reply_boa_tarde'), now()
    ) ON CONFLICT (provider_message_id) DO NOTHING
  `, [lead.id, convId, evoResult.id, messageText]);

  await pool.query(`
    UPDATE sales_leads 
    SET followup_count = COALESCE(followup_count, 0) + 1,
        last_contact_at = now(),
        updated_at = now()
    WHERE id = $1
  `, [lead.id]);

  console.log('Mensagem salva no banco com sucesso!');
  await pool.end();
}

main().catch(console.error);

