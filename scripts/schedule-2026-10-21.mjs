import path from 'node:path';
import { mkdir } from 'node:fs/promises';
import { execSync } from 'node:child_process';
import { getLocalPool } from '../src/lib/local-postgrest-adapter.js';
import { buildOutreachPreview } from '../src/lib/outreach-preview.js';
import { buildOutreachMessage } from '../src/lib/outreach-message.js';
import { syncLeadToAssistedRegistration } from '../src/lib/outreach-menu-lifecycle.js';
import { provisionOutreachStore } from '../src/lib/outreach-store-provisioning.js';
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
  console.log('================================================================');
  console.log('  AGENDAMENTO DA GRADE DE 15 LEADS PARA 21/10/2026 (QUARTA-FEIRA) ');
  console.log('================================================================\n');

  const runKey = '2026-10-21:live';
  const targetDateStr = '2026-10-21';

  // 1. Obter ou criar registro da run do dia 21/10
  let runRes = await pool.query(`SELECT * FROM sales_discovery_runs WHERE run_key = $1 LIMIT 1`, [runKey]);
  let run = runRes.rows[0];
  if (!run) {
    const insertRun = await pool.query(`
      INSERT INTO sales_discovery_runs (run_key, scheduled_for, status, started_at, details)
      VALUES ($1, $2, 'pending', NOW(), $3::jsonb)
      RETURNING *
    `, [
      runKey,
      targetDateStr,
      JSON.stringify({ scheduled_targets: 'Braço do Norte / Assis Chateaubriand / Tenente Portela / Maravilha / Lagoa Vermelha / Pomerode / Dois Córregos' })
    ]);
    run = insertRun.rows[0];
  }
  const runId = run.id;
  console.log(`✓ Run ID: ${runId} (${runKey})\n`);

  // 2. Grade de 15 slots para a tarde de 21/10 (14:15 até 17:05 BRT)
  const slots = [
    new Date('2026-10-21T14:15:00-03:00'),
    new Date('2026-10-21T14:27:00-03:00'),
    new Date('2026-10-21T14:39:00-03:00'),
    new Date('2026-10-21T14:51:00-03:00'),
    new Date('2026-10-21T15:03:00-03:00'),
    new Date('2026-10-21T15:15:00-03:00'),
    new Date('2026-10-21T15:27:00-03:00'),
    new Date('2026-10-21T15:39:00-03:00'),
    new Date('2026-10-21T15:51:00-03:00'),
    new Date('2026-10-21T16:03:00-03:00'),
    new Date('2026-10-21T16:15:00-03:00'),
    new Date('2026-10-21T16:27:00-03:00'),
    new Date('2026-10-21T16:39:00-03:00'),
    new Date('2026-10-21T16:51:00-03:00'),
    new Date('2026-10-21T17:05:00-03:00')
  ];

  // 3. Selecionar os 15 leads qualificados
  const localExcludedCities = [
    'Horizontina', 'Três de Maio', 'Santa Rosa', 'Tucunduva', 
    'Crissiumal', 'Santo Ângelo', 'Ijuí', 'Doutor Maurício Cardoso'
  ];

  const leadsCandidateRes = await pool.query(`
    SELECT l.id, l.business_name, l.phone, l.normalized_phone, l.city, l.state, l.segment, 
           l.stage, l.metadata, l.google_place_id
    FROM sales_leads l
    WHERE l.last_contact_at IS NULL
      AND l.attempt_count = 0
      AND l.phone IS NOT NULL
      AND l.phone ~ '^55[0-9]{2}9[0-9]{8}$'
      AND l.city NOT IN (${localExcludedCities.map((_, i) => `$${i + 1}`).join(', ')})
      AND NOT EXISTS (
        SELECT 1 FROM sales_automation_jobs j 
        WHERE j.lead_id = l.id AND j.status != 'cancelled'
          AND j.idempotency_key NOT LIKE '2026-10-21:live:%'
      )
      AND NOT EXISTS (
        SELECT 1 FROM sales_suppressions s 
        WHERE s.normalized_phone = l.normalized_phone
      )
    ORDER BY (
      SELECT j.run_at FROM sales_automation_jobs j WHERE j.lead_id = l.id AND j.idempotency_key LIKE '2026-10-21:live:%'
    ) ASC NULLS LAST, (l.metadata->>'menu_url') IS NOT NULL DESC, l.created_at ASC
  `, localExcludedCities);

  const selectedLeads = [];
  for (const lead of leadsCandidateRes.rows) {
    const isWa = await checkWhatsApp(lead.phone);
    if (isWa) {
      selectedLeads.push(lead);
      if (selectedLeads.length === 15) break;
    }
  }

  if (selectedLeads.length < 15) {
    throw new Error(`Apenas ${selectedLeads.length} leads qualificados com WhatsApp encontrados.`);
  }

  console.log(`✓ 15 leads validados com WhatsApp encontrados!\n`);

  const scheduledSummary = [];

  for (let i = 0; i < selectedLeads.length; i++) {
    const lead = selectedLeads[i];
    const slot = slots[i];
    const phone = lead.normalized_phone || lead.phone;
    const timeStr = slot.toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit' });

    console.log(`[${i + 1}/15] Processando: ${lead.business_name} (${lead.city}/${lead.state}) para ${timeStr} BRT...`);

    // 4. Garantir que a loja existe no banco
    let slug = lead.metadata?.menu_slug;
    let storeRes = slug ? await pool.query('SELECT id, slug FROM stores WHERE slug = $1 LIMIT 1', [slug]) : { rowCount: 0, rows: [] };
    
    if (storeRes.rowCount === 0) {
      console.log(`  -> Provisionando loja e cardápio na TáPronto...`);
      const prov = await provisionOutreachStore({ lead, pool });
      slug = prov.slug;
      lead.metadata = { ...(lead.metadata || {}), menu_slug: slug, menu_url: prov.menuUrl, store_id: prov.storeId };
    } else {
      console.log(`  -> Loja já existente: ${slug}`);
    }

    // 5. Gerar prévias visuais (desktop + mobile mockup)
    const localDir = path.resolve('artifacts/outreach/automated', runId, `${slug}-${lead.id.slice(0, 8)}`);
    await mkdir(localDir, { recursive: true });

    console.log(`  -> Gerando prévias visuais (desktop + mobile)...`);
    await buildOutreachPreview({
      lead,
      photos: [],
      outputDir: localDir,
      chromePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe'
    });

    const relativeDesktop = `artifacts/outreach/automated/${runId}/${slug}-${lead.id.slice(0, 8)}/menu-preview.png`;
    const relativeMobile = `artifacts/outreach/automated/${runId}/${slug}-${lead.id.slice(0, 8)}/menu-preview-mobile.png`;

    // 6. Sincronizar com Cadastro Assistido
    console.log(`  -> Sincronizando com Cadastro Assistido...`);
    try {
      await syncLeadToAssistedRegistration({
        leadId: lead.id,
        lead,
        pool,
        actor: 'schedule_20261021'
      });
    } catch (err) {
      console.warn(`  ⚠️ Aviso ao sincronizar com Cadastro Assistido:`, err.message);
    }

    // 7. Montar mensagem personalizada com rastreio de clique (?ref=wa&lid=<id>)
    const message = buildOutreachMessage(lead);

    // 8. Atualizar lead no banco
    const updatedMetadata = {
      ...(lead.metadata || {}),
      outreach_run_id: runId,
      preview_desktop: relativeDesktop,
      preview_mobile: relativeMobile,
      menu_status: 'active'
    };

    await pool.query(`
      UPDATE sales_leads
      SET preview_desktop_path = $2,
          preview_mobile_path = $3,
          stage = 'scheduled',
          last_validated_at = '2026-10-21 14:00:00-03:00',
          metadata = $4::jsonb,
          updated_at = NOW()
      WHERE id = $1
    `, [lead.id, relativeDesktop, relativeMobile, JSON.stringify(updatedMetadata)]);

    // 9. Inserir job em sales_automation_jobs
    const idempotencyKey = `${runKey}:${lead.id}`;
    await pool.query(`
      INSERT INTO sales_automation_jobs (
        lead_id, job_type, idempotency_key, run_at, payload, status
      )
      VALUES ($1, 'send_sequence', $2, $3, $4::jsonb, 'pending')
      ON CONFLICT (idempotency_key)
      DO UPDATE SET run_at = EXCLUDED.run_at, status = 'pending', payload = EXCLUDED.payload, updated_at = NOW()
    `, [
      lead.id,
      idempotencyKey,
      slot,
      JSON.stringify({
        runId,
        message,
        previews: {
          desktopPath: relativeDesktop,
          mobilePath: relativeMobile
        },
        progress: {}
      })
    ]);

    // 10. Registrar evento de agendamento
    await pool.query(`
      INSERT INTO sales_automation_events (
        lead_id, run_id, place_id, stage, event_type, attempt, result, details
      )
      VALUES ($1, $2, $3, 'scheduled', 'lead_scheduled', 0, 'success', $4::jsonb)
    `, [
      lead.id,
      runId,
      lead.google_place_id || null,
      JSON.stringify({ scheduled_at: slot.toISOString(), menu_url: lead.metadata?.menu_url })
    ]);

    scheduledSummary.push({
      index: i + 1,
      name: lead.business_name,
      cidade: `${lead.city}/${lead.state}`,
      telefone: lead.phone,
      horario: timeStr,
      cardapio: `${lead.metadata?.menu_url}?ref=wa&lid=${lead.id}`
    });

    console.log(`  ✓ Agendado para ${timeStr} BRT!\n`);
  }

  // 11. Atualizar registro da run
  await pool.query(`
    UPDATE sales_discovery_runs
    SET qualified_count = 15,
        preview_count = 15,
        status = 'pending',
        updated_at = NOW()
    WHERE id = $1
  `, [runId]);

  // 12. Garantir que as configurações globais estão ativas
  await pool.query(`
    UPDATE sales_automation_settings
    SET paused = false,
        metadata = jsonb_set(coalesce(metadata, '{}'::jsonb), '{outreach_consecutive_failures}', '0'::jsonb),
        updated_at = NOW()
    WHERE id = 'global'
  `);

  console.log('================================================================');
  console.log('  SINCRONIZANDO ARTEFATOS PARA A VM E PARA PRODUÇÃO               ');
  console.log('================================================================\n');

  const runArtifactLocalPath = path.resolve('artifacts/outreach/automated', runId);

  // Sincronizar com VM
  try {
    console.log(`Copiando artefatos para a VM (192.168.1.108)...`);
    execSync(`scp -o BatchMode=yes -r "${runArtifactLocalPath}" root@192.168.1.108:/var/lib/docker/volumes/tapronto_outreach_artifacts/_data/`, { stdio: 'inherit' });
    console.log('✓ Artefatos copiados para o volume do Docker na VM!');
  } catch (err) {
    console.error('⚠️ Falha ao copiar para VM via SCP:', err.message);
  }

  // Sincronizar com Servidor de Produção
  try {
    console.log(`Copiando artefatos para Produção (130.51.23.180)...`);
    execSync(`ssh -o BatchMode=yes root@130.51.23.180 "mkdir -p /var/www/artifacts/outreach/automated"`, { stdio: 'inherit' });
    execSync(`scp -o BatchMode=yes -r "${runArtifactLocalPath}" root@130.51.23.180:/var/www/artifacts/outreach/automated/`, { stdio: 'inherit' });
    console.log('✓ Artefatos copiados para o servidor de produção!');
  } catch (err) {
    console.error('⚠️ Falha ao copiar para produção via SCP:', err.message);
  }

  console.log('\n================================================================');
  console.log('  GRADE DE 15 DISPAROS PROGRAMADA COM SUCESSO!                    ');
  console.log('================================================================\n');
  console.table(scheduledSummary);

  await pool.end();
}

main().catch(err => {
  console.error('[ERRO FATAL]', err);
  process.exit(1);
});
