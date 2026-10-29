import pg from 'pg';
import {
  evolutionV2SalesConfig,
  getEvolutionV2ConnectionState,
  checkEvolutionV2WhatsappNumber
} from '../src/lib/evolution-v2-sales.js';
import { buildHarveyStep1 } from '../src/lib/harvey-outbound-engine.js';

try { process.loadEnvFile?.('.env'); } catch {}

const dbUrl = process.env.DATABASE_URL || 'postgresql://cardapio_user:ca3b7539eb748218ad8c652ae489f7087d42360367a9470d@localhost:5433/cardapio?schema=public';
const pool = new pg.Pool({ connectionString: dbUrl });

const PROTECTED_PHONES = new Set([
  '5514998325915',
  '5514996668189',
  '5514997013801',
  '5514997992631',
  '5514996237187',
  '5514991011313'
]);

async function main() {
  console.log('================================================================');
  console.log('   PREPARAÇÃO DOS LEADS DO TURNO DA NOITE (JANTAR - 29/10/2026)  ');
  console.log('   Hamburguerias e Pizzarias — BA, RS, SC e PR (Cavalo de Troia)');
  console.log('================================================================\n');

  const evoConfig = evolutionV2SalesConfig();
  const conn = await getEvolutionV2ConnectionState(evoConfig);
  if (!conn.connected) {
    throw new Error(`Evolution API não conectada. Estado: ${conn.state}`);
  }
  console.log(`✅ Evolution API Online e WhatsApp Conectado (instância: ${evoConfig.instance}).\n`);

  // Distribuição: BA (3), PR (5), RS (5), SC (7) = 20 leads
  const distribution = [
    { state: 'BA', target: 3 },
    { state: 'PR', target: 5 },
    { state: 'RS', target: 5 },
    { state: 'SC', target: 7 }
  ];

  const preparedLeads = [];

  for (const { state, target } of distribution) {
    const res = await pool.query(`
      SELECT 
        id, 
        business_name, 
        segment, 
        city, 
        state, 
        phone, 
        metadata
      FROM sales_leads
      WHERE stage = 'preview_ready'
        AND (metadata->>'target_turn') = 'noite'
        AND state = $1
        AND last_contact_at IS NULL
        AND attempt_count = 0
        AND source = 'regional_expansion_gmaps'
      ORDER BY (metadata->>'reviews_count')::int DESC
      LIMIT 15
    `, [state]);

    let countForState = 0;

    for (const lead of res.rows) {
      if (countForState >= target) break;
      if (PROTECTED_PHONES.has(lead.phone)) continue;

      // Validação de WhatsApp
      try {
        const wa = await checkEvolutionV2WhatsappNumber({ phone: lead.phone }, evoConfig);
        if (!wa.exists) {
          console.log(`  ❌ [Sem WhatsApp] ${lead.business_name} (${lead.phone})`);
          await pool.query(`UPDATE sales_leads SET stage = 'discarded', discard_code = 'no_whatsapp', updated_at = now() WHERE id = $1`, [lead.id]);
          continue;
        }
      } catch {}

      // Checar Regra de Ouro (Imagens HD)
      const storeId = lead.metadata?.store_id;
      if (storeId) {
        const imgCheck = await pool.query(`
          SELECT 
            count(*) as total,
            count(*) FILTER (WHERE image_url IS NULL OR image_url = '') as missing
          FROM menu_items
          WHERE store_id = $1
        `, [storeId]);

        if (Number(imgCheck.rows[0].missing) > 0 || Number(imgCheck.rows[0].total) === 0) {
          console.warn(`  ⚠️ Loja de ${lead.business_name} possui itens sem foto. Pulando.`);
          continue;
        }
      }

      // Gerar mensagem do Passo 1 (Inquiry Inocente para Noite: lanches / pizzas)
      const step1Text = buildHarveyStep1(lead);

      await pool.query(`
        UPDATE sales_leads
        SET metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
              'target_date', '2026-10-29',
              'target_turn', 'noite',
              'outreach_strategy', 'ready_for_trojan_step1',
              'step1_precomputed_message', $1::text,
              'evening_batch_index', $2::int
            ),
            updated_at = now()
        WHERE id = $3
      `, [step1Text, preparedLeads.length + 1, lead.id]);

      countForState++;
      preparedLeads.push({
        index: preparedLeads.length + 1,
        state: lead.state,
        city: lead.city,
        name: lead.business_name,
        phone: lead.phone,
        segment: lead.segment,
        slug: lead.metadata?.menu_slug,
        step1: step1Text
      });

      console.log(`✓ [${lead.state} ${countForState}/${target}] ${lead.business_name} (${lead.city}) [${lead.segment}]`);
      console.log(`  💬 "${step1Text}"\n`);
    }
  }

  console.log('================================================================');
  console.log(`🎉 PREPARAÇÃO DO TURNO DA NOITE CONCLUÍDA: ${preparedLeads.length} LEADS PRONTOS!`);
  console.log('================================================================\n');

  console.table(preparedLeads.map(l => ({
    N: l.index,
    UF: l.state,
    Cidade: l.city,
    Nome: l.name.slice(0, 30),
    Segmento: l.segment,
    Telefone: l.phone,
    Loja: l.slug
  })));

  await pool.end();
}

main().catch(err => {
  console.error("FATAL:", err);
  process.exit(1);
});

