import path from 'node:path';
import { mkdir } from 'node:fs/promises';
import { execSync } from 'node:child_process';
import { getLocalPool } from '../src/lib/local-postgrest-adapter.js';
import { buildOutreachPreview } from '../src/lib/outreach-preview.js';
import { buildOutreachMessage } from '../src/lib/outreach-message.js';
import { syncLeadToAssistedRegistration } from '../src/lib/outreach-menu-lifecycle.js';
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
  console.log('  AGENDAMENTO DA GRADE DE 15 LEADS PARA 20/10/2026 (TERÇA-FEIRA) ');
  console.log('================================================================\n');

  const runKey = '2026-10-20:live';
  const targetDateStr = '2026-10-20';

  // 1. Obter ou criar registro da run do dia 20/10
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
      JSON.stringify({ scheduled_targets: 'Braço do Norte / Assis Chateaubriand / Dois Córregos / Pederneiras / Maravilha' })
    ]);
    run = insertRun.rows[0];
  }
  const runId = run.id;
  console.log(`✓ Run ID: ${runId} (${runKey})\n`);

  // 2. Definir a grade de 15 horários distribuídos nas janelas comerciais
  const slots = [
    // Manhã (09:30 - 11:30 BRT): 3 slots
    new Date('2026-10-20T09:40:00-03:00'),
    new Date('2026-10-20T10:20:00-03:00'),
    new Date('2026-10-20T11:00:00-03:00'),
    // Tarde (14:00 - 17:30 BRT): 12 slots
    new Date('2026-10-20T14:00:00-03:00'),
    new Date('2026-10-20T14:15:00-03:00'),
    new Date('2026-10-20T14:30:00-03:00'),
    new Date('2026-10-20T14:45:00-03:00'),
    new Date('2026-10-20T15:00:00-03:00'),
    new Date('2026-10-20T15:15:00-03:00'),
    new Date('2026-10-20T15:35:00-03:00'),
    new Date('2026-10-20T15:55:00-03:00'),
    new Date('2026-10-20T16:15:00-03:00'),
    new Date('2026-10-20T16:35:00-03:00'),
    new Date('2026-10-20T16:55:00-03:00'),
    new Date('2026-10-20T17:15:00-03:00')
  ];

  // 3. Os 15 estabelecimentos selecionados
  const targetSlugs = [
    'boteco-do-bakana',
    'holy-sandwich',
    'blackbird-burger',
    'skin-lanches-da-preta',
    'big-lanches-rota-370',
    'marmitaria-bom-sabor',
    'restaurante-buiu-s',
    'la-bella-pizzaria-choperia',
    'restaurante-panela-de-barro',
    'marmitaria-menu',
    'lian-sorvetes-dois-corregos',
    'ponto-do-acai',
    'padaria-e-marmitaria-pao-quente',
    'armazem-da-gula',
    'bar-do-mineiro-pederneiras-sp'
  ];

  const leadsRes = await pool.query(`
    SELECT *
    FROM sales_leads
    WHERE metadata->>'menu_slug' = ANY($1)
    ORDER BY array_position($1, (metadata->>'menu_slug')::text)
  `, [targetSlugs]);

  if (leadsRes.rows.length !== 15) {
    throw new Error(`Esperado 15 leads, encontrados ${leadsRes.rows.length}`);
  }

  const scheduledSummary = [];

  for (let i = 0; i < leadsRes.rows.length; i++) {
    const lead = leadsRes.rows[i];
    const slot = slots[i];
    const slug = lead.metadata?.menu_slug;
    const phone = lead.normalized_phone || lead.phone;
    const timeStr = slot.toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit' });

    console.log(`[${i + 1}/15] Agendando: ${lead.business_name} (${slug}) para ${timeStr} BRT...`);

    // Validar WhatsApp
    const isWa = await checkWhatsApp(phone);
    if (!isWa) {
      console.warn(`  ⚠️ WhatsApp não respondeu positivo para ${phone}, prosseguindo com o número cadastrado.`);
    }

    // Diretório local do artefato
    const localDir = path.resolve('artifacts/outreach/automated', runId, `${slug}-${lead.id.slice(0, 8)}`);
    await mkdir(localDir, { recursive: true });

    // Gerar prévias desktop e mobile (mockup smartphone)
    console.log(`  -> Gerando prévias visuais via Chrome CDP...`);
    const preview = await buildOutreachPreview({
      lead,
      photos: [],
      outputDir: localDir,
      chromePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe'
    });

    // Caminhos relativos que o worker dentro do container reconhece
    const relativeDesktop = `artifacts/outreach/automated/${runId}/${slug}-${lead.id.slice(0, 8)}/menu-preview.png`;
    const relativeMobile = `artifacts/outreach/automated/${runId}/${slug}-${lead.id.slice(0, 8)}/menu-preview-mobile.png`;

    // Sincronizar com Cadastro Assistido
    console.log(`  -> Sincronizando com Cadastro Assistido...`);
    let assistedRegId = null;
    try {
      const assisted = await syncLeadToAssistedRegistration({
        leadId: lead.id,
        lead,
        pool,
        actor: 'schedule_20261020'
      });
      assistedRegId = assisted?.registrationId || assisted?.registration?.id || lead.metadata?.registration_id;
      console.log(`  -> Vinculado ao Cadastro Assistido (ID: ${assistedRegId})`);
    } catch (err) {
      console.warn(`  ⚠️ Aviso ao sincronizar com Cadastro Assistido:`, err.message);
    }

    // Montar mensagem com rastreamento de cliques (?ref=wa&lid=<id>)
    const message = buildOutreachMessage(lead);

    // Atualizar lead no banco com a data de validação para 20/10 (para casar com o envio)
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
          last_validated_at = '2026-10-20 08:00:00-03:00',
          metadata = $4::jsonb,
          updated_at = NOW()
      WHERE id = $1
    `, [lead.id, relativeDesktop, relativeMobile, JSON.stringify(updatedMetadata)]);

    // Inserir ou atualizar job em sales_automation_jobs
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

    // Registrar evento de agendamento
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
      segment: lead.segment,
      city: `${lead.city}/${lead.state}`,
      phone: lead.phone,
      slot: timeStr,
      menuUrl: `${lead.metadata?.menu_url}?ref=wa&lid=${lead.id}`
    });

    console.log(`  ✓ Agendado com sucesso!\n`);
  }

  // 4. Atualizar registro da run
  await pool.query(`
    UPDATE sales_discovery_runs
    SET qualified_count = 15,
        preview_count = 15,
        status = 'pending',
        updated_at = NOW()
    WHERE id = $1
  `, [runId]);

  // 5. Garantir que o robô não está pausado
  await pool.query(`
    UPDATE sales_automation_settings
    SET paused = false,
        metadata = jsonb_set(coalesce(metadata, '{}'::jsonb), '{outreach_consecutive_failures}', '0'::jsonb),
        updated_at = NOW()
    WHERE id = 'global'
  `);

  console.log('\n================================================================');
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
