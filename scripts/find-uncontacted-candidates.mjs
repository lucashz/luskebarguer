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
    SELECT l.id, l.business_name, l.phone, l.normalized_phone, l.city, l.state, l.segment, 
           l.stage, l.metadata->>'menu_slug' as menu_slug, l.metadata->>'menu_url' as menu_url,
           l.last_contact_at, l.attempt_count
    FROM sales_leads l
    WHERE l.last_contact_at IS NULL
      AND l.attempt_count = 0
      AND l.phone IS NOT NULL
      AND LENGTH(l.phone) >= 10
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

  console.log(`Leads potenciais nunca contatados fora da região proibida: ${res.rowCount}`);

  const candidates = [];
  for (const row of res.rows) {
    const phone = row.normalized_phone || row.phone;
    const isWa = await checkWhatsApp(phone);
    console.log(`[${isWa ? 'WA OK' : 'NO WA'}] ${row.business_name} | ${row.city}/${row.state} | ${row.segment} | Loja: ${row.menu_slug || 'n/a'} | Tel: ${phone}`);
    if (isWa) {
      candidates.push(row);
    }
  }

  console.log(`\nCandidatos qualificados com WhatsApp ativo: ${candidates.length}`);
  console.table(candidates.map(c => ({
    name: c.business_name,
    city: c.city,
    state: c.state,
    segment: c.segment,
    store: c.menu_slug,
    phone: c.phone
  })));

  await pool.end();
}

main().catch(console.error);
