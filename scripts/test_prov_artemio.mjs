import pg from 'pg';
import { provisionOutreachStore } from '../src/lib/outreach-store-provisioning.js';

try { process.loadEnvFile?.('.env'); } catch {}

const dbUrl = process.env.DATABASE_URL || 'postgresql://cardapio_user:ca3b7539eb748218ad8c652ae489f7087d42360367a9470d@localhost:5433/cardapio?schema=public';
const pool = new pg.Pool({ connectionString: dbUrl });

async function main() {
  const leadRes = await pool.query("SELECT * FROM sales_leads WHERE id = '5ff0edbd-999c-4dc8-86a0-f85b543b6c80'");
  const lead = leadRes.rows[0];
  console.log('Testing provision for:', lead.business_name);

  const prov = await provisionOutreachStore({
    lead: {
      id: lead.id,
      business_name: lead.business_name,
      city: lead.city,
      state: lead.state,
      phone: lead.phone,
      segment: lead.segment,
      metadata: lead.metadata
    },
    pool
  });

  console.log('Provision result:', prov);

  const itemsRes = await pool.query("SELECT name, price, image_url FROM menu_items WHERE store_id = $1", [prov.storeId]);
  console.log(`Menu items (${itemsRes.rows.length}):`);
  for (const item of itemsRes.rows) {
    console.log(`  - ${item.name} (R$ ${item.price}) -> Photo: ${item.image_url ? item.image_url.slice(0, 50) + '...' : 'NONE'}`);
  }

  // Update lead
  await pool.query(`
    UPDATE sales_leads
    SET metadata = jsonb_set(
      jsonb_set(COALESCE(metadata, '{}'::jsonb), '{store_id}', to_jsonb($1::text)),
      '{menu_url}', to_jsonb($2::text)
    )
    WHERE id = $3
  `, [prov.storeId, prov.menuUrl, lead.id]);

  console.log('Lead updated with menu_url!');
  await pool.end();
}

main().catch(console.error);

