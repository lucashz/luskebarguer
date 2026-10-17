import path from 'node:path';
import { mkdir } from 'node:fs/promises';
import { getLocalPool } from '../src/lib/local-postgrest-adapter.js';
import { provisionOutreachStore } from '../src/lib/outreach-store-provisioning.js';
import { buildOutreachPreview } from '../src/lib/outreach-preview.js';
import { buildOutreachMessage } from '../src/lib/outreach-message.js';
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
  console.log('=== PROGRAMANDO A META COMPLETA DE 15 LEADS PARA HOJE (17/10) ===');
  const totalGoal = 15;
  const runKey = '2026-10-17:live';

  // 1. Obter registro da run
  const runRes = await pool.query(`SELECT * FROM sales_discovery_runs WHERE run_key = $1 LIMIT 1`, [runKey]);
  if (!runRes.rows[0]) throw new Error(`Run ${runKey} não encontrada.`);
  const run = runRes.rows[0];
  const runId = run.id;

  // 2. Checar quantos já estão agendados
  const existingJobs = await pool.query(`
    SELECT j.*, l.business_name
    FROM sales_automation_jobs j
    JOIN sales_leads l ON l.id = j.lead_id
    WHERE j.job_type = 'send_sequence'
      AND (j.payload->>'runId') = $1
    ORDER BY j.run_at ASC
  `, [runId]);

  console.log(`Leads já agendados para hoje: ${existingJobs.rowCount}`);
  for (const job of existingJobs.rows) {
    const timeStr = new Date(job.run_at).toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit' });
    console.log(`  - ${timeStr}: ${job.business_name} (${job.status})`);
  }

  const remainingToSchedule = totalGoal - existingJobs.rowCount;
  if (remainingToSchedule <= 0) {
    console.log(`\nMeta de ${totalGoal} leads já atingida para hoje!`);
    await pool.end();
    return;
  }

  console.log(`\nFaltam ${remainingToSchedule} leads para completar a meta de ${totalGoal}.`);

  // Slots para os 12 novos leads (distribuídos entre manhã e tarde)
  const additionalSlots = [
    // Manhã (3 slots)
    new Date('2026-10-17T09:50:00-03:00'),
    new Date('2026-10-17T10:35:00-03:00'),
    new Date('2026-10-17T11:20:00-03:00'),
    // Tarde (9 slots)
    new Date('2026-10-17T14:00:00-03:00'),
    new Date('2026-10-17T14:20:00-03:00'),
    new Date('2026-10-17T14:40:00-03:00'),
    new Date('2026-10-17T15:00:00-03:00'),
    new Date('2026-10-17T15:20:00-03:00'),
    new Date('2026-10-17T15:45:00-03:00'),
    new Date('2026-10-17T16:10:00-03:00'),
    new Date('2026-10-17T16:35:00-03:00'),
    new Date('2026-10-17T17:00:00-03:00')
  ];

  // 3. Buscar candidatos qualificados
  const candidatesRes = await pool.query(`
    SELECT * FROM sales_leads
    WHERE stage NOT IN ('awaiting_reply', 'opted_out', 'send_failed', 'human_handoff', 'scheduled')
      AND phone IS NOT NULL
      AND LENGTH(phone) >= 10
    ORDER BY created_at DESC
    LIMIT 60
  `);

  console.log(`Candidatos disponíveis no banco: ${candidatesRes.rowCount}`);

  const approved = [];
  let slotIndex = 0;

  for (const candidate of candidatesRes.rows) {
    if (approved.length >= remainingToSchedule) break;

    const phone = candidate.normalized_phone || candidate.phone;
    console.log(`\n[${approved.length + 1}/${remainingToSchedule}] Avaliando: ${candidate.business_name} (${phone}) - ${candidate.city}/${candidate.state}`);

    // Verificar se número existe no WhatsApp
    const isWa = await checkWhatsApp(phone);
    if (!isWa) {
      console.log(`  -> WhatsApp NÃO confirmado. Pulando.`);
      continue;
    }
    console.log(`  -> WhatsApp CONFIRMADO!`);

    // Provisionar loja real TáPronto
    console.log(`  -> Provisionando cardápio real no TáPronto...`);
    let provisioned;
    try {
      provisioned = await provisionOutreachStore({
        lead: candidate,
        pool,
        baseUrl: process.env.APP_BASE_URL || 'https://taprontomenu.com.br'
      });
      console.log(`  -> Loja criada com sucesso: ${provisioned.menuUrl} (ID: ${provisioned.storeId})`);
    } catch (err) {
      console.error(`  -> Erro ao provisionar loja:`, err.message);
      continue;
    }

    candidate.metadata = {
      ...(candidate.metadata || {}),
      store_id: provisioned.storeId,
      menu_slug: provisioned.slug,
      menu_url: provisioned.menuUrl,
      continuity_confirmed: false,
      menu_status: 'active'
    };

    // Gerar prints reais via Chromium headless
    console.log(`  -> Capturando prints reais via Chromium Headless...`);
    const outputDir = path.resolve(
      process.env.OUTREACH_ARTIFACT_DIR || 'artifacts/outreach/automated',
      runId,
      `${provisioned.slug}-${candidate.id.slice(0, 8)}`
    );
    await mkdir(outputDir, { recursive: true });

    let preview;
    try {
      preview = await buildOutreachPreview({
        lead: candidate,
        photos: [],
        outputDir,
        chromePath: process.env.CHROME_PATH || '/usr/bin/chromium'
      });
      console.log(`  -> Prints gerados com sucesso!`);
    } catch (err) {
      console.error(`  -> Erro ao gerar prints:`, err.message);
      continue;
    }

    // Atualizar o lead
    await pool.query(`
      UPDATE sales_leads
      SET preview_desktop_path = $2,
          preview_mobile_path = $3,
          stage = 'scheduled',
          last_validated_at = NOW(),
          metadata = $4::jsonb,
          updated_at = NOW()
      WHERE id = $1
    `, [candidate.id, preview.desktopPath, preview.mobilePath, JSON.stringify(candidate.metadata)]);

    const slot = additionalSlots[slotIndex];
    slotIndex++;
    const idempotencyKey = `${runKey}:${candidate.id}`;
    const message = buildOutreachMessage(candidate);

    console.log(`  -> Agendando disparo para ${slot.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}`);

    await pool.query(`
      INSERT INTO sales_automation_jobs (
        lead_id, job_type, idempotency_key, run_at, payload, status
      )
      VALUES ($1, 'send_sequence', $2, $3, $4::jsonb, 'pending')
      ON CONFLICT (idempotency_key)
      DO UPDATE SET run_at = EXCLUDED.run_at, status = 'pending', payload = EXCLUDED.payload, updated_at = NOW()
    `, [
      candidate.id,
      idempotencyKey,
      slot,
      JSON.stringify({
        runId,
        message,
        previews: preview,
        progress: {}
      })
    ]);

    await pool.query(`
      INSERT INTO sales_automation_events (
        lead_id, run_id, place_id, stage, event_type, attempt, result, details
      )
      VALUES ($1, $2, $3, 'scheduled', 'lead_scheduled', 0, 'success', $4::jsonb)
    `, [
      candidate.id,
      runId,
      candidate.google_place_id || null,
      JSON.stringify({ scheduled_at: slot.toISOString(), menu_url: provisioned.menuUrl })
    ]);

    approved.push({
      lead: candidate,
      slot,
      menuUrl: provisioned.menuUrl
    });
  }

  // Atualizar a run com total
  const finalTotal = existingJobs.rowCount + approved.length;
  await pool.query(`
    UPDATE sales_discovery_runs
    SET qualified_count = $2,
        preview_count = $2,
        status = 'pending',
        updated_at = NOW()
    WHERE id = $1
  `, [runId, finalTotal]);

  console.log(`\n======================================================`);
  console.log(`✅ META CONCLUÍDA! TOTAL DE LEADS AGENDADOS PARA HOJE: ${finalTotal}`);
  console.log(`======================================================`);

  await pool.end();
}

main().catch(err => {
  console.error('[ERRO FATAL]', err);
  process.exit(1);
});
