import path from 'node:path';
import { mkdir, writeFile } from 'node:fs/promises';
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
  console.log('=== PREPARANDO E AGENDANDO DISPAROS PARA AMANHÃ DE MANHÃ ===');
  const targetCount = 3;
  const runKey = '2026-10-17:live';

  // 1. Obter ou criar registro da run do dia 17/10
  let runRes = await pool.query(`SELECT * FROM sales_discovery_runs WHERE run_key = $1 LIMIT 1`, [runKey]);
  let run = runRes.rows[0];
  if (!run) {
    const insertRun = await pool.query(`
      INSERT INTO sales_discovery_runs (run_key, scheduled_for, status, started_at, details)
      VALUES ($1, '2026-10-17', 'pending', NOW(), '{"scheduled_targets": "Dois Córregos / Horizontina"}'::jsonb)
      RETURNING *
    `, [runKey]);
    run = insertRun.rows[0];
  }
  const runId = run.id;
  console.log(`Run ID: ${runId} (${runKey})`);

  // 2. Buscar candidatos qualificados em sales_leads
  const candidatesRes = await pool.query(`
    SELECT * FROM sales_leads
    WHERE stage NOT IN ('awaiting_reply', 'opted_out', 'send_failed', 'human_handoff', 'scheduled')
      AND phone IS NOT NULL
      AND LENGTH(phone) >= 10
    ORDER BY created_at DESC
    LIMIT 25
  `);

  console.log(`Candidatos encontrados no banco: ${candidatesRes.rowCount}`);

  const morningSlots = [
    new Date('2026-10-17T09:30:00-03:00'),
    new Date('2026-10-17T10:15:00-03:00'),
    new Date('2026-10-17T11:00:00-03:00')
  ];

  const approved = [];

  for (const candidate of candidatesRes.rows) {
    if (approved.length >= targetCount) break;

    const phone = candidate.normalized_phone || candidate.phone;
    console.log(`\nVerificando candidato: ${candidate.business_name} (${phone}) - ${candidate.city}/${candidate.state}`);

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
      console.log(`  -> Prints gerados:`);
      console.log(`     Desktop: ${preview.desktopPath}`);
      console.log(`     Mobile:  ${preview.mobilePath}`);
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

    approved.push({
      lead: candidate,
      preview,
      provisioned
    });
  }

  console.log(`\n=== CANDIDATOS QUALIFICADOS E PREPARADOS: ${approved.length}/${targetCount} ===`);

  // 3. Agendar os disparos nos slots da manhã
  for (let i = 0; i < approved.length; i++) {
    const item = approved[i];
    const slot = morningSlots[i];
    const idempotencyKey = `${runKey}:${item.lead.id}`;
    const message = buildOutreachMessage(item.lead);

    console.log(`\nAgendando para ${slot.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}:`);
    console.log(`  Lead: ${item.lead.business_name} (${item.lead.phone})`);
    console.log(`  Cardápio: ${item.provisioned.menuUrl}`);

    await pool.query(`
      INSERT INTO sales_automation_jobs (
        lead_id, job_type, idempotency_key, run_at, payload, status
      )
      VALUES ($1, 'send_sequence', $2, $3, $4::jsonb, 'pending')
      ON CONFLICT (idempotency_key)
      DO UPDATE SET run_at = EXCLUDED.run_at, status = 'pending', payload = EXCLUDED.payload, updated_at = NOW()
    `, [
      item.lead.id,
      idempotencyKey,
      slot,
      JSON.stringify({
        runId,
        message,
        previews: item.preview,
        progress: {}
      })
    ]);

    await pool.query(`
      INSERT INTO sales_automation_events (
        lead_id, run_id, place_id, stage, event_type, attempt, result, details
      )
      VALUES ($1, $2, $3, 'scheduled', 'lead_scheduled', 0, 'success', $4::jsonb)
    `, [
      item.lead.id,
      runId,
      item.lead.google_place_id || null,
      JSON.stringify({ scheduled_at: slot.toISOString(), menu_url: item.provisioned.menuUrl })
    ]);
  }

  // 4. Atualizar o registro da run
  await pool.query(`
    UPDATE sales_discovery_runs
    SET qualified_count = $2,
        preview_count = $2,
        status = 'pending',
        updated_at = NOW()
    WHERE id = $1
  `, [runId, approved.length]);

  console.log('\n✅ TODOS OS DISPAROS FORAM PROGRAMADOS COM SUCESSO PARA AMANHÃ DE MANHÃ!');
  await pool.end();
}

main().catch(err => {
  console.error('[ERRO FATAL]', err);
  process.exit(1);
});
