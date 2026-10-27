import pg from 'pg';
import { evolutionV2SalesConfig, evolutionV2Request } from '../src/lib/evolution-v2-sales.js';

try { process.loadEnvFile?.('.env'); } catch {}

const pool = new pg.Pool({
  connectionString: 'postgresql://cardapio_user:ca3b7539eb748218ad8c652ae489f7087d42360367a9470d@localhost:5433/cardapio?schema=public'
});

async function main() {
  const cfg = evolutionV2SalesConfig();
  const res = await evolutionV2Request(`/chat/findMessages/${cfg.instance}`, {
    method: 'POST',
    body: JSON.stringify({ where: {}, limit: 5 })
  }, cfg);

  const messages = res?.messages?.records || [];
  console.log(`Mensagens recentes na Evolution: ${messages.length}`);

  for (const m of messages) {
    const fromMe = m.key?.fromMe;
    if (fromMe) continue;

    const phoneAlt = m.key?.remoteJidAlt ? m.key.remoteJidAlt.replace('@s.whatsapp.net', '') : null;
    const jid = m.key?.remoteJid;
    const phone = phoneAlt || (jid?.includes('@s.whatsapp.net') ? jid.replace('@s.whatsapp.net', '') : null);

    console.log(`Mensagem de: ${m.pushName} (${phone || jid}) | Tipo: ${m.messageType}`);

    // Achar lead correspondente
    if (phone) {
      const leadRes = await pool.query(`SELECT id FROM sales_leads WHERE phone = $1 OR normalized_phone = $1`, [phone]);
      if (leadRes.rows.length > 0) {
        const leadId = leadRes.rows[0].id;
        const convRes = await pool.query(`SELECT id FROM sales_conversations WHERE lead_id = $1 AND status = 'active'`, [leadId]);
        const convId = convRes.rows[0]?.id;

        const bodyText = m.messageType === 'documentMessage' 
          ? `[documento/PDF: ${m.message?.documentMessage?.fileName || 'cardápio'}]` 
          : (m.message?.conversation || m.message?.extendedTextMessage?.text || `[${m.messageType}]`);

        console.log(`  -> Vinculando ao Lead: ${leadId} | Conv: ${convId}`);
        console.log(`  -> Conteúdo: "${bodyText}"`);

        await pool.query(`
          INSERT INTO sales_messages (
            lead_id, conversation_id, provider_message_id, direction,
            body, status, requires_approval, sent_at, metadata, created_at
          ) VALUES (
            $1, $2, $3, 'inbound',
            $4, 'received', false, now(),
            jsonb_build_object('pushName', $5::text, 'messageType', $6::text, 'raw', $7::jsonb),
            now()
          ) ON CONFLICT (provider_message_id) DO NOTHING
        `, [leadId, convId, m.key.id, bodyText, m.pushName, m.messageType, JSON.stringify(m)]);

        await pool.query(`
          UPDATE sales_leads
          SET stage = 'engaged',
              updated_at = now()
          WHERE id = $1
        `, [leadId]);

        console.log(`  ✓ Gravado em sales_messages com sucesso!`);
      }
    }
  }

  await pool.end();
}

main().catch(console.error);
