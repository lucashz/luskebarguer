import { probeEvolutionV2WebhookReceiver, evolutionV2SalesConfig } from '../src/lib/evolution-v2-sales.js';
import dotenv from 'dotenv';
dotenv.config();

async function run() {
  const config = evolutionV2SalesConfig();
  console.log('Config:', {
    baseUrl: config.baseUrl,
    instance: config.instance,
    hasApiKey: !!config.apiKey,
    hasWebhookSecret: !!config.webhookSecret
  });

  const urlsToTest = [
    'https://taprontomenu.com.br/api/integrations/evolution/webhook',
    'https://central.taprontomenu.com.br/api/integrations/evolution/webhook'
  ];

  for (const url of urlsToTest) {
    try {
      console.log(`\nProbing ${url}...`);
      const res = await probeEvolutionV2WebhookReceiver({ url }, config);
      console.log('SUCCESS:', res);
    } catch (err) {
      console.error('FAILED:', err.message);
    }
  }
}

run();
