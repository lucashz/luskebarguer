import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { getLocalPool } from '/app/src/lib/local-postgrest-adapter.js';
import { sendOutreachSequence } from '/app/src/lib/outreach-delivery.js';
import {
  evolutionV2SalesConfig,
  getEvolutionV2ConnectionState,
  sendEvolutionV2SalesMedia,
  sendEvolutionV2SalesText
} from '/app/src/lib/evolution-v2-sales.js';

try { process.loadEnvFile?.('.env'); } catch {}

const pool = getLocalPool();

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function ensureConversation(leadId) {
  const res = await pool.query(`
    INSERT INTO sales_conversations(lead_id)
    VALUES ($1)
    ON CONFLICT(lead_id) WHERE status = 'active'
    DO UPDATE SET updated_at = NOW()
    RETURNING *
  `, [leadId]);
  return res.rows[0];
}

async function saveOutbound(leadId, conversationId, body, providerId, kind) {
  await pool.query(`
    INSERT INTO sales_messages(lead_id, conversation_id, provider_message_id, direction, body, status, requires_approval, approved_at, sent_at, metadata)
    VALUES ($1, $2, $3, 'outbound', $4, 'sent', false, NOW(), NOW(), jsonb_build_object('kind', $5::text))
    ON CONFLICT(provider_message_id) DO NOTHING
  `, [leadId, conversationId, providerId, body, kind]);
}

async function recordEvent({ lead_id, run_id = null, place_id = null, event_type, stage = null, attempt = 1, result = 'success', details = {} }) {
  await pool.query(`
    INSERT INTO sales_automation_events(lead_id, run_id, place_id, event_type, stage, attempt, result, details, created_at)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, NOW())
  `, [lead_id, run_id, place_id, event_type, stage, attempt, result, JSON.stringify(details)]).catch((err) => {
    console.error('Erro ao gravar evento:', err.message);
  });
}

async function main() {
  console.log('=== INICIANDO DISPARO FORÇADO DOS 3 LEADS PENDENTES ===');
  console.log(`Horário: ${new Date().toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo' })}`);

  const config = evolutionV2SalesConfig();
  console.log(`Evolution API: ${config.baseUrl} | Instância: ${config.instance}`);

  const conn = await getEvolutionV2ConnectionState(config);
  console.log(`Conexão WhatsApp: ${conn.state} (conectado: ${conn.connected})`);
  if (!conn.connected) {
    throw new Error(`WhatsApp não está conectado na instância ${config.instance}`);
  }

  const jobIds = [
    '8fd1a7b2-0720-4a59-b7ec-4c0fe8516082', // Padaria e marmitaria pão quente
    'f98c9f30-db09-4119-a258-1c432085c687', // Armazém da Gula
    '54d9e03a-5843-4e89-916e-f7f135c3973f'  // Bar do Mineiro Pederneiras Sp
  ];

  const jobsRes = await pool.query(`
    SELECT j.id as job_id, j.payload, l.*
    FROM sales_automation_jobs j
    JOIN sales_leads l ON l.id = j.lead_id
    WHERE j.id = ANY($1::uuid[])
    ORDER BY j.run_at ASC
  `, [jobIds]);

  console.log(`Total de jobs encontrados: ${jobsRes.rowCount}`);

  let count = 0;
  for (const row of jobsRes.rows) {
    count += 1;
    const { job_id, payload, id: lead_id, business_name } = row;
    const phone = row.normalized_phone || row.phone;
    console.log(`\n[${count}/${jobsRes.rowCount}] DISPARANDO: ${business_name} (${phone})`);
    console.log(`Cardápio: ${row.metadata?.menu_url}`);

    const conversation = await ensureConversation(lead_id);

    try {
      const result = await sendOutreachSequence({
        lead: row,
        message: payload.message,
        previews: payload.previews,
        dependencies: {
          getConnection: async () => conn,
          getWebhookHealth: async () => ({ status: 'healthy', lastReceivedAt: new Date().toISOString() }),
          isSuppressed: async () => false,
          loadProgress: async () => payload.progress || {},
          saveStep: async (step, data) => {
            payload.progress = { ...(payload.progress || {}), [step]: data };
            await pool.query(
              `UPDATE sales_automation_jobs SET payload = $2::jsonb, updated_at = NOW() WHERE id = $1`,
              [job_id, JSON.stringify(payload)]
            );
          },
          recordEvent: async (evt) => {
            await recordEvent({
              lead_id,
              event_type: evt.event_type,
              stage: evt.stage,
              result: evt.result,
              details: evt.details
            });
          },
          recordFailure: async () => ({ consecutiveFailures: 0 }),
          readFile: async (filePath) => {
            const resolved = path.isAbsolute(filePath) ? filePath : path.resolve('/app', filePath);
            return readFile(resolved);
          },
          sendText: async ({ phone: targetPhone, text }) => {
            console.log(`  [1/3] Enviando texto introdutório...`);
            const sent = await sendEvolutionV2SalesText({ phone: targetPhone, text }, config);
            console.log(`  ✓ Texto enviado! ID: ${sent.id}`);
            await saveOutbound(lead_id, conversation.id, text, sent.id, 'outreach_text');
            return sent;
          },
          sendMedia: async ({ phone: targetPhone, media, mimeType, caption, fileName }) => {
            const isMobile = fileName.includes('mobile');
            const label = isMobile ? 'Mobile' : 'Desktop';
            console.log(`  [${isMobile ? '3/3' : '2/3'}] Enviando imagem ${label}...`);
            const sent = await sendEvolutionV2SalesMedia({ phone: targetPhone, mediaBase64: media, mimeType, caption }, config);
            console.log(`  ✓ Imagem ${label} enviada! ID: ${sent.id}`);
            await saveOutbound(lead_id, conversation.id, caption, sent.id, isMobile ? 'outreach_mobile' : 'outreach_desktop');
            return sent;
          }
        }
      });

      console.log(`  🎉 Sequência concluída com sucesso para ${business_name}!`);

      await pool.query(
        `UPDATE sales_leads
         SET stage = 'awaiting_reply',
             attempt_count = attempt_count + 1,
             last_contact_at = NOW(),
             next_followup_at = NULL,
             updated_at = NOW()
         WHERE id = $1`,
        [lead_id]
      );

      await pool.query(
        `UPDATE sales_automation_jobs
         SET status = 'completed',
             last_error = NULL,
             updated_at = NOW()
         WHERE id = $1`,
        [job_id]
      );

      if (count < jobsRes.rowCount) {
        console.log(`  Aguardando 10 segundos antes do próximo envio...`);
        await sleep(10000);
      }
    } catch (err) {
      console.error(`  ❌ Erro ao enviar para ${business_name}:`, err.message);
      await pool.query(
        `UPDATE sales_automation_jobs SET last_error = $2, updated_at = NOW() WHERE id = $1`,
        [job_id, err.message]
      );
    }
  }

  console.log('\n=== TODOS OS DISPAROS FORAM FINALIZADOS ===');
  await pool.end();
}

main().catch(console.error);
