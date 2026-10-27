import { readFile } from 'node:fs/promises';
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
  console.log('=== DISPARO VIP MANUAL: REFÚGIO GOURMET ===');

  const config = {
    ...evolutionV2SalesConfig(),
    timeoutMs: 60000
  };

  const conn = await getEvolutionV2ConnectionState(config);
  if (!conn.connected) {
    throw new Error(`Evolution API desconectada (estado: ${conn.state})`);
  }

  const phone = '5555984252923';
  let lead = (await pool.query(`
    SELECT * FROM sales_leads
    WHERE normalized_phone = $1 OR phone = $1
    LIMIT 1
  `, [phone])).rows[0];

  if (!lead) {
    throw new Error('Lead Refúgio Gourmet não encontrado no banco.');
  }

  const conversation = await ensureConversation(lead.id);

  // 1. Mensagem de introdução
  const introText = [
    'Olá, falo com a Claudia do Refúgio Gourmet? Tudo bem?',
    'Aqui é o Lucas, da TáPronto. Estive acompanhando o trabalho de vocês — tanto o buffet no almoço e as pizzas artesanais, quanto o espaço do Refúgio do Café.',
    'Fizemos essa demonstração com muito carinho para mostrar como ficaria a experiência dos clientes pedindo direto pelo cardápio online:'
  ].join('\n\n');

  console.log(`1/4 Enviando mensagem introdutória para ${phone}...`);
  const introResult = await sendEvolutionV2SalesText({ phone, text: introText }, config);
  console.log(` Mensagem enviada! ID: ${introResult.id}`);
  await saveOutbound(lead.id, conversation.id, introText, introResult.id, 'outreach_text');

  await new Promise(r => setTimeout(r, 2000));

  // 2. Imagem Desktop
  const desktopPath = lead.preview_desktop_path || 'artifacts/outreach/vip/refugio-gourmet/menu-preview.png';
  console.log(`2/4 Enviando prévia desktop (${desktopPath})...`);
  const desktopBuffer = await readFile(desktopPath);
  const desktopCaption = 'Visualização do cardápio digital no computador.';
  const desktopResult = await sendEvolutionV2SalesMedia({
    phone,
    mediaBase64: desktopBuffer.toString('base64'),
    mimeType: 'image/png',
    caption: desktopCaption
  }, config);
  console.log(` Prévia desktop enviada! ID: ${desktopResult.id}`);
  await saveOutbound(lead.id, conversation.id, desktopCaption, desktopResult.id, 'outreach_desktop');

  await new Promise(r => setTimeout(r, 2000));

  // 3. Imagem Mobile
  const mobilePath = lead.preview_mobile_path || 'artifacts/outreach/vip/refugio-gourmet/menu-preview-mobile.png';
  console.log(`3/4 Enviando prévia mobile mockup (${mobilePath})...`);
  const mobileBuffer = await readFile(mobilePath);
  const mobileCaption = 'Visualização rápida no celular para pedidos online.';
  const mobileResult = await sendEvolutionV2SalesMedia({
    phone,
    mediaBase64: mobileBuffer.toString('base64'),
    mimeType: 'image/png',
    caption: mobileCaption
  }, config);
  console.log(` Prévia mobile enviada! ID: ${mobileResult.id}`);
  await saveOutbound(lead.id, conversation.id, mobileCaption, mobileResult.id, 'outreach_mobile');

  await new Promise(r => setTimeout(r, 2000));

  // 4. Mensagem com o link do cardápio digital e chamada
  const linkText = [
    'Você pode verificar você mesma como ficaria a experiência do seu cardápio digital:',
    '👉 https://taprontomenu.com.br/refugio-gourmet',
    'Se você gostar, nossa equipe pode cadastrar o cardápio oficial completo de vocês sem custo nenhum para fazerem um teste com os clientes.',
    'Fico à disposição por aqui se quiser dar uma olhada!'
  ].join('\n\n');

  console.log(`4/4 Enviando mensagem com o link para ${phone}...`);
  const linkResult = await sendEvolutionV2SalesText({ phone, text: linkText }, config);
  console.log(` Mensagem com link enviada! ID: ${linkResult.id}`);
  await saveOutbound(lead.id, conversation.id, linkText, linkResult.id, 'outreach_link');

  // Atualizar Lead
  await pool.query(`
    UPDATE sales_leads SET
      stage = 'awaiting_reply',
      attempt_count = COALESCE(attempt_count, 0) + 1,
      last_contact_at = now(),
      updated_at = now()
    WHERE id = $1
  `, [lead.id]);

  console.log('\n========================================');
  console.log('✅ DISPARO VIP REFÚGIO GOURMET CONCLUÍDO COM SUCESSO!');
  console.log(`Lead ID: ${lead.id}`);
  console.log(`Telefone: ${phone}`);
  console.log('========================================\n');

  await pool.end();
}

main().catch(err => {
  console.error('ERRO NO DISPARO VIP:', err);
  process.exit(1);
});

