import { evolutionV2SalesConfig, getEvolutionV2WebhookState } from '../src/lib/evolution-v2-sales.js';

try { process.loadEnvFile?.('.env'); } catch {}

async function main() {
  const config = evolutionV2SalesConfig();
  console.log('Config:', { url: config.baseUrl, instance: config.instance });
  const state = await getEvolutionV2WebhookState(config);
  console.log('Webhook State:', state);
}

main().catch(console.error);

