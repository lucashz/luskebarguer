import { readFile } from 'node:fs/promises';
import { basename } from 'node:path';
import { getLocalPool } from '../src/lib/local-postgrest-adapter.js';
import { sendEvolutionV2SalesText, sendEvolutionV2SalesMedia, evolutionV2SalesConfig, getEvolutionV2ConnectionState } from '../src/lib/evolution-v2-sales.js';

try { process.loadEnvFile?.('.env'); } catch {}

const pool = getLocalPool();

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
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

async function saveOutbound(leadId, conversationId, body, providerMessageId, kind) {
  await pool.query(`
    INSERT INTO sales_messages(lead_id, conversation_id, provider_message_id, direction, body, status, requires_approval, approved_at, sent_at, metadata)
    VALUES ($1, $2, $3, 'outbound', $4, 'sent', false, NOW(), NOW(), jsonb_build_object('kind', $5::text))
    ON CONFLICT (provider_message_id) DO NOTHING
  `, [leadId, conversationId, providerMessageId, body, kind]);
}

async function main() {
  console.log('=== DISPARO DO LOTE NOTURNO (9 LEADS AGENDADOS) ===');
  console.log(`Horário de início: ${new Date().toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo' })}`);

  const config = evolutionV2SalesConfig();
  console.log(`Evolution API: ${config.baseUrl} | Instância: ${config.instance}`);

  const conn = await getEvolutionV2ConnectionState(config);
  console.log(`Status da Conexão WhatsApp: ${conn.state} (conectado: ${conn.connected})`);
  if (!conn.connected) {
    throw new Error(`Instância ${config.instance} não está conectada no WhatsApp.`);
  }

  // Buscar os 9 jobs de send_sequence pendentes
  const jobsRes = await pool.query(`
    SELECT
      j.id as job_id,
      j.lead_id,
      j.payload,
      l.business_name,
      l.phone,
      l.normalized_phone,
      l.city,
      l.state,
      l.metadata->>'menu_url' as menu_url
    FROM sales_automation_jobs j
    JOIN sales_leads l ON l.id = j.lead_id
    WHERE j.job_type = 'send_sequence'
      AND j.status IN ('pending', 'retry')
    ORDER BY j.run_at ASC
  `);

  console.log(`\nEncontrados ${jobsRes.rowCount} leads pendentes para envio.`);
  if (jobsRes.rowCount === 0) {
    console.log('Nenhum lead pendente para envio.');
    return;
  }

  let index = 0;
  for (const row of jobsRes.rows) {
    index += 1;
    const { job_id, lead_id, payload, business_name, menu_url } = row;
    const phone = row.normalized_phone || row.phone;
    const runId = payload?.runId || '2026-10-17:live';
    const message = payload?.message;
    const previews = payload?.previews;

    console.log(`\n------------------------------------------------------------`);
    console.log(`[${index}/${jobsRes.rowCount}] DISPARANDO: ${business_name} (${phone})`);
    console.log(`Cardápio: ${menu_url}`);
    console.log(`Desktop: ${previews?.desktopPath}`);
    console.log(`Mobile:  ${previews?.mobilePath}`);

    const conversation = await ensureConversation(lead_id);

    try {
      // 1. Enviar Mensagem de Texto
      console.log(`  [1/3] Enviando mensagem de texto introdutória...`);
      const sentText = await sendEvolutionV2SalesText({ phone, text: message }, config);
      console.log(`  ✓ Texto entregue! ID: ${sentText.id}`);
      await saveOutbound(lead_id, conversation.id, message, sentText.id, 'outreach_text');

      await sleep(3500); // pausa humana entre mensagens

      // 2. Enviar Print Desktop
      console.log(`  [2/3] Carregando e enviando print Desktop...`);
      const desktopBytes = await readFile(previews.desktopPath);
      const desktopCaption = `Assim ficaria o cardápio de vocês no computador. Para ver e navegar no cardápio completo: ${menu_url}`;
      const sentDesktop = await sendEvolutionV2SalesMedia({
        phone,
        mediaBase64: desktopBytes.toString('base64'),
        mimeType: 'image/png',
        caption: desktopCaption
      }, config);
      console.log(`  ✓ Print Desktop entregue! ID: ${sentDesktop.id}`);
      await saveOutbound(lead_id, conversation.id, desktopCaption, sentDesktop.id, 'outreach_desktop');

      await sleep(3500); // pausa humana entre mensagens

      // 3. Enviar Print Mobile
      console.log(`  [3/3] Carregando e enviando print Mobile...`);
      const mobileBytes = await readFile(previews.mobilePath);
      const mobileCaption = `E esta é a visualização rápida no celular, direto para o cliente fazer pedidos pelo WhatsApp. Cardápio completo: ${menu_url}`;
      const sentMobile = await sendEvolutionV2SalesMedia({
        phone,
        mediaBase64: mobileBytes.toString('base64'),
        mimeType: 'image/png',
        caption: mobileCaption
      }, config);
      console.log(`  ✓ Print Mobile entregue! ID: ${sentMobile.id}`);
      await saveOutbound(lead_id, conversation.id, mobileCaption, sentMobile.id, 'outreach_mobile');

      // 4. Atualizar Lead para awaiting_reply e registrar last_contact_at
      await pool.query(`
        UPDATE sales_leads
        SET stage = 'awaiting_reply',
            attempt_count = attempt_count + 1,
            last_contact_at = NOW(),
            next_followup_at = NULL,
            updated_at = NOW()
        WHERE id = $1
      `, [lead_id]);

      // 5. Finalizar Job
      await pool.query(`
        UPDATE sales_automation_jobs
        SET status = 'completed',
            payload = payload || jsonb_build_object('progress', jsonb_build_object(
              'text', jsonb_build_object('providerMessageId', $2::text, 'at', NOW()),
              'desktop', jsonb_build_object('providerMessageId', $3::text, 'at', NOW()),
              'mobile', jsonb_build_object('providerMessageId', $4::text, 'at', NOW()),
              'completed', jsonb_build_object('at', NOW())
            )),
            updated_at = NOW()
        WHERE id = $1
      `, [job_id, sentText.id, sentDesktop.id, sentMobile.id]);

      // 6. Incrementar contador da run
      await pool.query(`UPDATE sales_discovery_runs SET sent_count = sent_count + 1, updated_at = NOW() WHERE id = $1`, [runId]);

      // 7. Gravar evento de auditoria
      await pool.query(`
        INSERT INTO sales_automation_events (lead_id, event_type, stage, result, details, created_at)
        VALUES ($1, 'outreach_completed', 'awaiting_reply', 'success', $2::jsonb, NOW())
      `, [
        lead_id,
        JSON.stringify({
          menu_url,
          phone,
          provider_messages: {
            text: sentText.id,
            desktop: sentDesktop.id,
            mobile: sentMobile.id
          }
        })
      ]);

      console.log(`  ✅ DISPARO CONCLUÍDO COM SUCESSO: ${business_name}`);
      console.log(`  Contagem regressiva de 15h iniciada em last_contact_at = NOW()`);

      if (index < jobsRes.rowCount) {
        console.log(`  ⏳ Aguardando 20 segundos antes do próximo lead (proteção anti-spam)...`);
        await sleep(20000);
      }
    } catch (err) {
      console.error(`  ❌ ERRO AO DISPARAR ${business_name}:`, err.message);
      await pool.query(`UPDATE sales_automation_jobs SET status = 'retry', last_error = $2, updated_at = NOW() WHERE id = $1`, [job_id, err.message]);
      console.log(`  ⏳ Aguardando 10 segundos antes de prosseguir...`);
      await sleep(10000);
    }
  }

  console.log('\n============================================================');
  console.log(`✅ LOTE FINALIZADO COM SUCESSO!`);
  console.log(`Horário de término: ${new Date().toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo' })}`);
  console.log('============================================================');
}

main()
  .catch(console.error)
  .finally(async () => {
    await pool.end().catch(() => {});
  });

