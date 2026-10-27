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
    return false;
  }
}

async function main() {
  const localExcludedCities = [
    'Horizontina', 'Três de Maio', 'Santa Rosa', 'Tucunduva', 
    'Crissiumal', 'Santo Ângelo', 'Ijuí', 'Doutor Maurício Cardoso'
  ];

  const res = await pool.query(`
    SELECT l.id, l.business_name, l.phone, l.normalized_phone, l.city, l.state, l.segment, 
           l.stage, l.metadata->>'menu_slug' as menu_slug, l.metadata->>'menu_url' as menu_url,
           l.google_place_id, l.metadata
    FROM sales_leads l
    WHERE l.last_contact_at IS NULL
      AND l.attempt_count = 0
      AND l.phone IS NOT NULL
      AND l.phone ~ '^55[0-9]{2}9[0-9]{8}$'
      AND l.city NOT IN (${localExcludedCities.map((_, i) => `$${i + 1}`).join(', ')})
      AND NOT EXISTS (
        SELECT 1 FROM sales_automation_jobs j 
        WHERE j.lead_id = l.id AND j.status != 'cancelled'
      )
      AND NOT EXISTS (
        SELECT 1 FROM sales_suppressions s 
        WHERE s.normalized_phone = l.normalized_phone
      )
    ORDER BY (l.metadata->>'menu_url') IS NOT NULL DESC, l.created_at ASC
  `, localExcludedCities);

  console.log(`Buscando e validando WhatsApp dos melhores candidatos...`);
  const qualified = [];

  for (const lead of res.rows) {
    const isWa = await checkWhatsApp(lead.phone);
    if (!isWa) continue;

    qualified.push({
      id: lead.id,
      name: lead.business_name,
      city: `${lead.city}/${lead.state}`,
      segment: lead.segment || 'restaurante',
      phone: lead.phone,
      slug: lead.menu_slug,
      lead
    });

    if (qualified.length === 15) break;
  }

  console.log(`\nSelecionados ${qualified.length} candidatos qualificados:`);
  console.table(qualified.map(q => ({
    name: q.name,
    city: q.city,
    segment: q.segment,
    phone: q.phone,
    slug: q.slug || '(precisa provisionar)'
  })));

  await pool.end();
}

main().catch(console.error);
