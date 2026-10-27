import { getLocalPool } from '../src/lib/local-postgrest-adapter.js';
import { provisionOutreachStore } from '../src/lib/outreach-store-provisioning.js';

try { process.loadEnvFile?.('.env'); } catch {}

const pool = getLocalPool();

async function main() {
  const lead = (await pool.query("SELECT * FROM sales_leads WHERE id = 'fffcf804-1c26-46d3-b5b9-760e8a102d46'")).rows[0];
  console.log('Testing provision for:', lead.business_name);
  const prov = await provisionOutreachStore({ lead, pool, baseUrl: 'https://taprontomenu.com.br' });
  console.log('Provision result:', prov);
  await pool.end();
}

main().catch(console.error);

