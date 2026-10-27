import pg from 'pg';
import { readFile } from 'node:fs/promises';
import {
  evolutionV2SalesConfig,
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

export async function sendStep3Demo(leadId) {
  const evoConfig = evolutionV2SalesConfig();

  const leadRes = await pool.query(`
    SELECT l.id, l.business_name, l.phone, l.normalized_phone, l.city, l.metadata, c.id AS conv_id
    FROM sales_leads l
    JOIN sales_conversations c ON c.lead_id = l.id
    WHERE l.id = $1
  `, [leadId]);

  if (leadRes.rows.length === 0) throw new Error('Lead não encontrado.');
  const lead = leadRes.rows[0];
  const phone = lead.normalized_phone || lead.phone;
  const meta = lead.metadata || {};
  const menuUrl = meta.menu_url ? `${meta.menu_url}?ref=wa&lid=${lead.id}` : `https://taprontomenu.com.br?ref=wa&lid=${lead.id}`;

  console.log(`Enviando Step 3 (Demonstração Pronta) para ${lead.business_name} (${phone})...`);

  // 1. Texto com link e oferta sem risco
  const msg = `Aqui está o link da demonstração que montei pra vocês:\n\n👉 ${menuUrl}\n\nSe vocês quiserem testar hoje na janta com os clientes sem custo nenhum, eu deixo liberado pra vocês verem os pedidos entrando direto no painel da plataforma. O que acham?`;
  const textRes = await sendEvolutionV2SalesText({ phone, text: msg }, evoConfig);

  await pool.query(`
    INSERT INTO sales_messages (
      lead_id, conversation_id, provider_message_id, direction,
      body, status, requires_approval, approved_at, sent_at, metadata, created_at
    ) VALUES ($1, $2, $3, 'outbound', $4, 'sent', false, now(), now(), jsonb_build_object('kind', 'trojan_demo_step3', 'step', 3), now())
    ON CONFLICT (provider_message_id) DO NOTHING
  `, [lead.id, lead.conv_id, textRes.id, msg]);

  await sleep(3000);

  // 2. Print Mobile
  if (meta.mobile_file) {
    try {
      const mobBytes = await readFile(meta.mobile_file);
      const mobRes = await sendEvolutionV2SalesMedia({
        phone,
        mediaBase64: Buffer.from(mobBytes).toString('base64'),
        mimeType: 'image/png',
        caption: 'Visualização rápida no celular para o cliente fazer pedidos pelo WhatsApp.'
      }, evoConfig);

      await pool.query(`
        INSERT INTO sales_messages (
          lead_id, conversation_id, provider_message_id, direction,
          body, status, requires_approval, approved_at, sent_at, metadata, created_at
        ) VALUES ($1, $2, $3, 'outbound', $4, 'sent', false, now(), now(), jsonb_build_object('kind', 'trojan_mobile_step3', 'step', 3), now())
        ON CONFLICT (provider_message_id) DO NOTHING
      `, [lead.id, lead.conv_id, mobRes.id, 'Visualização rápida no celular para o cliente fazer pedidos pelo WhatsApp.']);
    } catch (e) {
      console.warn('Aviso no print mobile:', e.message);
    }
  }

  // Atualizar metadata
  await pool.query(`
    UPDATE sales_leads
    SET metadata = jsonb_set(COALESCE(metadata, '{}'::jsonb), '{outreach_strategy}', '"trojan_demo_delivered"'::jsonb),
        stage = 'engaged',
        updated_at = now()
    WHERE id = $1
  `, [lead.id]);

  console.log(`✓ Step 3 entregue com sucesso para ${lead.business_name}!`);
}

const isDirect = process.argv[1]?.endsWith('handle-trojan-step3.mjs');
if (isDirect && process.argv[2]) {
  sendStep3Demo(process.argv[2])
    .then(() => pool.end())
    .catch((err) => {
      console.error(err);
      pool.end();
    });
}

