import pg from 'pg';
import { provisionOutreachStore } from '../src/lib/outreach-store-provisioning.js';

try { process.loadEnvFile?.('.env'); } catch {}

const dbUrl = process.env.DATABASE_URL || 'postgresql://cardapio_user:ca3b7539eb748218ad8c652ae489f7087d42360367a9470d@localhost:5433/cardapio?schema=public';
const pool = new pg.Pool({ connectionString: dbUrl });

async function main() {
  // 1. Top 20 Marmitarias (Almoço)
  const lunchQuery = `
    SELECT id, business_name, city, state, segment, phone, metadata
    FROM sales_leads
    WHERE stage IN ('discovered', 'verified')
      AND attempt_count = 0
      AND phone IS NOT NULL
      AND segment = 'marmitaria'
      AND (metadata->>'store_id' IS NULL OR metadata->>'menu_url' IS NULL)
    ORDER BY 
      COALESCE((metadata->>'reviews_count')::int, 0) DESC,
      created_at DESC
    LIMIT 20
  `;
  const lunchLeads = (await pool.query(lunchQuery)).rows;
  console.log(`Provisioning ${lunchLeads.length} pending lunch marmitarias...`);

  for (const lead of lunchLeads) {
    try {
      const prov = await provisionOutreachStore({
        lead: {
          id: lead.id,
          business_name: lead.business_name,
          city: lead.city,
          state: lead.state,
          phone: lead.phone,
          segment: lead.segment || 'marmitaria',
          metadata: lead.metadata
        },
        pool
      });

      await pool.query(`
        UPDATE sales_leads
        SET metadata = jsonb_set(
          jsonb_set(COALESCE(metadata, '{}'::jsonb), '{store_id}', to_jsonb($1::text)),
          '{menu_url}', to_jsonb($2::text)
        ),
        updated_at = now()
        WHERE id = $3
      `, [prov.storeId, prov.menuUrl, lead.id]);

      console.log(`  ✓ Almoço: ${lead.business_name} -> ${prov.menuUrl} (${prov.itemsCount} itens)`);
    } catch (err) {
      console.error(`  ❌ Erro em ${lead.business_name}:`, err.message);
    }
  }

  // 2. Top 20 Noite (Hamburguerias, Bares, Lanches)
  const nightQuery = `
    SELECT id, business_name, city, state, segment, phone, metadata
    FROM sales_leads
    WHERE stage IN ('discovered', 'verified')
      AND attempt_count = 0
      AND phone IS NOT NULL
      AND segment != 'marmitaria'
      AND (metadata->>'store_id' IS NULL OR metadata->>'menu_url' IS NULL)
    ORDER BY 
      COALESCE((metadata->>'reviews_count')::int, 0) DESC,
      created_at DESC
    LIMIT 20
  `;
  const nightLeads = (await pool.query(nightQuery)).rows;
  console.log(`\nProvisioning ${nightLeads.length} pending evening leads...`);

  for (const lead of nightLeads) {
    try {
      const prov = await provisionOutreachStore({
        lead: {
          id: lead.id,
          business_name: lead.business_name,
          city: lead.city,
          state: lead.state,
          phone: lead.phone,
          segment: lead.segment || 'hamburgueria',
          metadata: lead.metadata
        },
        pool
      });

      await pool.query(`
        UPDATE sales_leads
        SET metadata = jsonb_set(
          jsonb_set(COALESCE(metadata, '{}'::jsonb), '{store_id}', to_jsonb($1::text)),
          '{menu_url}', to_jsonb($2::text)
        ),
        updated_at = now()
        WHERE id = $3
      `, [prov.storeId, prov.menuUrl, lead.id]);

      console.log(`  ✓ Noite: ${lead.business_name} [${lead.segment}] -> ${prov.menuUrl} (${prov.itemsCount} itens)`);
    } catch (err) {
      console.error(`  ❌ Erro em ${lead.business_name}:`, err.message);
    }
  }

  console.log('\n=== TODOS OS 40 LEADS PROVISIONADOS COM SUCESSO! ===');
  await pool.end();
}

main().catch(console.error);

