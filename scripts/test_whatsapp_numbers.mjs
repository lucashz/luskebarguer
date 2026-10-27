import { evolutionV2SalesConfig } from '../src/lib/evolution-v2-sales.js';

try { process.loadEnvFile?.('.env'); } catch {}

async function testSingle() {
  const config = evolutionV2SalesConfig();
  const testList = ['5514991555260', '5514997170781', '551432812233'];
  
  for (const num of testList) {
    try {
      const res = await fetch(`${config.baseUrl}/chat/whatsappNumbers/${encodeURIComponent(config.instance)}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', apikey: config.apiKey },
        body: JSON.stringify({ numbers: [num] })
      });
      const data = await res.json();
      console.log(`Number ${num}: status ${res.status}`, JSON.stringify(data));
    } catch (e) {
      console.error(`Number ${num} error:`, e.message);
    }
  }
}

testSingle().catch(console.error);

