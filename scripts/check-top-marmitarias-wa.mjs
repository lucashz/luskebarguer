import pg from 'pg';
import { evolutionV2SalesConfig, evolutionV2Request } from '../src/lib/evolution-v2-sales.js';

try { process.loadEnvFile?.('.env'); } catch {}

const pool = new pg.Pool({
  connectionString: 'postgresql://cardapio_user:ca3b7539eb748218ad8c652ae489f7087d42360367a9470d@localhost:5433/cardapio?schema=public'
});

async function checkWhatsApp(phone) {
  try {
    const config = evolutionV2SalesConfig();
    const clean = phone.replace(/\D/g, '');
    const data = await evolutionV2Request(`/chat/whatsappNumbers/${encodeURIComponent(config.instance)}`, {
      method: 'POST',
      body: JSON.stringify({ numbers: [clean] }),
      timeoutMs: 15000
    }, config);
    const row = Array.isArray(data) ? data[0] : data?.numbers?.[0] || data;
    return Boolean(row?.exists ?? row?.isBusiness ?? row?.jid);
  } catch (err) {
    console.warn(`[whatsapp-check] Erro ao verificar ${phone}:`, err.message);
    return false;
  }
}

async function main() {
  const query = `
    SELECT id, business_name, phone, city, state, segment, stage
    FROM sales_leads
    WHERE attempt_count = 0 
      AND last_contact_at IS NULL
      AND stage = 'discovered'
      AND segment = 'marmitaria'
      AND city IN ('Botucatu', 'Marília', 'Bauru')
      AND NOT EXISTS (
        SELECT 1 FROM sales_messages WHERE sales_messages.lead_id = sales_leads.id
      )
    ORDER BY created_at DESC
    LIMIT 12
  `;

  const res = await pool.query(query);
  console.log(`Testando WhatsApp para ${res.rows.length} marmitarias...`);

  const verified = [];
  for (const lead of res.rows) {
    const hasWa = await checkWhatsApp(lead.phone);
    console.log(`- ${lead.business_name} (${lead.phone}): ${hasWa ? '✅ TEM WHATSAPP' : '❌ NÃO TEM'}`);
    if (hasWa) verified.push(lead);
  }

  console.log(`\nTotal com WhatsApp verificado: ${verified.length} de ${res.rows.length}`);
  await pool.end();
}

main().catch(console.error);
