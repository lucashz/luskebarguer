import path from 'node:path';
import { readFile } from 'node:fs/promises';
import pg from 'pg';
import {
  evolutionV2SalesConfig,
  getEvolutionV2ConnectionState,
  sendEvolutionV2SalesText,
  sendEvolutionV2SalesMedia,
  sendEvolutionV2Presence
} from '../src/lib/evolution-v2-sales.js';

try { process.loadEnvFile?.('.env'); } catch {}

const dbUrl = process.env.DATABASE_URL || 'postgresql://cardapio_user:ca3b7539eb748218ad8c652ae489f7087d42360367a9470d@localhost:5433/cardapio?schema=public';
const pool = new pg.Pool({ connectionString: dbUrl });

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function buildPersonalizedMessage(lead, menuUrl) {
  const name = lead.business_name
    .replace(/\s*-\s*Marmitaria.*/i, '')
    .replace(/\s*\|\s*Restaurante.*/i, '')
    .replace(/\s*-\s*Explosão de Sabores/i, '')
    .replace(/\(.*\)/, '')
    .trim();
  const city = lead.city || 'Botucatu';
  const trackedUrl = `${menuUrl}?ref=wa&lid=${lead.id}`;

  return `Oi pessoal da ${name}! Vi o trabalho de vocês aí em ${city} e sei bem a correria que é atender clientes no almoço mandando foto de cardápio e calculando entrega na mão.\n\nMontei uma demonstração prática de como os clientes escolhem a marmita do dia pelo cardápio online e o pedido chega prontinho no painel de vocês, com som de alerta e impressão automática, sem comissões sobre as vendas:\n\n👉 ${trackedUrl}\n\nSe quiserem, deixo o cardápio liberado pra vocês fazerem um teste sem custo nenhum, só pra ver a praticidade nos pedidos. O que acham?`;
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
  console.log('   DISPARADOR AUDITADO: LOTE DE 10 MARMITARIAS (SEM DUPLICADOS) ');
  console.log('================================================================\n');

  // 1. Checar conexão com Evolution API
  const evoConfig = evolutionV2SalesConfig();
  const conn = await getEvolutionV2ConnectionState(evoConfig);
  if (!conn.connected) {
    throw new Error(`Evolution API não conectada. Estado: ${conn.state}`);
  }
  console.log(`✅ WhatsApp conectado na instância "${evoConfig.instance}".\n`);

  // 2. Os 10 leads auditados de Botucatu
  const leadsToDispatch = [
    { id: '2e253f4a-0bff-4fba-8cdb-a5b1bc66d8a7', name: 'Império Do Sabor', phone: '5514997418696', slug: 'imperio-do-sabor', dir: 'imperio-do-sabor-7de45f17' },
    { id: '87932274-9871-405c-a83a-0f5882406f86', name: 'Marmitaria Ki Delicia', phone: '5514991888696', slug: 'marmitaria-ki-delicia', dir: 'marmitaria-ki-delicia-019a2cd9' },
    { id: '4807dbd2-7681-4a6e-88b7-081e005683e9', name: 'Marmitaria Serra Negra', phone: '5514998235011', slug: 'marmitaria-serra-negra', dir: 'marmitaria-serra-negra-676b3182' },
    { id: '1a52b3bc-74af-4be5-9845-5a862dcd8457', name: 'Monteiro Restaurante e Marmitaria', phone: '5514997975903', slug: 'monteiro-restaurante-e-marmitari', dir: 'monteiro-restaurante-e-marmitari-2d5050bd' },
    { id: 'd26240b4-3c62-4462-8de6-f689340b2b68', name: 'Prato Real Restaurante e Marmitaria', phone: '5514997093836', slug: 'prato-real-restaurante-e-marmita', dir: 'prato-real-restaurante-e-marmita-5a4393b9' },
    { id: 'c3f220b9-ed8c-44e6-8abd-40a204506d7f', name: 'Que seja sabor Restaurante e Marmitaria', phone: '5514997387268', slug: 'que-seja-sabor-restaurante-e-mar', dir: 'que-seja-sabor-restaurante-e-mar-6eae0903' },
    { id: 'f890e4be-bf26-487f-b7a0-5f41b16058a5', name: 'Restaurante Cabana e Churrascaria Botucatu Loja 1', phone: '5514999031870', slug: 'restaurante-cabana-e-churrascari', dir: 'restaurante-cabana-e-churrascari-b1f918f5' },
    { id: '1850968a-257d-4e93-aa28-809acccc871d', name: 'Restaurante e Marmitaria Divino Sabor', phone: '5514996809785', slug: 'restaurante-e-marmitaria-divino-', dir: 'restaurante-e-marmitaria-divino--ccd09ccb' },
    { id: '0252a101-0d12-44a2-a4f7-1d42d32cb15c', name: 'Restaurante VitStela - Explosão de Sabores', phone: '5514998549413', slug: 'restaurante-vitstela-explosao-de', dir: 'restaurante-vitstela-explosao-de-50de4679' },
    { id: 'f92032ce-7053-46ce-9e6c-cc33aab913a6', name: 'Tempero de Família | Restaurante e Marmitaria em Botucatu', phone: '5514996359820', slug: 'tempero-de-familia-restaurante-e', dir: 'tempero-de-familia-restaurante-e-2e7ed7a7' }
  ];

  const artifactsBase = path.resolve(import.meta.dirname, '../artifacts/outreach/automated/batch-monday-2026-10-26');
  let successCount = 0;

  for (let i = 0; i < leadsToDispatch.length; i++) {
    const item = leadsToDispatch[i];
    const phone = item.phone;
    const menuUrl = `https://taprontomenu.com.br/${item.slug}`;
    const leadDir = path.join(artifactsBase, item.dir);
    const desktopFile = path.join(leadDir, 'menu-preview.png');
    const mobileFile = path.join(leadDir, 'menu-preview-mobile.png');

    console.log(`----------------------------------------------------------------`);
    console.log(`[${i + 1}/${leadsToDispatch.length}] Disparando: ${item.name} (${phone})`);
    console.log(`  -> Cardápio: ${menuUrl}`);

    // Verificação de segurança no banco antes de disparar (idempotência estrita)
    const priorCheck = await pool.query(`
      SELECT id, metadata->>'kind' as kind FROM sales_messages 
      WHERE lead_id = $1 AND direction = 'outbound'
    `, [item.id]);

    const sentKinds = new Set(priorCheck.rows.map(r => r.kind));

    if (sentKinds.has('outreach_text') && sentKinds.has('outreach_desktop') && sentKinds.has('outreach_mobile')) {
      console.log(`  ⚠️ Lead ${item.name} já possui a sequência completa enviada. Pulando para evitar duplicidade!`);
      continue;
    }

    // 1. Obter / Criar conversa no CRM
    const convRes = await pool.query(`
      INSERT INTO sales_conversations (lead_id, status, created_at, updated_at)
      VALUES ($1, 'active', now(), now())
      ON CONFLICT (lead_id) WHERE status = 'active'
      DO UPDATE SET updated_at = now()
      RETURNING id
    `, [item.id]);
    const convId = convRes.rows[0]?.id;

    // 2. Enviar mensagem persuasiva com link rastreado (se ainda não enviada)
    if (!sentKinds.has('outreach_text')) {
      console.log('  ⏳ Enviando presença "Digitando..."...');
      await sendEvolutionV2Presence({ phone, presence: 'composing', delayMs: 4000 }, evoConfig);

      const messageText = buildPersonalizedMessage({ id: item.id, business_name: item.name, city: 'Botucatu' }, menuUrl);
      console.log('  -> [1/3] Enviando mensagem persuasiva...');
      try {
        const textRes = await sendEvolutionV2SalesText({ phone, text: messageText }, evoConfig);
        console.log(`  ✓ Texto enviado com sucesso! ID: ${textRes.id}`);
        await saveOutboundMessage(item.id, convId, messageText, textRes.id, 'outreach_text');
      } catch (err) {
        console.error(`  ❌ Erro ao enviar texto para ${item.name}:`, err.message);
        continue;
      }
      await sleep(3500);
    } else {
      console.log('  ✓ Texto já havia sido enviado anteriormente.');
    }

    // 3. Enviar Print Desktop (se ainda não enviado)
    if (!sentKinds.has('outreach_desktop')) {
      try {
        console.log('  -> [2/3] Enviando print de computador...');
        const deskBytes = await readFile(desktopFile);
        const deskCaption = 'Assim fica o cardápio de vocês no computador, com as marmitas e opções organizadas.';
        const deskRes = await sendEvolutionV2SalesMedia({
          phone,
          mediaBase64: Buffer.from(deskBytes).toString('base64'),
          mimeType: 'image/png',
          caption: deskCaption
        }, evoConfig);
        console.log(`  ✓ Print Desktop enviado! ID: ${deskRes.id}`);
        await saveOutboundMessage(item.id, convId, deskCaption, deskRes.id, 'outreach_desktop');
      } catch (err) {
        console.warn(`  ⚠️ Aviso no print desktop:`, err.message);
      }
      await sleep(3500);
    } else {
      console.log('  ✓ Print Desktop já enviado.');
    }

    // 4. Enviar Print Mobile (se ainda não enviado)
    if (!sentKinds.has('outreach_mobile')) {
      try {
        console.log('  -> [3/3] Enviando print de celular...');
        const mobBytes = await readFile(mobileFile);
        const mobCaption = 'E esta é a experiência rápida no celular, direto para o cliente fazer o pedido pelo cardápio online.';
        const mobRes = await sendEvolutionV2SalesMedia({
          phone,
          mediaBase64: Buffer.from(mobBytes).toString('base64'),
          mimeType: 'image/png',
          caption: mobCaption
        }, evoConfig);
        console.log(`  ✓ Print Mobile enviado! ID: ${mobRes.id}`);
        await saveOutboundMessage(item.id, convId, mobCaption, mobRes.id, 'outreach_mobile');
      } catch (err) {
        console.warn(`  ⚠️ Aviso no print mobile:`, err.message);
      }
    } else {
      console.log('  ✓ Print Mobile já enviado.');
    }

    // 6. Atualizar status do lead no banco com estágio válido ('awaiting_reply')
    await pool.query(`
      UPDATE sales_leads
      SET stage = 'awaiting_reply',
          attempt_count = 1,
          last_contact_at = now(),
          metadata = jsonb_set(
            jsonb_set(COALESCE(metadata, '{}'::jsonb), '{outreach_strategy}', '"demo_marmitarias_batch"'::jsonb),
            '{menu_url}', to_jsonb($2::text)
          ),
          updated_at = now()
      WHERE id = $1
    `, [item.id, menuUrl]);

    successCount++;
    console.log(`  🎉 ${item.name} disparado com sucesso!`);

    // Intervalo de segurança anti-ban entre leads (45 a 65 segundos)
    if (i < leadsToDispatch.length - 1) {
      const waitSec = 45 + Math.floor(Math.random() * 20);
      console.log(`\n  ⏳ Aguardando pausa de segurança anti-ban de ${waitSec} segundos antes do próximo lead...\n`);
      await sleep(waitSec * 1000);
    }
  }

  console.log('\n================================================================');
  console.log(`🏁 LOTE CONCLUÍDO: ${successCount} DE ${leadsToDispatch.length} DISPARADOS COM SUCESSO!`);
  console.log('================================================================\n');

  await pool.end();
}

main().catch(console.error);
