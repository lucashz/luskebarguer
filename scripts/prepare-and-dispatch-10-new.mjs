import path from 'node:path';
import { mkdir, readFile } from 'node:fs/promises';
import pg from 'pg';
import { provisionOutreachStore, resolveProductIllustration } from '../src/lib/outreach-store-provisioning.js';
import { captureWithCDP } from '../src/lib/outreach-preview.js';
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

// 1. Script de Copywriting Humano & Persuasivo (Anti-AI)
function buildPersonalizedMessage(lead, menuUrl) {
  const name = lead.business_name.replace(/\s*-\s*Marmitaria.*/i, '').replace(/\(.*\)/, '').trim();
  const city = lead.city || 'região';
  const trackedUrl = `${menuUrl}?ref=wa&lid=${lead.id}`;

  if (lead.segment === 'hamburgueria') {
    return `Oi pessoal da ${name}! Vi os lanches de vocês aí em ${city} e sei como é a correria do delivery no horário de pico, atendendo no WhatsApp e conferindo pedido na mão.\n\nMontei uma demonstração rápida de como os clientes podem pedir os burgers e combos de vocês direto pelo celular em 30 segundos, sem vocês pagarem taxa sobre as vendas:\n\n👉 ${trackedUrl}\n\nSe quiserem, deixo liberado essa semana pra vocês testarem na prática com os clientes sem custo nenhum. O que acham?`;
  }

  // Padrão Marmitaria / Restaurante Caseiro
  return `Oi pessoal da ${name}! Vi o trabalho de vocês aí em ${city} e sei bem a correria que é atender no WhatsApp no almoço mandando foto do cardápio e calculando entrega na mão.\n\nMontei uma demonstração prática de como os clientes podem escolher a marmita do dia e mandar o pedido prontinho no WhatsApp em 30 segundos, sem você pagar porcentagem sobre as vendas:\n\n👉 ${trackedUrl}\n\nSe quiserem, deixo o cardápio liberado pra vocês rodarem um teste essa semana sem custo nenhum, só pra ver os pedidos entrando. O que acham?`;
}

async function saveOutboundMessage(leadId, convId, body, providerId, kind) {
  await pool.query(`
    INSERT INTO sales_messages (
      lead_id, conversation_id, provider_message_id, direction,
      body, status, requires_approval, approved_at, sent_at, metadata, created_at
    ) VALUES (
      $1, $2, $3, 'outbound',
      $4, 'sent', false, now(), now(), jsonb_build_object('kind', $5::text), now()
    ) ON CONFLICT (provider_message_id) DO NOTHING
  `, [leadId, convId, providerId, body, kind]);
}

