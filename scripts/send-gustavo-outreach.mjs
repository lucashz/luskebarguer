import { getLocalPool } from '../src/lib/local-postgrest-adapter.js';
import { sendEvolutionV2SalesText, evolutionV2SalesConfig } from '../src/lib/evolution-v2-sales.js';

try { process.loadEnvFile?.('.env'); } catch {}

const pool = getLocalPool();

async function main() {
  console.log('================================================================');
  console.log('  ENVIANDO MENSAGEM PARA GUSTAVO BEZA (BRAÇO DO NORTE)           ');
  console.log('================================================================\n');

  const phone = '554896022350';
  const businessName = 'Gustavo Beza';
  const city = 'Braço do Norte';
  const state = 'SC';
  const baseMenuUrl = 'https://taprontomenu.com.br/villa-1052-pub-restaurantes-brac';

  // 1. Criar ou atualizar lead de Gustavo
  let leadRes = await pool.query(`SELECT * FROM sales_leads WHERE normalized_phone = $1 LIMIT 1`, [phone]);
  let lead = leadRes.rows[0];

  if (!lead) {
    const insertRes = await pool.query(`
      INSERT INTO sales_leads (
        business_name, phone, normalized_phone, city, state, segment, source, stage, metadata, last_contact_at, attempt_count, updated_at
      )
      VALUES (
        $1, $2, $2, $3, $4, 'bar', 'referral', 'awaiting_reply',
        jsonb_build_object(
          'referral_from', 'Villa 1052 Pub',
          'referral_phone', '5548996257705',
          'menu_url', $5::text,
          'menu_slug', 'villa-1052-pub-restaurantes-brac'
        ),
        NOW(), 1, NOW()
      )
      RETURNING *
    `, [businessName, phone, city, state, baseMenuUrl]);
    lead = insertRes.rows[0];
  } else {
    await pool.query(`
      UPDATE sales_leads
      SET stage = 'awaiting_reply',
          last_contact_at = NOW(),
          attempt_count = coalesce(attempt_count, 0) + 1,
          updated_at = NOW()
      WHERE id = $1
    `, [lead.id]);
  }

  const trackedUrl = `${baseMenuUrl}?ref=wa&lid=${lead.id}`;
  console.log(`✓ Lead ID: ${lead.id}`);
  console.log(`✓ Link rastreado: ${trackedUrl}\n`);

  // 2. Montar texto personalizado
  const messageText = [
    'Olá, Gustavo! Tudo bem? Aqui é o Lucas, da TáPronto.',
    'Conversei agora há pouco com o antigo responsável pelo espaço do Pub aí em Braço do Norte, e ele me passou seu contato dizendo que você assumiu o local com uma nova proposta e novo conceito! 🤝',
    'Nós criamos cardápios digitais interativos para estabelecimentos locais venderem direto pelo WhatsApp — com 0% de comissão por pedido e sem o cliente precisar baixar nenhum aplicativo.',
    `Como tínhamos preparado um protótipo para o espaço, deixei aqui para você ver na prática como a tecnologia funciona:\n👉 ${trackedUrl}`,
    'Qual é o nome atual e a proposta do seu espaço hoje? Nossa equipe monta o cardápio 100% personalizado com a sua marca e seus produtos para você testar gratuitamente por 7 dias!',
    'Se tiver alguma dúvida, estou à disposição.'
  ].join('\n\n');

  console.log('--- MENSAGEM A ENVIAR ---');
  console.log(messageText);
  console.log('-------------------------\n');

  // 3. Disparar via Evolution API
  const config = evolutionV2SalesConfig();
  console.log(`Disparando para ${phone} via instância ${config.instance}...`);
  const result = await sendEvolutionV2SalesText({ phone, text: messageText }, config);

  console.log(`✓ Mensagem enviada com sucesso! ID da mensagem: ${result.id}\n`);

  // 4. Registrar em sales_messages
  await pool.query(`
    INSERT INTO sales_messages (
      lead_id, provider_message_id, direction, body, status, sent_at, metadata
    )
    VALUES ($1, $2, 'outbound', $3, 'sent', NOW(), $4::jsonb)
    ON CONFLICT (provider_message_id) DO NOTHING
  `, [
    lead.id,
    result.id,
    messageText,
    JSON.stringify({ raw_response: result.raw, referral: 'Villa 1052 Pub' })
  ]);

  // 5. Registrar evento de contato
  await pool.query(`
    INSERT INTO sales_automation_events (
      lead_id, stage, event_type, attempt, result, details
    )
    VALUES ($1, 'awaiting_reply', 'outreach_text_sent', 1, 'success', $2::jsonb)
  `, [
    lead.id,
    JSON.stringify({ phone, provider_message_id: result.id, tracked_url: trackedUrl })
  ]);

  console.log('✓ Registros no banco de dados gravados com sucesso!');
  await pool.end();
}

main().catch(err => {
  console.error('[ERRO FATAL]', err);
  process.exit(1);
});
