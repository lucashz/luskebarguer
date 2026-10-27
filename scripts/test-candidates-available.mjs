import { getLocalPool } from '../src/lib/local-postgrest-adapter.js';
import { evolutionV2SalesConfig, evolutionV2Request } from '../src/lib/evolution-v2-sales.js';

try { process.loadEnvFile?.('.env'); } catch {}

const pool = getLocalPool();

async function checkWhatsApp(phone) {
  try {
    const config = evolutionV2SalesConfig();
    const data = await evolutionV2Request(`/chat/whatsappNumbers/${encodeURIComponent(config.instance)}`, {
      method: 'POST',
      body: JSON.stringify({ numbers: [phone] })
    }, config);
    const row = Array.isArray(data) ? data[0] : data?.numbers?.[0] || data;
    return Boolean(row?.exists ?? row?.isBusiness ?? row?.jid);
  } catch (err) {
    console.warn(`[whatsapp-check] Erro ao verificar ${phone}:`, err.message);
    return false;
  }
}

async function main() {
  const localExcludedCities = [
    'Horizontina', 'Três de Maio', 'Santa Rosa', 'Tucunduva', 
    'Crissiumal', 'Santo Ângelo', 'Ijuí', 'Doutor Maurício Cardoso'
  ];

  const res = await pool.query(`
    SELECT l.*
    FROM sales_leads l
    WHERE l.stage = 'discovered'
      AND l.phone IS NOT NULL
      AND LENGTH(REGEXP_REPLACE(l.phone, '\\D', '', 'g')) >= 10
      AND l.city NOT IN (${localExcludedCities.map((_, i) => `$${i + 1}`).join(', ')})
      AND NOT EXISTS (
        SELECT 1 FROM sales_suppressions s WHERE s.normalized_phone = l.normalized_phone
      )
    ORDER BY l.created_at DESC
    LIMIT 35
  `, localExcludedCities);

  console.log(`Candidatos potenciais encontrados: ${res.rowCount}`);

  let waCount = 0;
  for (const c of res.rows) {
    const phone = c.normalized_phone || c.phone;
    const isWa = await checkWhatsApp(phone);
    console.log(`[${isWa ? 'WA OK' : 'NO WA'}] ${c.business_name} | ${c.city}/${c.state} | ${c.segment} | ${phone}`);
    if (isWa) waCount++;
    if (waCount >= 18) break;
  }

  console.log(`\nTotal com WhatsApp validado: ${waCount}`);
  await pool.end();
}

main().catch(console.error);
