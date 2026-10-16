import pg from 'pg';
import { readFile } from 'node:fs/promises';
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

async function dispatchLead({ lead, message, previews, demoUrl }) {
  console.log(`\n========================================`);
  console.log(`Disparando para: ${lead.business_name} (${lead.phone})`);
  console.log(`========================================`);

  const config = evolutionV2SalesConfig();
  const conn = await getEvolutionV2ConnectionState(config);
  if (!conn.connected) {
    throw new Error(`Evolution API desconectada (estado: ${conn.state})`);
  }

  const conversation = await ensureConversation(lead.id);

  // 1. Enviar texto de abertura
  console.log('1/3 Enviando mensagem de texto...');
  const textResult = await sendEvolutionV2SalesText(
    { phone: lead.normalized_phone || lead.phone, text: message },
    config
  );
  console.log(` Texto enviado! ID: ${textResult.id}`);
  await saveOutbound(lead.id, conversation.id, message, textResult.id, 'outreach_text');

  // Delay de segurança entre mensagens (1.5s)
  await new Promise(r => setTimeout(r, 1500));

  // 2. Enviar preview desktop
  console.log('2/3 Enviando prévia para computador...');
  const desktopBuffer = await readFile(previews.desktopPath);
  const desktopCaption = `Assim ficaria o cardápio de vocês no computador. Para ver o cardápio completo: ${demoUrl}`;
  const desktopResult = await sendEvolutionV2SalesMedia(
    {
      phone: lead.normalized_phone || lead.phone,
      mediaBase64: desktopBuffer.toString('base64'),
      mimeType: 'image/png',
      caption: desktopCaption
    },
    config
  );
  console.log(` Prévia desktop enviada! ID: ${desktopResult.id}`);
  await saveOutbound(lead.id, conversation.id, desktopCaption, desktopResult.id, 'outreach_desktop');

  // Delay de segurança entre mensagens (1.5s)
  await new Promise(r => setTimeout(r, 1500));

  // 3. Enviar preview mobile
  console.log('3/3 Enviando prévia para celular...');
  const mobileBuffer = await readFile(previews.mobilePath);
  const mobileCaption = `E esta é a visualização no celular. Para ver o cardápio completo: ${demoUrl}`;
  const mobileResult = await sendEvolutionV2SalesMedia(
    {
      phone: lead.normalized_phone || lead.phone,
      mediaBase64: mobileBuffer.toString('base64'),
      mimeType: 'image/png',
      caption: mobileCaption
    },
    config
  );
  console.log(` Prévia celular enviada! ID: ${mobileResult.id}`);
  await saveOutbound(lead.id, conversation.id, mobileCaption, mobileResult.id, 'outreach_mobile');

  // 4. Atualizar status do lead
  await pool.query(`
    UPDATE sales_leads SET
      stage = 'awaiting_reply',
      attempt_count = COALESCE(attempt_count, 0) + 1,
      last_contact_at = now(),
      updated_at = now()
    WHERE id = $1
  `, [lead.id]);

  console.log(` Sucesso! Lead ${lead.business_name} atualizado para 'awaiting_reply' com last_contact_at registrado.`);
  return {
    leadId: lead.id,
    businessName: lead.business_name,
    phone: lead.phone,
    textId: textResult.id,
    desktopId: desktopResult.id,
    mobileId: mobileResult.id
  };
}

