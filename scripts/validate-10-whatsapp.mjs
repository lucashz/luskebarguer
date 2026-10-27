import pg from 'pg';
import { evolutionV2SalesConfig, checkEvolutionV2WhatsappNumber } from '../src/lib/evolution-v2-sales.js';

try { process.loadEnvFile?.('.env'); } catch {}

const client = new pg.Client({
  connectionString: 'postgresql://cardapio_user:ca3b7539eb748218ad8c652ae489f7087d42360367a9470d@localhost:5433/cardapio?schema=public'
});

async function main() {
  await client.connect();
  const config = evolutionV2SalesConfig();

  const phones = [
    { name: 'Império Do Sabor', phone: '5514997418696' },
    { name: 'Marmitaria Ki Delicia', phone: '5514991888696' },
    { name: 'Marmitaria Serra Negra', phone: '5514998235011' },
    { name: 'Monteiro Restaurante', phone: '5514997975903' },
    { name: 'Prato Real Restaurante', phone: '5514997093836' },
    { name: 'Que seja sabor', phone: '5514997387268' },
    { name: 'Restaurante Cabana', phone: '5514999031870' },
    { name: 'Restaurante Divino Sabor', phone: '5514996809785' },
    { name: 'Restaurante VitStela', phone: '5514998549413' },
    { name: 'Tempero de Família', phone: '5514996359820' }
  ];

  console.log("=== VERIFICANDO CONTA WHATSAPP DOS 10 LEADS ===");
  for (const item of phones) {
    try {
      const res = await checkEvolutionV2WhatsappNumber({ phone: item.phone }, config);
      console.log(`- ${item.name} (${item.phone}): exists=${res.exists}, jid=${res.jid}`);
    } catch (e) {
      console.error(`- ${item.name} (${item.phone}): ERRO: ${e.message}`);
    }
  }

  await client.end();
}

main().catch(console.error);

