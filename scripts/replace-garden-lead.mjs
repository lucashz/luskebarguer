import path from 'node:path';
import { mkdir } from 'node:fs/promises';
import { getLocalPool } from '../src/lib/local-postgrest-adapter.js';
import { provisionOutreachStore } from '../src/lib/outreach-store-provisioning.js';
import { buildOutreachPreview } from '../src/lib/outreach-preview.js';
import { buildOutreachMessage } from '../src/lib/outreach-message.js';
import { deleteOutreachMenuForLead } from '../src/lib/outreach-menu-lifecycle.js';
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
  console.log('=== REMOVENDO GARDEN E SUBSTITUINDO NA GRADE DE 15 LEADS ===');
  const runKey = '2026-10-17:live';

  const runRes = await pool.query(`SELECT * FROM sales_discovery_runs WHERE run_key = $1 LIMIT 1`, [runKey]);
  if (!runRes.rows[0]) throw new Error(`Run ${runKey} não encontrada.`);
  const run = runRes.rows[0];
  const runId = run.id;

  // 1. Localizar o lead do Garden
  const gardenLeadRes = await pool.query(`SELECT * FROM sales_leads WHERE business_name ILIKE '%Garden%' LIMIT 1`);
  const gardenLead = gardenLeadRes.rows[0];

  if (gardenLead) {
    console.log(`Lead Garden localizado: ${gardenLead.business_name} (ID: ${gardenLead.id})`);

    // A. Remover job agendado de Garden
    const deletedJob = await pool.query(`
      DELETE FROM sales_automation_jobs
      WHERE lead_id = $1 AND job_type = 'send_sequence'
      RETURNING *
    `, [gardenLead.id]);
    console.log(`  -> Job removido da fila: ${deletedJob.rowCount} registro(s).`);

    // B. Excluir cardápio criado no TáPronto
    try {
      await deleteOutreachMenuForLead({ leadId: gardenLead.id, pool, reason: 'user_reported_already_has_menu' });
      console.log(`  -> Cardápio do Garden excluído com sucesso do banco de dados.`);
    } catch (err) {
      console.warn(`  -> Aviso ao excluir cardápio:`, err.message);
    }

    // C. Atualizar status do lead para descartado (já tem cardápio)
    await pool.query(`
      UPDATE sales_leads
      SET stage = 'discarded',
          discard_code = 'online_menu',
          automation_status = 'paused',
          stop_reason = 'Estabelecimento já possui cardápio online (informado pelo usuário)',
          metadata = jsonb_set(
            jsonb_set(coalesce(metadata, '{}'::jsonb), '{menu_status}', '"deleted"'),
            '{discard_reason}', '"already_has_menu"'
          ),
          updated_at = NOW()
      WHERE id = $1
    `, [gardenLead.id]);

    await pool.query(`
      INSERT INTO sales_automation_events (
        lead_id, run_id, place_id, stage, event_type, attempt, result, details
      )
      VALUES ($1, $2, $3, 'discarded', 'lead_discarded', 0, 'success', '{"reason": "user_reported_already_has_menu"}'::jsonb)
    `, [gardenLead.id, runId, gardenLead.google_place_id]);

    console.log(`  -> Lead Garden marcado como descartado ('online_menu').`);
  } else {
    console.log(`Garden não encontrado no banco.`);
  }

  // 2. Definir o slot de substituição (14:40)
  const replacementSlot = new Date('2026-10-17T14:40:00-03:00');
  console.log(`\nBuscando novo candidato para ocupar o horário de 14:40...`);

  // 3. Buscar candidatos disponíveis
  const candidatesRes = await pool.query(`
    SELECT * FROM sales_leads
    WHERE stage = 'discovered'
      AND phone IS NOT NULL
      AND LENGTH(phone) >= 10
      AND id != $1
    ORDER BY created_at DESC
    LIMIT 40
  `, [gardenLead?.id || '00000000-0000-0000-0000-000000000000']);

  console.log(`Candidatos disponíveis para avaliação: ${candidatesRes.rowCount}`);

  let replacement = null;

  for (const candidate of candidatesRes.rows) {
    const phone = candidate.normalized_phone || candidate.phone;
    console.log(`Avaliando candidato: ${candidate.business_name} (${phone}) - ${candidate.city}/${candidate.state}`);

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

    const idempotencyKey = `${runKey}:${candidate.id}`;
    const message = buildOutreachMessage(candidate);

    console.log(`  -> Agendando disparo para ${replacementSlot.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}`);

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
      replacementSlot,
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
      JSON.stringify({ scheduled_at: replacementSlot.toISOString(), menu_url: provisioned.menuUrl })
    ]);

    replacement = {
      lead: candidate,
      slot: replacementSlot,
      menuUrl: provisioned.menuUrl
    };
    break;
  }

  if (replacement) {
    console.log(`\n======================================================`);
    console.log(`✅ SUBSTITUIÇÃO CONCLUÍDA COM SUCESSO!`);
    console.log(`Novo Lead Agendado para 14:40: ${replacement.lead.business_name} (${replacement.lead.phone})`);
    console.log(`Cardápio Criado: ${replacement.menuUrl}`);
    console.log(`======================================================`);
  } else {
    console.log(`\n⚠️ Não foi encontrado nenhum outro candidato qualificado com WhatsApp nos candidatos atuais.`);
  }

  await pool.end();
}

main().catch(err => {
  console.error('[ERRO FATAL]', err);
  process.exit(1);
});

