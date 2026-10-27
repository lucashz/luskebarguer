import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { getLocalPool } from '../src/lib/local-postgrest-adapter.js';
import {
  evolutionV2SalesConfig,
  getEvolutionV2ConnectionState,
  sendEvolutionV2SalesText,
  sendEvolutionV2SalesMedia
} from '../src/lib/evolution-v2-sales.js';

try { process.loadEnvFile?.('.env'); } catch {}

const pool = getLocalPool();

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
  console.log('=== DISPARO REAL VIP REFÚGIO GOURMET PARA WHATSAPP ===\n');

  const leadId = '0c9823dc-84cd-4271-9459-1c213b199eaf';
  const targetPhone = '5555984252923'; // Claudia Mara Bonazza - Refúgio Gourmet

  const config = {
    ...evolutionV2SalesConfig(),
    timeoutMs: 60000
  };

  console.log(`Verificando conexão Evolution API (${config.baseUrl}, instância: ${config.instance})...`);
  const conn = await getEvolutionV2ConnectionState(config);
  console.log('Status da conexão:', conn);
  if (!conn.connected) {
    throw new Error(`Evolution API desconectada (estado: ${conn.state})`);
  }

  const conversation = await ensureConversation(leadId);
  console.log(`Conversa ativa: ${conversation.id}`);

  // 1. Mensagem de introdução personalizada
  const introText = [
    'Olá, falo com a Claudia do Refúgio Gourmet? Tudo bem?',
    'Aqui é o Lucas, da TáPronto. Estive acompanhando o trabalho de vocês — tanto o buffet no almoço e as pizzas artesanais, quanto o espaço do Refúgio do Café.',
    'Fizemos essa demonstração com muito carinho para mostrar como ficaria a experiência dos clientes pedindo direto pelo cardápio online:'
  ].join('\n\n');

  console.log(`\n1/4 Enviando mensagem introdutória para ${targetPhone}...`);
  const introResult = await sendEvolutionV2SalesText({ phone: targetPhone, text: introText }, config);
  console.log(`✅ Mensagem introdutória enviada! ID: ${introResult.id}`);
  await saveOutbound(leadId, conversation.id, introText, introResult.id, 'outreach_intro');

  console.log('Aguardando 2.5 segundos...');
  await new Promise(r => setTimeout(r, 2500));

  // 2. Imagem Desktop
  const desktopPath = resolve('artifacts/outreach/vip/refugio-gourmet/menu-preview.png');
  console.log(`\n2/4 Enviando prévia desktop (${desktopPath})...`);
  const desktopBuffer = await readFile(desktopPath);
  const desktopCaption = 'Visualização do cardápio digital no computador.';
  const desktopResult = await sendEvolutionV2SalesMedia({
    phone: targetPhone,
    mediaBase64: desktopBuffer.toString('base64'),
    mimeType: 'image/png',
    caption: desktopCaption
  }, config);
  console.log(`✅ Prévia desktop enviada! ID: ${desktopResult.id}`);
  await saveOutbound(leadId, conversation.id, desktopCaption, desktopResult.id, 'outreach_preview_desktop');

  console.log('Aguardando 2.5 segundos...');
  await new Promise(r => setTimeout(r, 2500));

  // 3. Imagem Mobile
  const mobilePath = resolve('artifacts/outreach/vip/refugio-gourmet/menu-preview-mobile.png');
  console.log(`\n3/4 Enviando prévia mobile saudável (${mobilePath})...`);
  const mobileBuffer = await readFile(mobilePath);
  const mobileCaption = 'Visualização rápida no celular para pedidos online.';
  const mobileResult = await sendEvolutionV2SalesMedia({
    phone: targetPhone,
    mediaBase64: mobileBuffer.toString('base64'),
    mimeType: 'image/png',
    caption: mobileCaption
  }, config);
  console.log(`✅ Prévia mobile enviada! ID: ${mobileResult.id}`);
  await saveOutbound(leadId, conversation.id, mobileCaption, mobileResult.id, 'outreach_preview_mobile');

  console.log('Aguardando 2.5 segundos...');
  await new Promise(r => setTimeout(r, 2500));

  // 4. Mensagem com o link do cardápio digital
  const linkText = [
    'Você pode verificar você mesma como ficaria a experiência do seu cardápio digital:',
    '👉 https://taprontomenu.com.br/refugio-gourmet',
    'Se você gostar, nossa equipe pode cadastrar o cardápio oficial completo de vocês sem custo nenhum para fazerem um teste com os clientes.',
    'Fico à disposição por aqui se quiser dar uma olhada!'
  ].join('\n\n');

  console.log(`\n4/4 Enviando mensagem com link para ${targetPhone}...`);
  const linkResult = await sendEvolutionV2SalesText({ phone: targetPhone, text: linkText }, config);
  console.log(`✅ Mensagem com link enviada! ID: ${linkResult.id}`);
  await saveOutbound(leadId, conversation.id, linkText, linkResult.id, 'outreach_link');

  // Atualizar status do lead
  await pool.query(`
    UPDATE sales_leads SET
      stage = 'awaiting_reply',
      last_contact_at = now(),
      attempt_count = attempt_count + 1,
      updated_at = now()
    WHERE id = $1
  `, [leadId]);

  console.log('\n========================================');
  console.log('🎉 DISPARO VIP REFÚGIO GOURMET CONCLUÍDO COM SUCESSO!');
  console.log(`Destinatário: Claudia Mara Bonazza (${targetPhone})`);
  console.log(`IDs das mensagens:`);
  console.log(`- Intro:   ${introResult.id}`);
  console.log(`- Desktop: ${desktopResult.id}`);
  console.log(`- Mobile:  ${mobileResult.id}`);
  console.log(`- Link:    ${linkResult.id}`);
  console.log('========================================\n');

  await pool.end();
}

main().catch(err => {
  console.error('\n❌ ERRO NO DISPARO REAL:', err);
  process.exit(1);
});
