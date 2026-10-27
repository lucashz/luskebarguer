import { getLocalPool } from '../src/lib/local-postgrest-adapter.js';

try { process.loadEnvFile?.('.env'); } catch {}

const pool = getLocalPool();

async function main() {
  const leads = await pool.query(`
    SELECT id, business_name, phone, normalized_phone, city, state, segment, metadata
    FROM sales_leads
    WHERE stage = 'scheduled'
  `);

  console.log(`Verificando WhatsApp dos ${leads.rowCount} leads agendados...`);
  const evoUrl = process.env.SALES_EVOLUTION_V2_BASE_URL || 'http://192.168.1.108:8080';
  const instance = process.env.SALES_EVOLUTION_V2_INSTANCE || 'tápronto';
  const apiKey = process.env.SALES_EVOLUTION_V2_API_KEY || '';

  for (const lead of leads.rows) {
    const phone = lead.normalized_phone || lead.phone;
    try {
      const res = await fetch(`${evoUrl}/chat/whatsappNumbers/${instance}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': apiKey
        },
        body: JSON.stringify({ numbers: [phone] })
      });
      const data = await res.json();
      const info = Array.isArray(data) ? data[0] : (data?.numbers?.[0] || data);
      const exists = info?.exists ?? info?.isInWhatsapp ?? false;
      const jid = info?.jid || info?.number || null;
      console.log(`${exists ? '✅' : '❌'} ${lead.business_name} | Tel: ${phone} | Existe no WhatsApp: ${exists} | JID: ${jid}`);
    } catch (err) {
      console.log(`⚠️ ${lead.business_name} | Erro ao checar: ${err.message}`);
    }
  }

  await pool.end();
}

main().catch(console.error);

