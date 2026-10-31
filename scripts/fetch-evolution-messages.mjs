import { evolutionV2Request } from '../src/lib/evolution-v2-sales.js';
import pg from 'pg';
import dotenv from 'dotenv';
dotenv.config();

async function run() {
  const pool = new pg.Pool({
    connectionString: process.env.DATABASE_URL || 'postgres://postgres:postgres@127.0.0.1:5433/cardapio'
  });

  // Get leads contacted today
  const leadsRes = await pool.query(`
    SELECT id, business_name, phone, normalized_phone, stage
    FROM sales_leads
    WHERE normalized_phone IS NOT NULL
    ORDER BY updated_at DESC
    LIMIT 100;
  `);

  console.log(`Checking messages in Evolution API for ${leadsRes.rows.length} leads...`);

  const repliesFound = [];

  for (const lead of leadsRes.rows) {
    const remoteJid = `${lead.normalized_phone}@s.whatsapp.net`;
    try {
      // Find messages for this remoteJid
      const data = await evolutionV2Request(`/chat/findMessages/tapronto`, {
        method: 'POST',
        body: JSON.stringify({
          where: {
            key: {
              remoteJid: remoteJid
            }
          },
          limit: 10
        })
      });

      const records = data?.messages?.records || data?.records || (Array.isArray(data) ? data : []);
      // Check if there are messages from the lead (fromMe === false)
      const inboundMsgs = records.filter(m => m.key?.fromMe === false);
      if (inboundMsgs.length > 0) {
        repliesFound.push({
          lead: lead.business_name,
          phone: lead.normalized_phone,
          stage: lead.stage,
          inboundCount: inboundMsgs.length,
          messages: inboundMsgs.map(m => ({
            id: m.key?.id,
            timestamp: m.messageTimestamp,
            conversation: m.message?.conversation || m.message?.extendedTextMessage?.text || JSON.stringify(m.message)
          }))
        });
      }
    } catch (err) {
      // Ignore or log error
    }
  }

  console.log('\n=== REPLIES FOUND IN WHATSAPP ===');
  console.log(JSON.stringify(repliesFound, null, 2));

  await pool.end();
}

run();
