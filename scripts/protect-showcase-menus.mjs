import { getLocalPool } from '../src/lib/local-postgrest-adapter.js';

try { process.loadEnvFile?.('.env'); } catch {}

const args = new Set(process.argv.slice(2));
const apply = args.has('--apply');
const pool = getLocalPool();

// Cidades de Horizontina e região que continuam no fluxo normal de prospecção local
const LOCAL_REGION_CITIES = [
  'horizontina',
  'tres de maio',
  'três de maio',
  'santa rosa',
  'crissiumal',
  'doutor mauricio cardoso',
  'dr mauricio cardoso',
  'tucunduva',
  'campina das missoes',
  'campina das missões'
];

async function main() {
  console.log(`[Showcase Protection] Modo: ${apply ? 'APLICAR ALTERAÇÕES' : 'SIMULAÇÃO (dry-run)'}`);

  // Buscar todos os leads ativos que tenham cardápio gerado
  const query = `
    SELECT sl.id, sl.business_name, sl.phone, sl.city, sl.state, sl.stage, sl.metadata,
           s.name AS store_name, s.slug AS store_slug,
           (SELECT COUNT(*) FROM menu_items mi WHERE mi.store_id = s.id) AS items_count,
           (SELECT COUNT(*) FROM menu_items mi WHERE mi.store_id = s.id AND mi.image_url IS NOT NULL AND mi.image_url <> '') AS items_with_image
    FROM sales_leads sl
    LEFT JOIN stores s ON s.id::text = (sl.metadata->>'store_id') OR s.slug = (sl.metadata->>'menu_slug')
    WHERE (sl.metadata->>'store_id' IS NOT NULL OR sl.metadata->>'menu_url' IS NOT NULL)
      AND COALESCE(sl.metadata->>'menu_status', '') <> 'deleted'
    ORDER BY sl.city ASC, sl.business_name ASC
  `;

  const res = await pool.query(query);
  const leads = res.rows;

  const candidatesToProtect = [];
  const localRegionLeads = [];

  for (const lead of leads) {
    const cityNorm = (lead.city || '').trim().toLowerCase();
    const isLocalRegion = LOCAL_REGION_CITIES.some(c => cityNorm.includes(c));

    if (isLocalRegion) {
      localRegionLeads.push(lead);
    } else {
      candidatesToProtect.push(lead);
    }
  }

  console.log(`\nEncontrados ${leads.length} leads com cardápio ativo no total.`);
  console.log(`- Região de Horizontina (mantêm fluxo padrão de outreach): ${localRegionLeads.length}`);
  console.log(`- Fora da região (candidatos à blindagem como Vitrine): ${candidatesToProtect.length}\n`);

  console.log('--- Cardápios Selecionados para Blindagem (Fora da Região) ---');
  for (const item of candidatesToProtect) {
    const alreadyProtected = item.metadata?.is_showcase && item.metadata?.continuity_confirmed;
    console.log(
      `• ${item.business_name} | Cidade: ${item.city}/${item.state} | Loja: ${item.store_slug || 'n/a'} | Itens: ${item.items_count} (${item.items_with_image} fotos) | Já protegido: ${alreadyProtected ? 'SIM' : 'NÃO'}`
    );
  }

  if (!apply) {
    console.log('\n[Simulação concluída] Para aplicar as proteções no banco de dados, execute:');
    console.log('node scripts/protect-showcase-menus.mjs --apply\n');
    await pool.end();
    return;
  }

  let updatedCount = 0;
  for (const item of candidatesToProtect) {
    const updatedMetadata = {
      ...(item.metadata || {}),
      continuity_confirmed: true,
      continuity_confirmed_at: item.metadata?.continuity_confirmed_at || new Date().toISOString(),
      continuity_confirmed_by: 'showcase_whitelist_protection',
      is_showcase: true,
      do_not_delete: true,
      menu_status: 'kept',
      keep_as_showcase: true
    };

    const nextStage = ['discovered', 'photos_ready', 'preview_ready', 'scheduled', 'awaiting_reply', 'basic_validated', 'activity_validated', 'menu_checked'].includes(item.stage)
      ? 'engaged'
      : item.stage;

    await pool.query(
      `UPDATE sales_leads
       SET metadata = $2::jsonb,
           stage = $3,
           updated_at = NOW()
       WHERE id = $1`,
      [item.id, JSON.stringify(updatedMetadata), nextStage]
    );

    await pool.query(
      `INSERT INTO sales_automation_events (lead_id, event_type, stage, result, details, created_at)
       VALUES ($1, 'showcase_protection_applied', $2, 'success', $3::jsonb, NOW())`,
      [
        item.id,
        nextStage,
        JSON.stringify({
          reason: 'outside_horizontina_showcase_whitelist',
          city: item.city,
          state: item.state,
          store_slug: item.store_slug
        })
      ]
    ).catch(() => {});

    updatedCount++;
  }

  console.log(`\n[SUCESSO] ${updatedCount} cardápios externos foram blindados contra exclusão automática!`);
  await pool.end();
}

main().catch(err => {
  console.error('[ERRO]', err);
  process.exit(1);
});

