import path from 'node:path';
import { readFile } from 'node:fs/promises';
import pg from 'pg';
import {
  evolutionV2SalesConfig,
  getEvolutionV2ConnectionState,
  sendEvolutionV2SalesText,
  sendEvolutionV2SalesMedia
} from '../src/lib/evolution-v2-sales.js';

try { process.loadEnvFile?.('.env'); } catch {}

const pool = new pg.Pool({
  connectionString: 'postgresql://cardapio_user:ca3b7539eb748218ad8c652ae489f7087d42360367a9470d@localhost:5433/cardapio?schema=public'
});

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

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

const targetLeadIds = [
  '4f54fa98-ab89-4c43-818b-cef4fdc814a3', // Cervejaria Enigma/Enigma British PUB
  'a3897392-9e43-4bd0-9440-1fdeae55c881', // Via Daros Padaria e Confeitaria
  'e8b421c2-f61b-4903-b889-562171643a12', // Cantina Roman
  'edb7c40b-e6d3-4a97-b73c-a953e41a1db7', // Open House Beer
  'ee482c4f-4e26-489f-82a6-4930221649a8'  // Bar Route 66
];

const runId = 'c12390a3-73df-4c0c-971a-738547ecda14';

async function main() {
  console.log('================================================================');
  console.log('  REENVIO DAS PRÉVIAS VISUAIS ATUALIZADAS (FOTOS 100% ILUSTRADAS) ');
  console.log('================================================================\n');

  const config = {
    ...evolutionV2SalesConfig(),
    timeoutMs: 60000
  };

  const conn = await getEvolutionV2ConnectionState(config);
  if (!conn.connected) {
    throw new Error(`Evolution API não está conectada. Estado: ${conn.state}`);
  }
  console.log(`✓ Instância Evolution "${config.instance}" conectada com sucesso.\n`);

  for (let i = 0; i < targetLeadIds.length; i++) {
    const leadId = targetLeadIds[i];
    const leadRes = await pool.query('SELECT * FROM sales_leads WHERE id = $1', [leadId]);
    const lead = leadRes.rows[0];
    if (!lead) {
      console.warn(`Lead ${leadId} não encontrado no banco.`);
      continue;
    }

    const phone = lead.normalized_phone || lead.phone;
    const slug = lead.metadata?.menu_slug;
    const businessName = lead.business_name;
    const localDir = path.resolve(`artifacts/outreach/automated/${runId}/${slug}-${lead.id.slice(0, 8)}`);
    const desktopPath = path.join(localDir, 'menu-preview.png');
    const mobilePath = path.join(localDir, 'menu-preview-mobile.png');

    console.log(`[${i + 1}/5] Enviando para: ${businessName} (${phone}) - slug: ${slug}...`);

    const conv = await ensureConversation(lead.id);

    // 1. Mensagem de texto explicativa
    const textBody = [
      `Olá, pessoal da ${businessName}! Aqui é o Lucas da TáPronto.`,
      `Atualizamos a prévia do cardápio demonstrativo de vocês com todas as fotos dos pratos e bebidas em alta resolução:`,
      `👉 https://taprontomenu.com.br/${slug}?ref=wa&lid=${lead.id}`,
      `Vejam a seguir como fica muito mais atraente e valorizado para os clientes fazerem pedidos pelo WhatsApp:`
    ].join('\n\n');

    console.log('  -> Enviando mensagem de texto...');
    const textRes = await sendEvolutionV2SalesText({ phone, text: textBody }, config);
    console.log(`  ✓ Texto enviado! Provider ID: ${textRes.id}`);
    await saveOutbound(lead.id, conv.id, textBody, textRes.id, 'outreach_text_updated_photos');

    await sleep(3000);

    // 2. Prévia Desktop
    console.log('  -> Enviando print desktop com fotos...');
    const desktopBytes = await readFile(desktopPath);
    const desktopCaption = `Assim fica o cardápio de vocês no computador, com todas as opções e fotos em destaque.`;
    const desktopRes = await sendEvolutionV2SalesMedia({
      phone,
      mediaBase64: Buffer.from(desktopBytes).toString('base64'),
      mimeType: 'image/png',
      caption: desktopCaption
    }, config);
    console.log(`  ✓ Print Desktop enviado! Provider ID: ${desktopRes.id}`);
    await saveOutbound(lead.id, conv.id, desktopCaption, desktopRes.id, 'outreach_desktop_updated_photos');

    await sleep(3000);

    // 3. Prévia Mobile Mockup
    console.log('  -> Enviando print mobile no celular com fotos...');
    const mobileBytes = await readFile(mobilePath);
    const mobileCaption = `E esta é a visualização rápida no celular, direto para o cliente fazer pedidos pelo WhatsApp.`;
    const mobileRes = await sendEvolutionV2SalesMedia({
      phone,
      mediaBase64: Buffer.from(mobileBytes).toString('base64'),
      mimeType: 'image/png',
      caption: mobileCaption
    }, config);
    console.log(`  ✓ Print Mobile enviado! Provider ID: ${mobileRes.id}`);
    await saveOutbound(lead.id, conv.id, mobileCaption, mobileRes.id, 'outreach_mobile_updated_photos');

    // Atualizar last_contact_at e metadata
    await pool.query(`
      UPDATE sales_leads
      SET last_contact_at = now(),
          metadata = metadata || jsonb_build_object('photos_updated_and_resent_at', now()::text),
          updated_at = now()
      WHERE id = $1
    `, [lead.id]);

    console.log(`✓ Lead [${i + 1}/5] concluído com sucesso.\n`);

    if (i < targetLeadIds.length - 1) {
      console.log('Aguardando 5 segundos antes do próximo lead...');
      await sleep(5000);
    }
  }

  await pool.end();
  console.log('Todos os 5 leads receberam as novas prévias com sucesso!');
}

main().catch((err) => {
  console.error('ERRO FATAL:', err);
  process.exit(1);
});

