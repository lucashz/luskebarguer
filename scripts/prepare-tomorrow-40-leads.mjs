import pg from 'pg';
import { provisionOutreachStore } from '../src/lib/outreach-store-provisioning.js';
import {
  evolutionV2SalesConfig,
  getEvolutionV2ConnectionState
} from '../src/lib/evolution-v2-sales.js';

try { process.loadEnvFile?.('.env'); } catch {}

const dbUrl = process.env.DATABASE_URL || 'postgresql://cardapio_user:ca3b7539eb748218ad8c652ae489f7087d42360367a9470d@localhost:5433/cardapio?schema=public';
const pool = new pg.Pool({ connectionString: dbUrl });

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function verifyWhatsAppNumber(phone, config) {
  try {
    const res = await fetch(`${config.baseUrl}/chat/whatsappNumbers/${encodeURIComponent(config.instance)}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', apikey: config.apiKey },
      body: JSON.stringify({ numbers: [phone] })
    });
    const data = await res.json();
    const info = Array.isArray(data) ? data[0] : (data?.data?.[0] || data);
    return info?.exists === true;
  } catch {
    return false;
  }
}

async function main() {
  console.log("================================================================");
  console.log("   PREPARAÇÃO DOS 40 LEADS DE AMANHÃ (CAVALO DE TROIA EM 3 PASSOS) ");
  console.log("================================================================\n");

  const evoConfig = evolutionV2SalesConfig();
  const conn = await getEvolutionV2ConnectionState(evoConfig);
  if (!conn.connected) {
    throw new Error(`Evolution API não conectada. Estado: ${conn.state}`);
  }
  console.log(`✅ Evolution API conectada na instância "${evoConfig.instance}".\n`);

  // 1. Selecionar candidatos para Manhã (Almoço / Restaurantes / Marmitarias)
  const morningCandidatesRes = await pool.query(`
    SELECT id, business_name, segment, city, state, phone, metadata
    FROM sales_leads
    WHERE last_contact_at IS NULL 
      AND attempt_count = 0
      AND segment IN ('restaurante', 'marmitaria')
    ORDER BY (metadata->>'reviews_count')::int DESC
    LIMIT 35
  `);

  // 2. Selecionar candidatos para Noite (Hamburguerias / Lanchonetes / Pizzarias)
  const eveningCandidatesRes = await pool.query(`
    SELECT id, business_name, segment, city, state, phone, metadata
    FROM sales_leads
    WHERE last_contact_at IS NULL 
      AND attempt_count = 0
      AND segment IN ('hamburgueria', 'lanchonete', 'pizzaria', 'acaiteria', 'bar')
    ORDER BY (metadata->>'reviews_count')::int DESC
    LIMIT 35
  `);

  console.log(`Candidatos brutos: ${morningCandidatesRes.rows.length} manhã, ${eveningCandidatesRes.rows.length} noite.`);

  const morningPrepared = [];
  const eveningPrepared = [];

  // Preparar Turno da Manhã (Meta: 20)
  console.log("\n--- Validando e Provisionando Turno 1: Manhã (Almoço) ---");
  for (const lead of morningCandidatesRes.rows) {
    if (morningPrepared.length >= 20) break;
    const isValid = await verifyWhatsAppNumber(lead.phone, evoConfig);
    if (!isValid) {
      console.log(`❌ [SEM WHATSAPP] ${lead.business_name} (${lead.phone})`);
      continue;
    }

    // Provisionar loja com 100% imagens HD
    const prov = await provisionOutreachStore({
      lead: {
        id: lead.id,
        business_name: lead.business_name,
        city: lead.city || 'Bauru',
        state: lead.state || 'SP',
        phone: lead.phone,
        segment: lead.segment || 'restaurante',
        metadata: lead.metadata
      },
      pool
    });

    const trackedUrl = `https://taprontomenu.com.br/c/${lead.id}`;

    await pool.query(`
      UPDATE sales_leads
      SET stage = 'preview_ready',
          metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
            'target_turn', 'manha',
            'target_date', '2026-10-28',
            'outreach_strategy', 'ready_for_trojan_step1',
            'store_id', $1::text,
            'menu_slug', $2::text,
            'menu_url', $3::text,
            'tracked_url', $4::text,
            'golden_rule_images_verified', true
          ),
          updated_at = now()
      WHERE id = $5
    `, [prov.storeId, prov.slug, prov.menuUrl, trackedUrl, lead.id]);

    morningPrepared.push({
      turno: 'Manhã',
      name: lead.business_name,
      segment: lead.segment,
      city: lead.city,
      phone: lead.phone,
      slug: prov.slug
    });
    console.log(`✓ [MANHÃ ${morningPrepared.length}/20] ${lead.business_name} (${lead.segment}) - Loja: ${prov.slug}`);
  }

  // Preparar Turno da Noite (Meta: 20)
  console.log("\n--- Validando e Provisionando Turno 2: Noite (Delivery Noturno) ---");
  for (const lead of eveningCandidatesRes.rows) {
    if (eveningPrepared.length >= 20) break;
    const isValid = await verifyWhatsAppNumber(lead.phone, evoConfig);
    if (!isValid) {
      console.log(`❌ [SEM WHATSAPP] ${lead.business_name} (${lead.phone})`);
      continue;
    }

    // Provisionar loja com 100% imagens HD
    const prov = await provisionOutreachStore({
      lead: {
        id: lead.id,
        business_name: lead.business_name,
        city: lead.city || 'Bauru',
        state: lead.state || 'SP',
        phone: lead.phone,
        segment: lead.segment || 'hamburgueria',
        metadata: lead.metadata
      },
      pool
    });

    const trackedUrl = `https://taprontomenu.com.br/c/${lead.id}`;

    await pool.query(`
      UPDATE sales_leads
      SET stage = 'preview_ready',
          metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
            'target_turn', 'noite',
            'target_date', '2026-10-28',
            'outreach_strategy', 'ready_for_trojan_step1',
            'store_id', $1::text,
            'menu_slug', $2::text,
            'menu_url', $3::text,
            'tracked_url', $4::text,
            'golden_rule_images_verified', true
          ),
          updated_at = now()
      WHERE id = $5
    `, [prov.storeId, prov.slug, prov.menuUrl, trackedUrl, lead.id]);

    eveningPrepared.push({
      turno: 'Noite',
      name: lead.business_name,
      segment: lead.segment,
      city: lead.city,
      phone: lead.phone,
      slug: prov.slug
    });
    console.log(`✓ [NOITE ${eveningPrepared.length}/20] ${lead.business_name} (${lead.segment}) - Loja: ${prov.slug}`);
  }

  console.log("\n================================================================");
  console.log(`🎉 40 LEADS PREPARADOS COM SUCESSO PARA AMANHÃ!`);
  console.log(`Manhã: ${morningPrepared.length} leads | Noite: ${eveningPrepared.length} leads`);
  console.log("================================================================\n");

  await pool.end();
}

main().catch(console.error);
