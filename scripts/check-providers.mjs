import { getLocalPool } from '../src/lib/local-postgrest-adapter.js';

try { process.loadEnvFile?.('.env'); } catch {}

const pool = getLocalPool();

async function main() {
  const providers = await pool.query('SELECT * FROM platform_whatsapp_provider_accounts LIMIT 5');
  console.log('Provider accounts:', providers.rows);

  const integrations = await pool.query('SELECT * FROM store_whatsapp_integrations LIMIT 5');
  console.log('Store integrations:', integrations.rows);

  await pool.end();
}

main().catch(console.error);
