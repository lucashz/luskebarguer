import { evolutionV2SalesConfig, evolutionV2Request } from '../src/lib/evolution-v2-sales.js';

try { process.loadEnvFile?.('.env'); } catch {}

const cfg = evolutionV2SalesConfig();

async function main() {
  console.log('Consultando mensagens na Evolution API...');
  
  // Testar endpoint de mensagens
  const endpoints = [
    `/chat/findMessages/${cfg.instance}`,
    `/chat/findChats/${cfg.instance}`
  ];

  for (const ep of endpoints) {
    try {
      console.log(`Tentando POST ${ep}...`);
      const res = await evolutionV2Request(ep, {
        method: 'POST',
        body: JSON.stringify({
          where: {},
          limit: 10
        })
      }, cfg);
      console.log(`Sucesso em ${ep}!`);
      console.log(JSON.stringify(res, null, 2).slice(0, 1000));
      return;
    } catch (e) {
      console.log(`Falha em POST ${ep}: ${e.message}`);
    }
  }
}

main().catch(console.error);
