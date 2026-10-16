import { evolutionV2SalesConfig, evolutionV2Request } from './src/lib/evolution-v2-sales.js';

async function checkWhatsApp(phone) {
  const config = evolutionV2SalesConfig();
  const data = await evolutionV2Request(`/chat/whatsappNumbers/${encodeURIComponent(config.instance)}`, { method: 'POST', body: JSON.stringify({ numbers: [phone] }) }, config);
  const row = Array.isArray(data) ? data[0] : data?.numbers?.[0] || data;
  return { exists: Boolean(row?.exists ?? row?.isBusiness ?? row?.jid), raw: row };
}

async function main() {
  const phones = ['5555991318127', '5555996872259', '5555992244590', '5555999552818', '5555996303478'];
  for (const p of phones) {
    try {
      const res = await checkWhatsApp(p);
      console.log(`Phone ${p}: exists=${res.exists}, details=${JSON.stringify(res.raw)}`);
    } catch (e) {
      console.error(`Phone ${p} error:`, e.message);
    }
  }
}

main();