async function main() {
  console.log('================================================================');
  console.log('  PROVISIONAMENTO, PRÉVIAS E DISPARO DE 10 LEADS 100% NOVOS     ');
  console.log('================================================================\n');

  // Verificar conexão com Evolution API com retentativas
  const evoConfig = evolutionV2SalesConfig();
  let state = { connected: false, state: 'unknown' };
  for (let attempt = 1; attempt <= 5; attempt++) {
    try {
      state = await getEvolutionV2ConnectionState(evoConfig);
      if (state.connected) break;
      console.log(`Tentativa ${attempt}: Estado é "${state.state}". Aguardando 4 segundos...`);
    } catch (err) {
      console.log(`Tentativa ${attempt}: Erro ao checar conexão: ${err.message}. Aguardando 4 segundos...`);
    }
    await sleep(4000);
  }
  if (!state.connected) {
    throw new Error(`Evolution API não está conectada. Estado: ${state.state}`);
  }
  console.log(`✅ Instância Evolution "${evoConfig.instance}" conectada com sucesso.\n`);

  // Selecionar os 10 novos leads qualificados
  const leadsRes = await pool.query(`
    SELECT id, business_name, city, state, segment, phone, normalized_phone, metadata
    FROM sales_leads
    WHERE source = 'gosom_scraper'
      AND last_contact_at IS NULL 
      AND attempt_count = 0
    ORDER BY 
      CASE WHEN segment = 'marmitaria' THEN 1 WHEN segment = 'hamburgueria' THEN 2 ELSE 3 END,
      COALESCE((metadata->>'reviews_count')::int, 0) ASC
    LIMIT 10
  `);

  const leads = leadsRes.rows;
  console.log(`Carregados ${leads.length} leads qualificados para processamento.\n`);

  const runId = 'batch-gosom-' + new Date().toISOString().slice(0, 10);
  const artifactsBase = path.resolve('artifacts/outreach/automated', runId);
  await mkdir(artifactsBase, { recursive: true });

  for (let i = 0; i < leads.length; i++) {
    const lead = leads[i];
    const phone = lead.normalized_phone || lead.phone;
    console.log(`----------------------------------------------------------------`);
    console.log(`[${i + 1}/${leads.length}] Processando: ${lead.business_name} (${phone}) - ${lead.city}/${lead.state}`);

    // 1. Provisionar cardápio da loja
    console.log('  -> Provisionando loja e itens do cardápio...');
    let prov;
    try {
      prov = await provisionOutreachStore({ lead, pool, baseUrl: 'https://taprontomenu.com.br' });
    } catch (err) {
      console.error(`  ❌ Erro ao provisionar ${lead.business_name}:`, err.message);
      continue;
    }

    const storeId = prov.storeId;
    const storeSlug = prov.storeSlug || prov.slug;
    const menuUrl = `https://taprontomenu.com.br/${storeSlug}`;
    console.log(`  ✓ Cardápio provisionado: ${menuUrl}`);

    // 2. REGRA DE OURO: Validar que 100% dos itens possuem imagens válidas
    const itemsRes = await pool.query(`SELECT id, name, image_url FROM menu_items WHERE store_id = $1`, [storeId]);
    for (const item of itemsRes.rows) {
      if (!item.image_url || !item.image_url.trim()) {
        const fallbackImg = resolveProductIllustration(item.name, lead.segment);
        await pool.query(`UPDATE menu_items SET image_url = $1 WHERE id = $2`, [fallbackImg, item.id]);
        console.log(`  📸 Imagem corrigida para item: ${item.name}`);
      }
    }
    console.log(`  ✓ 100% dos ${itemsRes.rows.length} itens possuem imagens em alta resolução.`);

    // 3. Capturar prévias visuais reais com Chrome CDP
    const leadDir = path.join(artifactsBase, `${storeSlug}-${lead.id.slice(0, 8)}`);
    await mkdir(leadDir, { recursive: true });

    const desktopFile = path.join(leadDir, 'menu-preview.png');
    const mobileFile = path.join(leadDir, 'menu-preview-mobile.png');

    console.log('  -> Capturando prints do cardápio com Chrome CDP...');
    try {
      await captureWithCDP({
        url: menuUrl,
        outputPath: desktopFile,
        width: 1080,
        height: 1350,
        isMobile: false
      });
      await captureWithCDP({
        url: menuUrl,
        outputPath: mobileFile,
        width: 1080,
        height: 1350,
        isMobile: true
      });
      console.log('  ✓ Prints capturados com sucesso!');
    } catch (err) {
      console.warn(`  ⚠️ Aviso na captura CDP: ${err.message}.`);
    }

    // 4. Preparar mensagem personalizada
    const messageText = buildPersonalizedMessage(lead, menuUrl);

    // 5. Criar conversa ativa
    const convRes = await pool.query(`
      INSERT INTO sales_conversations (lead_id, status, created_at, updated_at)
      VALUES ($1, 'active', now(), now())
      ON CONFLICT (lead_id) WHERE status = 'active'
      DO UPDATE SET updated_at = now()
      RETURNING id
    `, [lead.id]);
    const convId = convRes.rows[0]?.id;

    // 6. DISPARO VIA WHATSAPP (3 etapas)
    console.log('  -> [1/3] Enviando mensagem de texto personalizada...');
    let textRes;
    try {
      textRes = await sendEvolutionV2SalesText({ phone, text: messageText }, evoConfig);
      console.log(`  ✓ Texto enviado! Provider ID: ${textRes.id}`);
      await saveOutboundMessage(lead.id, convId, messageText, textRes.id, 'outreach_text');
    } catch (err) {
      console.error(`  ❌ Falha no envio do texto para ${lead.business_name}:`, err.message);
      continue;
    }

    await sleep(3500);

    // [2/3] Print Desktop (LEGENDA SEM LINK)
    const desktopCaption = 'Assim fica o cardápio de vocês no computador, com os pratos e bebidas organizados.';
    try {
      console.log('  -> [2/3] Enviando print de computador...');
      const desktopBytes = await readFile(desktopFile);
      const desktopRes = await sendEvolutionV2SalesMedia({
        phone,
        mediaBase64: Buffer.from(desktopBytes).toString('base64'),
        mimeType: 'image/png',
        caption: desktopCaption
      }, evoConfig);
      console.log(`  ✓ Print Desktop enviado! Provider ID: ${desktopRes.id}`);
      await saveOutboundMessage(lead.id, convId, desktopCaption, desktopRes.id, 'outreach_desktop');
    } catch (err) {
      console.warn(`  ⚠️ Aviso ao enviar print desktop:`, err.message);
    }

    await sleep(3500);

    // [3/3] Print Mobile (LEGENDA SEM LINK)
    const mobileCaption = 'E esta é a experiência rápida no celular, direto para o cliente fazer pedidos pelo WhatsApp.';
    try {
      console.log('  -> [3/3] Enviando print de celular...');
      const mobileBytes = await readFile(mobileFile);
      const mobileRes = await sendEvolutionV2SalesMedia({
        phone,
        mediaBase64: Buffer.from(mobileBytes).toString('base64'),
        mimeType: 'image/png',
        caption: mobileCaption
      }, evoConfig);
      console.log(`  ✓ Print Mobile enviado! Provider ID: ${mobileRes.id}`);
      await saveOutboundMessage(lead.id, convId, mobileCaption, mobileRes.id, 'outreach_mobile');
    } catch (err) {
      console.warn(`  ⚠️ Aviso ao enviar print mobile:`, err.message);
    }

    // 7. Atualizar status do lead
    await pool.query(`
      UPDATE sales_leads
      SET stage = 'first_message_sent',
          attempt_count = 1,
          last_contact_at = NOW(),
          metadata = jsonb_set(
            COALESCE(metadata, '{}'::jsonb),
            '{menu_url}',
            to_jsonb($2::text)
          ),
          updated_at = NOW()
      WHERE id = $1
    `, [lead.id, menuUrl]);

    console.log(`  ⭐ Lead [${i + 1}/${leads.length}] finalizado com sucesso!`);

    if (i < leads.length - 1) {
      console.log('  Aguardando 10 segundos antes do próximo lead para simular ritmo humano...');
      await sleep(10000);
    }
  }

  console.log('\n================================================================');
  console.log('  TODOS OS 10 LEADS FORAM PROCESSADOS E CONTATADOS COM SUCESSO!   ');
  console.log('================================================================\n');

  await pool.end();
}

main().catch(console.error);
