import path from 'node:path';
import { mkdir } from 'node:fs/promises';
import pg from 'pg';
import { provisionOutreachStore } from '../src/lib/outreach-store-provisioning.js';
import { captureWithCDP } from '../src/lib/outreach-preview.js';

try { process.loadEnvFile?.('.env'); } catch {}

const pool = new pg.Pool({
  connectionString: 'postgresql://cardapio_user:ca3b7539eb748218ad8c652ae489f7087d42360367a9470d@localhost:5433/cardapio?schema=public'
});

async function main() {
  console.log('=== PROVISIONANDO CARDÁPIOS E CAPTURANDO PRINTS DOS 5 LEADS ===\n');

  const leadsRes = await pool.query(`
    SELECT id, business_name, city, state, segment, phone, normalized_phone, metadata
    FROM sales_leads
    WHERE metadata->>'outreach_strategy' = 'trojan_inquiry_step1'
  `);

  const runId = 'batch-trojan-evening-' + new Date().toISOString().slice(0, 10);
  const artifactsBase = path.resolve('artifacts/outreach/automated', runId);
  await mkdir(artifactsBase, { recursive: true });

  for (const lead of leadsRes.rows) {
    console.log(`----------------------------------------------------------------`);
    console.log(`Provisionando: ${lead.business_name} (${lead.city})`);

    // 1. Provisionar loja e produtos (com 100% fotos de alta resolução)
    const prov = await provisionOutreachStore({
      lead: {
        id: lead.id,
        business_name: lead.business_name,
        city: lead.city || 'Botucatu',
        state: lead.state || 'SP',
        phone: lead.phone,
        segment: lead.segment || 'hamburgueria',
        metadata: lead.metadata
      },
      pool
    });

    console.log(`  ✓ Loja provisionada! Slug: ${prov.slug}`);
    console.log(`  ✓ URL: ${prov.menuUrl}`);

    // 2. Captura CDP (Desktop e Mobile)
    const artifactsDir = path.join(artifactsBase, `${prov.slug}-${lead.id.slice(0, 8)}`);
    await mkdir(artifactsDir, { recursive: true });

    const desktopPath = path.join(artifactsDir, 'menu-preview.png');
    const mobilePath = path.join(artifactsDir, 'menu-preview-mobile.png');

    console.log(`  -> Capturando print Desktop CDP...`);
    await captureWithCDP({
      url: prov.menuUrl,
      outputPath: desktopPath,
      isMobile: false
    });
    console.log(`  ✓ Desktop salvo: ${desktopPath}`);

    console.log(`  -> Capturando print Mobile CDP...`);
    await captureWithCDP({
      url: prov.menuUrl,
      outputPath: mobilePath,
      isMobile: true
    });
    console.log(`  ✓ Mobile salvo: ${mobilePath}`);

    // 3. Atualizar metadata do lead com os dados prontos
    await pool.query(`
      UPDATE sales_leads
      SET metadata = jsonb_set(
        jsonb_set(
          jsonb_set(
            jsonb_set(COALESCE(metadata, '{}'::jsonb), '{store_id}', to_jsonb($1::text)),
            '{menu_url}', to_jsonb($2::text)
          ),
          '{desktop_file}', to_jsonb($3::text)
        ),
        '{mobile_file}', to_jsonb($4::text)
      )
      WHERE id = $5
    `, [prov.storeId, prov.menuUrl, desktopPath, mobilePath, lead.id]);
  }

  console.log('\n================================================================');
  console.log('TODAS AS 5 LOJAS PROVISIONADAS E PRONTAS PARA O PASSO 2!');
  console.log('================================================================\n');

  await pool.end();
}

main().catch(console.error);

