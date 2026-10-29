import pg from 'pg';
import { provisionOutreachStore } from '../src/lib/outreach-store-provisioning.js';
import {
  evolutionV2SalesConfig,
  checkEvolutionV2WhatsappNumber
} from '../src/lib/evolution-v2-sales.js';

try { process.loadEnvFile?.('.env'); } catch {}

const dbUrl = process.env.DATABASE_URL || 'postgresql://cardapio_user:ca3b7539eb748218ad8c652ae489f7087d42360367a9470d@localhost:5433/cardapio?schema=public';
const pool = new pg.Pool({ connectionString: dbUrl });

async function main() {
  const evoConfig = evolutionV2SalesConfig();
  const states = ['BA', 'RS', 'SC', 'PR'];

  console.log("================================================================");
  console.log("   PROVISIONANDO MARMITARIAS REGIONAIS PARA TURNO MANHÃ (ALMOÇO)  ");
  console.log("================================================================\n");

  let totalProvisioned = 0;

  for (const state of states) {
    const res = await pool.query(`
      SELECT id, business_name, segment, city, state, phone, metadata
      FROM sales_leads
      WHERE source = 'regional_expansion_gmaps'
        AND stage = 'discovered'
        AND segment = 'marmitaria'
        AND state = $1
      ORDER BY (metadata->>'reviews_count')::int DESC
      LIMIT 15
    `, [state]);

    let stateProvisioned = 0;
    const targetPerState = 5;

    for (const lead of res.rows) {
      if (stateProvisioned >= targetPerState) break;

      // 1. Checagem WhatsApp
      try {
        const wa = await checkEvolutionV2WhatsappNumber({ phone: lead.phone }, evoConfig);
        if (!wa.exists) {
          console.log(`  ❌ [Sem WhatsApp] ${lead.business_name} (${lead.phone})`);
          await pool.query(`UPDATE sales_leads SET stage = 'discarded', discard_code = 'no_whatsapp', updated_at = now() WHERE id = $1`, [lead.id]);
          continue;
        }
      } catch {}

      // 2. Provisionamento Cardápio Modelo (Regra de Ouro: 100% Imagens HD)
      try {
        const prov = await provisionOutreachStore({
          lead: {
            id: lead.id,
            business_name: lead.business_name,
            city: lead.city,
            state: lead.state,
            phone: lead.phone,
            segment: 'marmitaria',
            metadata: lead.metadata
          },
          pool
        });

        const cleanMenuUrl = `https://taprontomenu.com.br/${prov.slug}`;

        await pool.query(`
          UPDATE sales_leads
          SET stage = 'preview_ready',
              metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
                'target_turn', 'manha',
                'outreach_strategy', 'ready_for_trojan_step1',
                'store_id', $1::text,
                'menu_slug', $2::text,
                'menu_url', $3::text,
                'golden_rule_images_verified', true
              ),
              updated_at = now()
          WHERE id = $4
        `, [prov.storeId, prov.slug, cleanMenuUrl, lead.id]);

        stateProvisioned++;
        totalProvisioned++;
        console.log(`  🚀 [${state} MANHÃ ${stateProvisioned}/${targetPerState}] ${lead.business_name} (${lead.city}) -> ${cleanMenuUrl}`);
      } catch (err) {
        console.warn(`  ⚠️ Erro ao provisionar ${lead.business_name}:`, err.message);
      }
    }
  }

  console.log(`\n✅ Total de ${totalProvisioned} marmitarias provisionadas para o Turno da Manhã!`);
  await pool.end();
}

main().catch(err => {
  console.error("FATAL:", err);
  process.exit(1);
});
