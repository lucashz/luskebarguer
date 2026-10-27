import pg from 'pg';
import {
  evolutionV2SalesConfig,
  getEvolutionV2ConnectionState,
  sendEvolutionV2SalesText,
  sendEvolutionV2SalesMedia
} from '/app/src/lib/evolution-v2-sales.js';

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL
});

async function ensureConversation(leadId) {
  const res = await pool.query(`
    INSERT INTO sales_conversations (lead_id, status, created_at, updated_at)
    VALUES ($1, 'active', now(), now())
    ON CONFLICT (lead_id) WHERE status = 'active'
    DO UPDATE SET updated_at = now()
    RETURNING *
  `, [leadId]);
  return res.rows[0];
}

async function saveOutbound(leadId, conversationId, body, providerId, kind) {
  await pool.query(`
    INSERT INTO sales_messages (
      lead_id, conversation_id, provider_message_id, direction,
      body, status, requires_approval, approved_at, sent_at, metadata, created_at
    ) VALUES (
      $1, $2, $3, 'outbound',
      $4, 'sent', false, now(), now(), jsonb_build_object('kind', $5::text), now()
    ) ON CONFLICT (provider_message_id) DO NOTHING
  `, [leadId, conversationId, providerId, body, kind]);
}

async function main() {
  console.log('Iniciando envio das mensagens com acentuação corrigida...');

  const config = {
    ...evolutionV2SalesConfig(),
    timeoutMs: 60000
  };

  const conn = await getEvolutionV2ConnectionState(config);
  if (!conn.connected) {
    throw new Error(`Evolution API desconectada (estado: ${conn.state})`);
  }

  // 1. Padaria Altíssimo
  console.log('\n--- Enviando correção para Padaria Altíssimo ---');
  const altissimoLead = (await pool.query("SELECT * FROM sales_leads WHERE normalized_phone = '5555991318127' LIMIT 1")).rows[0];
  if (altissimoLead) {
    const conv = await ensureConversation(altissimoLead.id);
    const altissimoText = [
      `Pessoal da Padaria Altíssimo, segue o link atualizado do cardápio demonstrativo de vocês, com todas as opções de pães coloniais, cucas alemãs tradicionais, salgados assados e confeitaria da casa com fotos:`,
      `👉 https://taprontomenu.com.br/altissimo`,
      `Ficamos à disposição caso queiram personalizar ou testar na prática!`
    ].join('\n\n');

    const textRes = await sendEvolutionV2SalesText({ phone: altissimoLead.phone, text: altissimoText }, config);
    console.log(`[Altíssimo] Texto enviado com acentos! ID: ${textRes.id}`);
    await saveOutbound(altissimoLead.id, conv.id, altissimoText, textRes.id, 'outreach_text_corrected');

    await new Promise(r => setTimeout(r, 2000));

    const altissimoCaption = `Visualização no celular para pedidos no WhatsApp.`;
    const mediaRes = await sendEvolutionV2SalesMedia({
      phone: altissimoLead.phone,
      mediaUrl: 'https://taprontomenu.com.br/uploads/previews/menu-preview-mobile.png',
      mimeType: 'image/png',
      caption: altissimoCaption
    }, config);
    console.log(`[Altíssimo] Prévia mobile enviada com acentos! ID: ${mediaRes.id}`);
    await saveOutbound(altissimoLead.id, conv.id, altissimoCaption, mediaRes.id, 'outreach_mobile_corrected');
  }

  await new Promise(r => setTimeout(r, 3000));

  // 2. Panificadora Frank
  console.log('\n--- Enviando correção para Panificadora Frank ---');
  const frankLead = (await pool.query("SELECT * FROM sales_leads WHERE normalized_phone = '5555996872259' LIMIT 1")).rows[0];
  if (frankLead) {
    const conv = await ensureConversation(frankLead.id);
    const frankText = [
      `Pessoal da Panificadora Frank, segue o link atualizado do cardápio demonstrativo de vocês, com as fotos reais e a lista de pães artesanais, cucas alemãs de ricota e frutas, tortas finas e lanches de forno da padaria:`,
      `👉 https://taprontomenu.com.br/frank`,
      `Qualquer dúvida ou ajuste que queiram fazer, estamos à disposição!`
    ].join('\n\n');

    const textRes = await sendEvolutionV2SalesText({ phone: frankLead.phone, text: frankText }, config);
    console.log(`[Frank] Texto enviado com acentos! ID: ${textRes.id}`);
    await saveOutbound(frankLead.id, conv.id, frankText, textRes.id, 'outreach_text_corrected');

    await new Promise(r => setTimeout(r, 2000));

    const frankCaption = `Visualização no celular para pedidos no WhatsApp.`;
    const mediaRes = await sendEvolutionV2SalesMedia({
      phone: frankLead.phone,
      mediaUrl: 'https://taprontomenu.com.br/uploads/previews/frank-preview-mobile.png',
      mimeType: 'image/png',
      caption: frankCaption
    }, config);
    console.log(`[Frank] Prévia mobile enviada com acentos! ID: ${mediaRes.id}`);
    await saveOutbound(frankLead.id, conv.id, frankCaption, mediaRes.id, 'outreach_mobile_corrected');
  }

  console.log('\nEnvio de mensagens corrigidas concluído com sucesso!');
  await pool.end();
}

main().catch(err => {
  console.error('ERRO:', err);
  process.exit(1);
});

