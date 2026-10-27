import pg from 'pg';
import { provisionOutreachStore } from '../src/lib/outreach-store-provisioning.js';
import {
  evolutionV2SalesConfig,
  getEvolutionV2ConnectionState,
  sendEvolutionV2SalesText,
  sendEvolutionV2Presence
} from '../src/lib/evolution-v2-sales.js';

try { process.loadEnvFile?.('.env'); } catch {}

const dbUrl = process.env.DATABASE_URL || 'postgresql://cardapio_user:ca3b7539eb748218ad8c652ae489f7087d42360367a9470d@localhost:5433/cardapio?schema=public';
const pool = new pg.Pool({ connectionString: dbUrl });

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  console.log("================================================================");
  console.log("  ENVIANDO TESTE DA NOVA ABORDAGEM PARA O WHATSAPP DO USUÁRIO   ");
  console.log("================================================================\n");

  const targetPhone = '5555936191201';
  const evoConfig = evolutionV2SalesConfig();

  // 1. Checar conexão com Evolution API
  const conn = await getEvolutionV2ConnectionState(evoConfig);
  if (!conn.connected) {
    throw new Error(`Evolution API não conectada. Estado: ${conn.state}`);
  }
  console.log(`✅ WhatsApp conectado na instância "${evoConfig.instance}". Estado: ${conn.state}`);

  // 2. Verificar ou criar lead de teste
  let leadRes = await pool.query(`
    SELECT id, business_name, segment, city, state, phone, metadata
    FROM sales_leads
    WHERE phone = $1
    ORDER BY created_at DESC
    LIMIT 1
  `, [targetPhone]);

  let lead;
  if (leadRes.rows.length === 0) {
    const insertRes = await pool.query(`
      INSERT INTO sales_leads (
        business_name, phone, normalized_phone, city, state, segment, source,
        stage, automation_status, attempt_count, followup_count, score, metadata, created_at, updated_at
      ) VALUES (
        'Lucas Burger Artesanal', $1, $1, 'Santa Maria', 'RS', 'hamburgueria', 'test_user',
        'discovered', 'active', 0, 0, 100,
        jsonb_build_object('is_test', true),
        now(), now()
      ) RETURNING *
    `, [targetPhone]);
    lead = insertRes.rows[0];
    console.log(`Criado lead de teste: ${lead.business_name} (ID: ${lead.id})`);
  } else {
    lead = leadRes.rows[0];
    console.log(`Lead de teste existente: ${lead.business_name} (ID: ${lead.id})`);
  }

  // 3. Provisionar loja demonstrativa (100% fotos HD)
  console.log(`Provisionando cardápio demonstrativo da loja...`);
  const prov = await provisionOutreachStore({
    lead: {
      id: lead.id,
      business_name: lead.business_name || 'Lucas Burger Artesanal',
      city: lead.city || 'Santa Maria',
      state: lead.state || 'RS',
      phone: targetPhone,
      segment: 'hamburgueria',
      metadata: lead.metadata
    },
    pool
  });

  const trackedUrl = `https://taprontomenu.com.br/c/${lead.id}`;
  console.log(`✓ Loja provisionada: ${prov.slug}`);
  console.log(`✓ URL direta: ${prov.menuUrl}`);
  console.log(`✓ Link rastreado: ${trackedUrl}`);

  await pool.query(`
    UPDATE sales_leads
    SET stage = 'preview_ready',
        metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
          'store_id', $1::text,
          'menu_slug', $2::text,
          'menu_url', $3::text,
          'tracked_url', $4::text,
          'golden_rule_images_verified', true
        ),
        updated_at = now()
    WHERE id = $5
  `, [prov.storeId, prov.slug, prov.menuUrl, trackedUrl, lead.id]);

  // 4. Conversa no CRM
  const convRes = await pool.query(`
    INSERT INTO sales_conversations (lead_id, status, created_at, updated_at)
    VALUES ($1, 'active', now(), now())
    ON CONFLICT (lead_id) WHERE status = 'active'
    DO UPDATE SET updated_at = now()
    RETURNING id
  `, [lead.id]);
  const convId = convRes.rows[0]?.id;

  // 5. Presença Digitando
  console.log(`\n⏳ Enviando presença "Digitando..." no WhatsApp...`);
  try {
    await sendEvolutionV2Presence({ phone: targetPhone, presence: 'composing', delayMs: 4000 }, evoConfig);
  } catch (e) {
    console.warn(`(Presença aviso):`, e.message);
  }
  await sleep(4000);

  // 6. Mensagem com a Nova Abordagem
  const messageText = `Olá, tudo bem? Aqui é da equipe TáPronto.\n\nMontamos uma demonstração do cardápio digital do Lucas Burger Artesanal com fotos dos hambúrgueres e pedidos direto pelo sistema, sem cobrança de comissões por pedido:\n\n👉 ${trackedUrl}\n\nComo foi uma importação automática do seu cardápio, pode haver algum pequeno ajuste de preço ou item. Você pode dar uma olhada e nos avisar o que achou?`;

  console.log(`📨 Enviando mensagem para ${targetPhone}...`);
  console.log(`--- Conteúdo ---\n${messageText}\n----------------`);

  const textRes = await sendEvolutionV2SalesText({ phone: targetPhone, text: messageText }, evoConfig);
  console.log(`\n✅ MENSAGEM ENVIADA COM SUCESSO!`);
  console.log(`Provider Message ID: ${textRes.id}`);

  // 7. Salvar no CRM
  await pool.query(`
    INSERT INTO sales_messages (
      lead_id, conversation_id, provider_message_id, direction,
      body, status, requires_approval, approved_at, sent_at, metadata, created_at
    ) VALUES (
      $1, $2, $3, 'outbound',
      $4, 'sent', false, now(), now(), jsonb_build_object('kind', 'user_test_new_approach'), now()
    ) ON CONFLICT (provider_message_id) DO NOTHING
  `, [lead.id, convId, textRes.id, messageText]);

  await pool.query(`
    UPDATE sales_leads
    SET stage = 'awaiting_reply',
        attempt_count = attempt_count + 1,
        last_contact_at = now(),
        updated_at = now()
    WHERE id = $1
  `, [lead.id]);

  console.log(`\n🎉 Teste concluído com sucesso! Verifique seu WhatsApp.`);
  await pool.end();
}

main().catch(console.error);

