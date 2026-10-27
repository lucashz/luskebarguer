import pg from 'pg';
import {
  evolutionV2SalesConfig,
  getEvolutionV2ConnectionState,
  sendEvolutionV2SalesText,
  sendEvolutionV2SalesMedia
} from './src/lib/evolution-v2-sales.js';

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
  console.log('Iniciando contato com Panificadora Frank...');

  const config = {
    ...evolutionV2SalesConfig(),
    timeoutMs: 60000
  };

  const conn = await getEvolutionV2ConnectionState(config);
  if (!conn.connected) {
    throw new Error(`Evolution API desconectada (estado: ${conn.state})`);
  }

  let lead = (await pool.query(`
    SELECT * FROM sales_leads
    WHERE normalized_phone = '5555996872259' OR phone = '5555996872259'
    LIMIT 1
  `)).rows[0];

  if (!lead) {
    throw new Error('Lead Panificadora Frank não encontrado no banco.');
  }

  const demoUrl = 'https://taprontomenu.com.br/frank';
  const desktopUrl = 'https://taprontomenu.com.br/uploads/previews/frank-preview-desktop.png';
  const mobileUrl = 'https://taprontomenu.com.br/uploads/previews/frank-preview-mobile.png';

  const conversation = await ensureConversation(lead.id);

  const message = [
    `Olá, pessoal da Panificadora Frank! Aqui é o Lucas, da TáPronto.`,
    `Vi a tradição e os produtos de vocês aqui em Horizontina e montei uma demonstração de cardápio digital interativo com pães artesanais, cucas coloniais, tortas e lanches de forno da casa para vocês verem como funciona vender direto pelo WhatsApp e pela internet.`,
    `Vocês podem abrir e testar o cardápio no ar agora mesmo clicando aqui: ${demoUrl}`,
    `Se fizer sentido para o dia a dia de vocês, deixamos tudo configurado com os produtos e valores exatos e vocês podem utilizar gratuitamente para testar!`
  ].join('\n\n');

  // 1. Mensagem de texto
  console.log('1/3 Enviando mensagem de texto...');
  const textResult = await sendEvolutionV2SalesText(
    { phone: lead.normalized_phone || lead.phone, text: message },
    config
  );
  console.log(` Texto enviado! ID: ${textResult.id}`);
  await saveOutbound(lead.id, conversation.id, message, textResult.id, 'outreach_text');

  await new Promise(r => setTimeout(r, 2000));

  // 2. Preview Desktop
  console.log('2/3 Enviando prévia para computador via HTTPS mediaUrl...');
  const desktopCaption = `Assim ficaria o cardápio da Panificadora Frank no computador. Para ver e navegar no cardápio completo: ${demoUrl}`;
  const desktopResult = await sendEvolutionV2SalesMedia(
    {
      phone: lead.normalized_phone || lead.phone,
      mediaUrl: desktopUrl,
      mimeType: 'image/png',
      caption: desktopCaption
    },
    config
  );
  console.log(` Prévia desktop enviada! ID: ${desktopResult.id}`);
  await saveOutbound(lead.id, conversation.id, desktopCaption, desktopResult.id, 'outreach_desktop');

  await new Promise(r => setTimeout(r, 2000));

  // 3. Preview Mobile
  console.log('3/3 Enviando prévia para celular via HTTPS mediaUrl...');
  const mobileCaption = `E esta é a visualização rápida no celular, direto para o cliente fazer pedidos pelo WhatsApp. Cardápio completo: ${demoUrl}`;
  const mobileResult = await sendEvolutionV2SalesMedia(
    {
      phone: lead.normalized_phone || lead.phone,
      mediaUrl: mobileUrl,
      mimeType: 'image/png',
      caption: mobileCaption
    },
    config
  );
  console.log(` Prévia celular enviada! ID: ${mobileResult.id}`);
  await saveOutbound(lead.id, conversation.id, mobileCaption, mobileResult.id, 'outreach_mobile');

  // 4. Atualizar Lead no banco
  await pool.query(`
    UPDATE sales_leads SET
      stage = 'awaiting_reply',
      attempt_count = COALESCE(attempt_count, 0) + 1,
      last_contact_at = now(),
      preview_desktop_path = $2,
      preview_mobile_path = $3,
      discard_code = null,
      discard_details = '{}'::jsonb,
      metadata = metadata || jsonb_build_object('menu_url', $4::text),
      updated_at = now()
    WHERE id = $1
  `, [lead.id, '/app/artifacts/outreach/automated/frank-preview/menu-preview.png', '/app/artifacts/outreach/automated/frank-preview/menu-preview-mobile.png', demoUrl]);

  console.log(` Sucesso total! Panificadora Frank com sequência completa entregue.`);
  console.log(JSON.stringify({
    ok: true,
    leadId: lead.id,
    businessName: lead.business_name,
    phone: lead.phone,
    menuUrl: demoUrl,
    textId: textResult.id,
    desktopId: desktopResult.id,
    mobileId: mobileResult.id
  }, null, 2));

  await pool.end();
}

main().catch(err => {
  console.error('ERRO:', err);
  process.exit(1);
});

