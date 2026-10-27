import { evolutionV2SalesConfig } from '../src/lib/evolution-v2-sales.js';

try { process.loadEnvFile?.('.env'); } catch {}

async function testPresenceDirect() {
  const config = evolutionV2SalesConfig();
  console.log('Config:', { baseUrl: config.baseUrl, instance: config.instance });

  const urlCheck = `${config.baseUrl}/chat/whatsappNumbers/${encodeURIComponent(config.instance)}`;
  const res1 = await fetch(urlCheck, {
    method: 'POST',
    headers: { 'content-type': 'application/json', apikey: config.apiKey },
    body: JSON.stringify({ numbers: ['5514991555260'] })
  });
  console.log('whatsappNumbers status:', res1.status, await res1.text());

  const urlPresence = `${config.baseUrl}/chat/sendPresence/${encodeURIComponent(config.instance)}`;
  const res2 = await fetch(urlPresence, {
    method: 'POST',
    headers: { 'content-type': 'application/json', apikey: config.apiKey },
    body: JSON.stringify({ number: '5514991555260', presence: 'composing', delay: 1500 })
  });
  console.log('sendPresence status:', res2.status, await res2.text());
}

testPresenceDirect().catch(console.error);

