import { evolutionV2Request } from '../src/lib/evolution-v2-sales.js';
import pg from 'pg';
import dotenv from 'dotenv';
dotenv.config();

async function run() {
  console.log('--- SYNCING MISSED INBOUND MESSAGES FROM EVOLUTION API ---');
  const pool = new pg.Pool({
    connectionString: process.env.DATABASE_URL || 'postgres://postgres:postgres@127.0.0.1:5433/cardapio'
  });

  const leadsRes = await pool.query(`SELECT id, business_name, normalized_phone, stage, metadata FROM sales_leads WHERE normalized_phone IS NOT NULL`);
  const leadsMap = new Map();
  for (const l of leadsRes.rows) {
    leadsMap.set(l.normalized_phone, l);
  }

  const chats = await evolutionV2Request('/chat/findChats/tapronto', {
    method: 'POST',
    body: JSON.stringify({})
  });

  const individualChats = chats.filter(c => c.remoteJid && !c.remoteJid.includes('@g.us'));
  console.log(`Checking ${individualChats.length} individual chats in Evolution API...`);

  let syncedMessages = 0;
  const synchronizedLeads = [];

  for (const c of individualChats) {
    let phone = '';
    if (c.remoteJid.endsWith('@s.whatsapp.net')) {
      phone = c.remoteJid.split('@')[0];
    } else if (c.lastMessage?.key?.remoteJidAlt && c.lastMessage.key.remoteJidAlt.endsWith('@s.whatsapp.net')) {
      phone = c.lastMessage.key.remoteJidAlt.split('@')[0];
    }

    const lead = leadsMap.get(phone);
    if (!lead) continue;

    try {
      const msgData = await evolutionV2Request('/chat/findMessages/tapronto', {
        method: 'POST',
        body: JSON.stringify({
          where: { key: { remoteJid: c.remoteJid } },
          limit: 20
        })
      });

      const records = msgData?.messages?.records || msgData?.records || (Array.isArray(msgData) ? msgData : []);
      const inbounds = records.filter(m => m.key?.fromMe === false);

      if (inbounds.length === 0) continue;

      // Find or create conversation
      let convRes = await pool.query(`SELECT id FROM sales_conversations WHERE lead_id = $1 AND status = 'active' LIMIT 1`, [lead.id]);
      let convId;
      if (convRes.rows.length > 0) {
        convId = convRes.rows[0].id;
      } else {
        const createConv = await pool.query(
          `INSERT INTO sales_conversations (lead_id, status, created_at, updated_at) VALUES ($1, 'active', NOW(), NOW()) RETURNING id`,
          [lead.id]
        );
        convId = createConv.rows[0].id;
      }

      let leadUpdated = false;
      const leadMsgs = [];

      for (const m of inbounds) {
        const msgId = m.key?.id;
        const msgBody = m.message?.conversation || m.message?.extendedTextMessage?.text || (m.message ? JSON.stringify(m.message) : '[mídia]');
        const receivedAt = m.messageTimestamp ? new Date(m.messageTimestamp * 1000) : new Date();

        // Check if message already exists
        const existsRes = await pool.query(`SELECT id FROM sales_messages WHERE provider_message_id = $1 LIMIT 1`, [msgId]);
        if (existsRes.rows.length === 0) {
          // Classify intent
          const lower = msgBody.toLowerCase();
          let intent = 'general_inquiry';
          if (/\b(n[aã]o tenho interesse|n[aã]o obrigado|dispenso|sem interesse|n[aã]o quero)\b/i.test(lower)) {
            intent = 'opt_out';
          } else if (/\b(respons[aá]vel|dono|gerente|vou passar|passar pro)\b/i.test(lower)) {
            intent = 'interested';
          } else if (/\b(card[aá]pio|site|delivery|link)\b/i.test(lower)) {
            intent = 'competitor_or_menu';
          }

          await pool.query(`
            INSERT INTO sales_messages (
              lead_id, conversation_id, provider_message_id, direction, body, status, requires_approval, received_at, intent, metadata
            ) VALUES (
              $1, $2, $3, 'inbound', $4, 'received', false, $5, $6, $7
            )
          `, [lead.id, convId, msgId, msgBody, receivedAt, intent, JSON.stringify({ remoteJid: c.remoteJid, raw: m.message })]);

          syncedMessages++;
          leadUpdated = true;
          leadMsgs.push(msgBody);

          // Update lead stage
          if (intent === 'opt_out') {
            await pool.query(`UPDATE sales_leads SET stage = 'lost', updated_at = NOW() WHERE id = $1`, [lead.id]);
          } else if (['awaiting_reply', 'contacted', 'discovered'].includes(lead.stage)) {
            await pool.query(`UPDATE sales_leads SET stage = 'engaged', updated_at = NOW() WHERE id = $1`, [lead.id]);
          }
        }
      }

      if (leadUpdated) {
        synchronizedLeads.push({
          businessName: lead.business_name,
          phone: lead.normalized_phone,
          messages: leadMsgs
        });
      }
    } catch (err) {
      console.error(`Error syncing chat ${c.remoteJid}:`, err.message);
    }
  }

  console.log(`\nSynchronization complete!`);
  console.log(`Total new inbound messages saved: ${syncedMessages}`);
  console.log(`Total leads updated: ${synchronizedLeads.length}`);
  console.log(JSON.stringify(synchronizedLeads, null, 2));

  await pool.end();
}

run();
