import { readFile } from 'node:fs/promises';
import pg from 'pg';
import {
  evolutionV2SalesConfig,
  getEvolutionV2ConnectionState,
  sendEvolutionV2SalesText,
  sendEvolutionV2SalesMedia
} from '../src/lib/evolution-v2-sales.js';

try { process.loadEnvFile?.('.env'); } catch {}

const pool = new pg.Pool({
  connectionString: 'postgresql://cardapio_user:ca3b7539eb748218ad8c652ae489f7087d42360367a9470d@localhost:5433/cardapio?schema=public'
});

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function saveOutboundMessage(leadId, convId, body, providerId, kind) {
  await pool.query(`
    INSERT INTO sales_messages (
      lead_id, conversation_id, provider_message_id, direction,
      body, status, requires_approval, approved_at, sent_at, metadata, created_at
    ) VALUES (
      $1, $2, $3, 'outbound',
      $4, 'sent', false, now(), now(), jsonb_build_object('kind', $5::text), now()
    ) ON CONFLICT (provider_message_id) DO NOTHING
  `, [leadId, convId, providerId, body, kind]);
}

async function main() {
  console.log('================================================================');
  console.log('  DISPARADOR DE SEGUNDA-FEIRA: 10 MARMITARIAS                   ');
  console.log('================================================================\n');

  // 1. Checar conexão com Evolution API
  const evoConfig = evolutionV2SalesConfig();
  let state = { connected: false, state: 'unknown' };
  for (let attempt = 1; attempt <= 5; attempt++) {
    try {
      state = await getEvolutionV2ConnectionState(evoConfig);
      if (state.connected) break;
    } catch {}
    await sleep(2000);
  }
  if (!state.connected) {
    throw new Error(`Evolution API não está conectada. Estado: ${state.state}`);
  }
  console.log(`✅ WhatsApp conectado na instância "${evoConfig.instance}".\n`);

  // 2. Carregar os jobs pendentes da run de segunda-feira
  const jobsRes = await pool.query(`
    SELECT j.id AS job_id, j.lead_id, j.payload, l.phone, l.normalized_phone, l.business_name, l.city
    FROM sales_automation_jobs j
    JOIN sales_leads l ON l.id = j.lead_id
    WHERE j.job_type = 'send_sequence'
      AND j.status = 'pending'
      AND j.idempotency_key LIKE 'monday-marmitarias-2026-10-26:%'
    ORDER BY j.run_at ASC
  `);

  const jobs = jobsRes.rows;
  console.log(`Carregados ${jobs.length} disparos pendentes para executar.\n`);

  let dispatched = 0;
  for (let i = 0; i < jobs.length; i++) {
    const job = jobs[i];
    const payload = job.payload;
    const phone = payload.phone || job.phone;
    console.log(`----------------------------------------------------------------`);
    console.log(`[${i + 1}/${jobs.length}] Disparando para: ${payload.businessName} (${phone}) - ${payload.city}`);

    // Criar / obter conversa
    const convRes = await pool.query(`
      INSERT INTO sales_conversations (lead_id, status, created_at, updated_at)
      VALUES ($1, 'active', now(), now())
      ON CONFLICT (lead_id) WHERE status = 'active'
      DO UPDATE SET updated_at = now()
      RETURNING id
    `, [job.lead_id]);
    const convId = convRes.rows[0]?.id;

    // Etapa 1: Enviar mensagem principal com link
    console.log('  -> [1/3] Enviando mensagem persuasiva...');
    try {
      const textRes = await sendEvolutionV2SalesText({ phone, text: payload.message }, evoConfig);
      console.log(`  ✓ Texto enviado! Provider ID: ${textRes.id}`);
      await saveOutboundMessage(job.lead_id, convId, payload.message, textRes.id, 'outreach_text');
    } catch (err) {
      console.error(`  ❌ Erro ao enviar texto para ${payload.businessName}:`, err.message);
      await pool.query(`UPDATE sales_automation_jobs SET status = 'failed', last_error = $1 WHERE id = $2`, [err.message, job.job_id]);
      continue;
    }

    await sleep(3500);

    // Etapa 2: Print Desktop
    try {
      console.log('  -> [2/3] Enviando print de computador...');
      const deskBytes = await readFile(payload.desktopFile);
      const deskRes = await sendEvolutionV2SalesMedia({
        phone,
        mediaBase64: Buffer.from(deskBytes).toString('base64'),
        mimeType: 'image/png',
        caption: payload.desktopCaption
      }, evoConfig);
      console.log(`  ✓ Print Desktop enviado! Provider ID: ${deskRes.id}`);
      await saveOutboundMessage(job.lead_id, convId, payload.desktopCaption, deskRes.id, 'outreach_desktop');
    } catch (err) {
      console.warn(`  ⚠️ Aviso no print desktop:`, err.message);
    }

    await sleep(3500);

    // Etapa 3: Print Mobile
    try {
      console.log('  -> [3/3] Enviando print de celular...');
      const mobBytes = await readFile(payload.mobileFile);
      const mobRes = await sendEvolutionV2SalesMedia({
        phone,
        mediaBase64: Buffer.from(mobBytes).toString('base64'),
        mimeType: 'image/png',
        caption: payload.mobileCaption
      }, evoConfig);
      console.log(`  ✓ Print Mobile enviado! Provider ID: ${mobRes.id}`);
      await saveOutboundMessage(job.lead_id, convId, payload.mobileCaption, mobRes.id, 'outreach_mobile');
    } catch (err) {
      console.warn(`  ⚠️ Aviso no print mobile:`, err.message);
    }

    // Atualizar status do job e do lead
    await pool.query(`UPDATE sales_automation_jobs SET status = 'completed', updated_at = now() WHERE id = $1`, [job.job_id]);
    await pool.query(`
      UPDATE sales_leads
      SET stage = 'first_message_sent',
          attempt_count = 1,
          last_contact_at = now(),
          updated_at = now()
      WHERE id = $1
    `, [job.lead_id]);

    dispatched++;
    console.log(`  🎉 ${payload.businessName} disparado com sucesso!`);

    if (i < jobs.length - 1) {
      console.log('  ⏳ Aguardando pausa de 10 segundos antes do próximo lead...');
      await sleep(10000);
    }
  }

  console.log('\n================================================================');
  console.log(`🏁 DISPAROS CONCLUÍDOS COM SUCESSO: ${dispatched} DE ${jobs.length} ENVIADOS!`);
  console.log('================================================================\n');

  await pool.end();
}

main().catch(console.error);

