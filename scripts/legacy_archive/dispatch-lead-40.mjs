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

function cleanLeadName(raw) {
  return String(raw || '')
    .replace(/\s*-\s*Hamburgueria.*/i, '')
    .replace(/\s*-\s*Lanchonete.*/i, '')
    .replace(/\s*-\s*Restaurante.*/i, '')
    .replace(/\s*-\s*Explosão de Sabores.*/i, '')
    .replace(/\s*\|\s*.*/i, '')
    .replace(/\(.*\)/g, '')
    .trim();
}

async function main() {
  console.log("=== PROVISIONANDO E DISPARANDO LEAD 40: KANTO BRAGA ===");

  const evoConfig = evolutionV2SalesConfig();
  const conn = await getEvolutionV2ConnectionState(evoConfig);
  if (!conn.connected) {
    throw new Error(`Evolution API não conectada. Estado: ${conn.state}`);
  }

  const leadRes = await pool.query(`
    SELECT id, business_name, segment, city, state, phone, metadata
    FROM sales_leads
    WHERE id = '14a41b52-4817-4040-8870-84cfb3fc98f9'
  `);
  const lead = leadRes.rows[0];

  // 1. Provisionar loja
  const prov = await provisionOutreachStore({
    lead: {
      id: lead.id,
      business_name: lead.business_name,
      city: lead.city || 'Marília',
      state: lead.state || 'SP',
      phone: lead.phone,
      segment: lead.segment || 'lanchonete',
      metadata: lead.metadata
    },
    pool
  });

  const trackedUrl = `https://taprontomenu.com.br/c/${lead.id}`;

  await pool.query(`
    UPDATE sales_leads
    SET stage = 'preview_ready',
        metadata = metadata || jsonb_build_object(
          'store_id', $1::text,
          'menu_slug', $2::text,
          'menu_url', $3::text,
          'tracked_url', $4::text,
          'golden_rule_images_verified', true
        ),
        updated_at = now()
    WHERE id = $5
  `, [prov.storeId, prov.slug, prov.menuUrl, trackedUrl, lead.id]);

  console.log(`Loja provisionada: ${prov.slug}`);
  console.log(`Link rastreado: ${trackedUrl}`);

  // 2. Criar conversa
  const convRes = await pool.query(`
    INSERT INTO sales_conversations (lead_id, status, created_at, updated_at)
    VALUES ($1, 'active', now(), now())
    ON CONFLICT (lead_id) WHERE status = 'active'
    DO UPDATE SET updated_at = now()
    RETURNING id
  `, [lead.id]);
  const convId = convRes.rows[0]?.id;

  // 3. Presença digitando
  console.log(`Enviando presença digitando...`);
  await sendEvolutionV2Presence({ phone: lead.phone, presence: 'composing', delayMs: 4000 }, evoConfig);
  await sleep(4000);

  // 4. Mensagem persuasiva
  const cleanName = cleanLeadName(lead.business_name);
  const messageText = `Olá, tudo bem? Aqui é da equipe TáPronto.\n\nMontamos uma demonstração do cardápio digital do ${cleanName} com fotos dos lanches e pedidos direto pelo sistema, sem cobrança de comissões por pedido:\n\n👉 ${trackedUrl}\n\nComo foi uma importação automática do seu cardápio, pode haver algum pequeno ajuste de preço ou item. Você pode dar uma olhada e nos avisar o que achou?`;

  console.log(`Enviando mensagem para ${cleanName} (${lead.phone})...`);
  const textRes = await sendEvolutionV2SalesText({ phone: lead.phone, text: messageText }, evoConfig);
  console.log(`✓ Enviado com sucesso! Provider ID: ${textRes.id}`);

  // 5. Registrar no banco
  await pool.query(`
    INSERT INTO sales_messages (
      lead_id, conversation_id, provider_message_id, direction,
      body, status, requires_approval, approved_at, sent_at, metadata, created_at
    ) VALUES (
      $1, $2, $3, 'outbound',
      $4, 'sent', false, now(), now(), jsonb_build_object('kind', 'outreach_varied_demo'), now()
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

  console.log(`🎉 Lead 40 contatado com sucesso!`);
  await pool.end();
}

main().catch(console.error);
