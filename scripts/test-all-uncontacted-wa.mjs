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
    return {
      exists: Boolean(row?.exists ?? row?.isBusiness ?? row?.jid),
      jid: row?.jid || null
    };
  } catch (err) {
    return { exists: false, error: err.message };
  }
}

async function main() {
  const localExcludedCities = [
    'Horizontina', 'Três de Maio', 'Santa Rosa', 'Tucunduva', 
    'Crissiumal', 'Santo Ângelo', 'Ijuí', 'Doutor Maurício Cardoso'
  ];

  const res = await pool.query(`
    SELECT l.id, l.business_name, l.phone, l.city, l.state, l.stage, l.discard_code,
           l.metadata->>'menu_slug' as slug, l.metadata->>'menu_url' as menu_url
    FROM sales_leads l
    WHERE l.last_contact_at IS NULL
      AND l.attempt_count = 0
      AND l.phone IS NOT NULL
      AND l.city NOT IN (${localExcludedCities.map((_, i) => `$${i + 1}`).join(', ')})
    ORDER BY l.created_at ASC
  `, localExcludedCities);

  console.log(`Testando WhatsApp de ${res.rowCount} leads não contatados...`);
  const results = [];
  for (const l of res.rows) {
    const wa = await checkWhatsApp(l.phone);
    results.push({
      id: l.id.slice(0, 8),
      name: l.business_name,
      city: `${l.city}/${l.state}`,
      phone: l.phone,
      stage: l.stage,
      discard: l.discard_code || '-',
      wa_exists: wa.exists,
      jid: wa.jid
    });
  }

  console.table(results);
  const waValid = results.filter(r => r.wa_exists);
  console.log(`\nTotal com WhatsApp válido: ${waValid.length}`);
  console.table(waValid);

  await pool.end();
}

main().catch(console.error);

