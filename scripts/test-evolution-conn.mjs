import { evolutionV2SalesConfig, getEvolutionV2ConnectionState, evolutionV2Request } from '../src/lib/evolution-v2-sales.js';

try { process.loadEnvFile?.('.env'); } catch {}

async function main() {
  const c = evolutionV2SalesConfig();
  console.log(`URL: ${c.baseUrl} | Instance: ${c.instance}`);
  const s = await getEvolutionV2ConnectionState(c);
  console.log('Evolution status:', s);
  if (!s.connected) {
    console.log('Connecting instance...');
    const conn = await evolutionV2Request('/instance/connect/' + encodeURIComponent(c.instance), { method: 'GET' }, c);
    console.log('Connect result:', conn);
  }
}

main().catch(console.error);

