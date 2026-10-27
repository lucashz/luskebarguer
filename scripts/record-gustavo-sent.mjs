import { getLocalPool } from '../src/lib/local-postgrest-adapter.js';

try { process.loadEnvFile?.('.env'); } catch {}

const pool = getLocalPool();

async function main() {
  const phone = '554896022350';
  const leadRes = await pool.query(`SELECT id FROM sales_leads WHERE normalized_phone = $1 LIMIT 1`, [phone]);
  const leadId = leadRes.rows[0].id;
  const messageId = '3EB0F8CC63FCA22E738D4C';
  const trackedUrl = `https://taprontomenu.com.br/villa-1052-pub-restaurantes-brac?ref=wa&lid=${leadId}`;

  const messageText = [
    'Olá, Gustavo! Tudo bem? Aqui é o Lucas, da TáPronto.',
    'Conversei agora há pouco com o antigo responsável pelo espaço do Pub aí em Braço do Norte, e ele me passou seu contato dizendo que você assumiu o local com uma nova proposta e novo conceito! 🤝',
    'Nós criamos cardápios digitais interativos para estabelecimentos locais venderem direto pelo WhatsApp — com 0% de comissão por pedido e sem o cliente precisar baixar nenhum aplicativo.',
    `Como tínhamos preparado um protótipo para o espaço, deixei aqui para você ver na prática como a tecnologia funciona:\n👉 ${trackedUrl}`,
    'Qual é o nome atual e a proposta do seu espaço hoje? Nossa equipe monta o cardápio 100% personalizado com a sua marca e seus produtos para você testar gratuitamente por 7 dias!',
    'Se tiver alguma dúvida, estou à disposição.'
  ].join('\n\n');

  await pool.query(`
    INSERT INTO sales_messages (
      lead_id, provider_message_id, direction, body, status, sent_at, metadata
    )
    VALUES ($1, $2, 'outbound', $3, 'sent', NOW(), $4::jsonb)
    ON CONFLICT (provider_message_id) DO NOTHING
  `, [
    leadId,
    messageId,
    messageText,
    JSON.stringify({ referral: 'Villa 1052 Pub' })
  ]);

  await pool.query(`
    INSERT INTO sales_automation_events (
      lead_id, stage, event_type, attempt, result, details
    )
    VALUES ($1, 'awaiting_reply', 'outreach_text_sent', 1, 'success', $2::jsonb)
  `, [
    leadId,
    JSON.stringify({ phone, provider_message_id: messageId, tracked_url: trackedUrl })
  ]);

  console.log(`✓ Gravado com sucesso para Gustavo (Lead ID: ${leadId})!`);
  await pool.end();
}

main().catch(console.error);

