import { evolutionV2SalesConfig, evolutionV2Request } from '../src/lib/evolution-v2-sales.js';

try { process.loadEnvFile?.('.env'); } catch {}

async function testPresence() {
  const config = evolutionV2SalesConfig();
  try {
    const res = await evolutionV2Request(`/chat/sendPresence/${encodeURIComponent(config.instance)}`, {
      method: 'POST',
      body: JSON.stringify({ number: '5514991555260', presence: 'composing', delay: 2000 })
    }, config);
    console.log('Success:', res);
  } catch (err) {
    console.log('Handled cleanly:', err.message);
  }
}

testPresence().catch(console.error);