async function main() {
  console.log('Iniciando disparo para os leads qualificados...');

  // 1. Cadastrar ou obter Stop Beer
  let stopBeer = (await pool.query(`
    SELECT * FROM sales_leads WHERE normalized_phone = '5555996187833' OR phone = '5555996187833' LIMIT 1
  `)).rows[0];

  if (!stopBeer) {
    const insertRes = await pool.query(`
      INSERT INTO sales_leads (
        business_name,
        phone,
        normalized_phone,
        city,
        state,
        segment,
        source,
        stage,
        automation_status,
        last_validated_at,
        preview_desktop_path,
        preview_mobile_path,
        metadata,
        created_at,
        updated_at
      ) VALUES (
        'Stop Beer Delivery e Conveniência',
        '5555996187833',
        '5555996187833',
        'Horizontina',
        'RS',
        'conveniência e bebidas',
        'personalized_outreach',
        'preview_ready',
        'active',
        now(),
        '/app/artifacts/outreach/automated/stopbeer-preview/menu-preview.png',
        '/app/artifacts/outreach/automated/stopbeer-preview/menu-preview-mobile.png',
        '{"menu_url": "https://taprontomenu.com.br/stopbeer"}'::jsonb,
        now(),
        now()
      ) RETURNING *
    `);
    stopBeer = insertRes.rows[0];
  } else {
    const updateRes = await pool.query(`
      UPDATE sales_leads SET
        preview_desktop_path = '/app/artifacts/outreach/automated/stopbeer-preview/menu-preview.png',
        preview_mobile_path = '/app/artifacts/outreach/automated/stopbeer-preview/menu-preview-mobile.png',
        stage = 'preview_ready',
        automation_status = 'active',
        last_validated_at = now(),
        metadata = metadata || '{"menu_url": "https://taprontomenu.com.br/stopbeer"}'::jsonb,
        updated_at = now()
      WHERE id = $1 RETURNING *
    `, [stopBeer.id]);
    stopBeer = updateRes.rows[0];
  }

  // Obter Lancheria Rota 472
  const rota472 = (await pool.query(`
    SELECT * FROM sales_leads WHERE normalized_phone = '5555999603119' OR phone = '5555999603119' LIMIT 1
  `)).rows[0];

  const results = [];

  // Disparar Stop Beer (com link do cardápio real: https://taprontomenu.com.br/stopbeer)
  const stopBeerMessage = [
    `Olá, pessoal da Stop Beer Delivery e Conveniência! Aqui é o Lucas, da TáPronto.`,
    `Vi a conveniência e bebidas de vocês em Horizontina e montei um cardápio online demonstrativo e interativo com os produtos e bebidas de vocês para mostrar como a loja pode vender direto pelo WhatsApp e internet.`,
    `Vocês podem ver o cardápio no ar agora mesmo clicando aqui: https://taprontomenu.com.br/stopbeer`,
    `Se tiverem interesse, nossa equipe organiza o cardápio completo com todas as bebidas e porções, e vocês podem usar gratuitamente para testar.`,
    `Se tiverem alguma dúvida, estou à disposição!`
  ].join('\n\n');

  results.push(await dispatchLead({
    lead: stopBeer,
    message: stopBeerMessage,
    previews: {
      desktopPath: '/app/artifacts/outreach/automated/stopbeer-preview/menu-preview.png',
      mobilePath: '/app/artifacts/outreach/automated/stopbeer-preview/menu-preview-mobile.png'
    },
    demoUrl: 'https://taprontomenu.com.br/stopbeer'
  }));

  // Disparar Lancheria Rota 472 se ainda não foi contatada
  if (rota472 && !rota472.last_contact_at) {
    const rotaMessage = [
      `Olá, pessoal da Lancheria Rota 472! Aqui é o Lucas, da TáPronto.`,
      `Vi a lanchonete de vocês em Tenente Portela e não encontrei um cardápio online para os clientes consultarem. Por isso, preparei uma demonstração personalizada, com algumas opções compatíveis com o que vocês vendem, para mostrar como o cardápio da loja poderia ficar.`,
      `Se tiverem interesse, nossa equipe monta o cardápio completo e vocês podem fazer um teste gratuitamente.`,
      `Caso queiram verificar como funciona o cardápio na íntegra, acessem: https://taprontomenu.com.br/cardapio`,
      `Se tiverem alguma dúvida, estou à disposição.`
    ].join('\n\n');

    results.push(await dispatchLead({
      lead: rota472,
      message: rotaMessage,
      previews: {
        desktopPath: rota472.preview_desktop_path,
        mobilePath: rota472.preview_mobile_path
      },
      demoUrl: 'https://taprontomenu.com.br/cardapio'
    }));
  }

  // Resumo final de leads chamados
  const contactedLeads = (await pool.query(`
    SELECT id, business_name, phone, city, state, stage, attempt_count, last_contact_at
    FROM sales_leads
    WHERE last_contact_at IS NOT NULL
    ORDER BY last_contact_at DESC
  `)).rows;

  console.log('\n========================================');
  console.log('RELATÓRIO DE LEADS QUE FORAM CHAMADOS:');
  console.log('========================================');
  console.log(JSON.stringify(contactedLeads, null, 2));

  await pool.end();
}

main().catch(err => {
  console.error('ERRO NO DISPARO:', err);
  process.exit(1);
});
