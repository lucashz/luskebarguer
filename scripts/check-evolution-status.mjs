import { evolutionV2SalesConfig } from '../src/lib/evolution-v2-sales.js';

try { process.loadEnvFile?.('.env'); } catch {}

async function main() {
  const config = evolutionV2SalesConfig();
  console.log('Evolution Config:', { baseUrl: config.baseUrl, instance: config.instance });

  try {
    const res = await fetch(`${config.baseUrl}/instance/fetchInstances`, {
      headers: { apikey: config.apiKey },
      signal: AbortSignal.timeout(5000)
    });
    console.log('fetchInstances Status:', res.status);
    const data = await res.json();
    console.log('Instances list:', JSON.stringify(data, null, 2));
  } catch (err) {
    console.error('Erro ao buscar instâncias:', err.message);
  }

  try {
    const stateRes = await fetch(`${config.baseUrl}/instance/connectionState/${encodeURIComponent(config.instance)}`, {
      headers: { apikey: config.apiKey },
      signal: AbortSignal.timeout(5000)
    });
    console.log('connectionState Status:', stateRes.status);
    const stateData = await stateRes.json();
    console.log('connectionState Data:', stateData);
  } catch (err) {
    console.error('Erro connectionState:', err.message);
  }
}

main().catch(console.error);
