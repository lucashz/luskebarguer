import { evolutionV2SalesConfig, getEvolutionV2WebhookState, probeEvolutionV2WebhookReceiver } from '../src/lib/evolution-v2-sales.js';

try { process.loadEnvFile?.('.env'); } catch {}

async function main() {
  const config = evolutionV2SalesConfig();
  const expectedUrl = String(process.env.SALES_EVOLUTION_V2_WEBHOOK_URL || '').trim();
  console.log('expectedUrl:', expectedUrl);
  const state = await getEvolutionV2WebhookState({ expectedUrl }, config);
  console.log('state:', state);
  try {
    const probe = await probeEvolutionV2WebhookReceiver({ url: expectedUrl }, config);
    console.log('probe success:', probe);
  } catch (err) {
    console.error('probe error:', err);
  }
}

main().catch(console.error);

