import { evolutionV2SalesConfig, evolutionV2Request } from '../src/lib/evolution-v2-sales.js';

try { process.loadEnvFile?.('.env'); } catch {}

async function main() {
  const config = evolutionV2SalesConfig();
  console.log("Config:", config.baseUrl, config.instance);

  const raw = await evolutionV2Request(`/chat/whatsappNumbers/${encodeURIComponent(config.instance)}`, {
    method: 'POST',
    body: JSON.stringify({ numbers: ['5514997418696'] })
  }, config);

  console.log("Raw response from /chat/whatsappNumbers:", JSON.stringify(raw, null, 2));
}

main().catch(console.error);

