import pg from 'pg';
import { provisionOutreachStore } from '../src/lib/outreach-store-provisioning.js';

try { process.loadEnvFile?.('.env'); } catch {}

const dbUrl = process.env.DATABASE_URL || 'postgresql://cardapio_user:ca3b7539eb748218ad8c652ae489f7087d42360367a9470d@localhost:5433/cardapio?schema=public';
const pool = new pg.Pool({ connectionString: dbUrl });

async function main() {
  const pederneiras = await pool.query(`
    SELECT * FROM sales_leads 
    WHERE city ILIKE '%Pederneiras%'
      AND (metadata->>'store_id' IS NULL OR metadata->>'menu_url' IS NULL)
  `);

  console.log(`Provisioning ${pederneiras.rows.length} remaining Pederneiras marmitarias...\n`);

  for (const lead of pederneiras.rows) {
    console.log(`Provisioning: ${lead.business_name} (${lead.phone})...`);
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

    console.log(`  ✓ ${prov.slug} -> ${prov.menuUrl} (${prov.itemsCount} items)`);
  }

  console.log('\nAll Pederneiras marmitarias provisioned successfully!');
  await pool.end();
}

main().catch(console.error);

