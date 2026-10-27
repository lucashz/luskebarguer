import { evolutionV2SalesConfig } from '../src/lib/evolution-v2-sales.js';

try { process.loadEnvFile?.('.env'); } catch {}

async function testFormats() {
  const config = evolutionV2SalesConfig();
  const phone = '5514991555260';
  const jid = '5514991555260@s.whatsapp.net';

  const bodies = [
    { number: phone, presence: 'composing', delay: 1200 },
    { number: jid, presence: 'composing', delay: 1200 },
    { number: phone, presence: 'composing' },
    { number: jid, presence: 'composing' },
    { presence: 'composing' }
  ];

  for (let i = 0; i < bodies.length; i++) {
    const res = await fetch(`${config.baseUrl}/chat/sendPresence/${encodeURIComponent(config.instance)}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', apikey: config.apiKey },
      body: JSON.stringify(bodies[i])
    });
    console.log(`Format ${i} (${JSON.stringify(bodies[i])}): status ${res.status}`, await res.text());
  }
}

testFormats().catch(console.error);

