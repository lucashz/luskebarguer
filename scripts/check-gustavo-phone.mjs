import { evolutionV2SalesConfig, evolutionV2Request } from '../src/lib/evolution-v2-sales.js';

try { process.loadEnvFile?.('.env'); } catch {}

async function main() {
  const config = evolutionV2SalesConfig();
  const numbers = ['554896022350', '5548996022350'];
  const data = await evolutionV2Request(`/chat/whatsappNumbers/${encodeURIComponent(config.instance)}`, {
    method: 'POST',
    body: JSON.stringify({ numbers })
  }, config);
  console.log('Resultado da checagem:', JSON.stringify(data, null, 2));
}

main().catch(console.error);

