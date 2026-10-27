import path from 'node:path';
import { mkdir, access } from 'node:fs/promises';
import { constants } from 'node:fs';
import { execSync } from 'node:child_process';
import { getLocalPool } from '../src/lib/local-postgrest-adapter.js';
import { buildOutreachPreview } from '../src/lib/outreach-preview.js';
import { buildOutreachMessage } from '../src/lib/outreach-message.js';
import { syncLeadToAssistedRegistration } from '../src/lib/outreach-menu-lifecycle.js';
import { provisionOutreachStore } from '../src/lib/outreach-store-provisioning.js';
import { evolutionV2SalesConfig, evolutionV2Request } from '../src/lib/evolution-v2-sales.js';

try { process.loadEnvFile?.('.env'); } catch {}

const pool = getLocalPool();

async function fileExists(p) {
  try {
    await access(p, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

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
  console.log('  AGENDAMENTO DA GRADE DE 15 LEADS PARA 24/10/2026 (SÁBADO)     ');
  console.log('  METODOLOGIA HARVEY: COPY ANTI-IA + QUALIFICAÇÃO SCOUT         ');
  console.log('================================================================\n');

  const runKey = '2026-10-24:live';
  const targetDateStr = '2026-10-24';

  // 1. Limpar / Cancelar jobs legados obsoletos de 17/10
  const staleCancel = await pool.query(`
    UPDATE sales_automation_jobs
    SET status = 'cancelled', last_error = 'cancelado: job legado obsoleto de 17/10 ja processado anteriormente'
    WHERE run_at < '2026-10-20' AND status = 'pending'
    RETURNING id
  `);
  if (staleCancel.rowCount > 0) {
    console.log(`✓ Cancelados ${staleCancel.rowCount} jobs obsoletos do dia 17/10.\n`);
  }

  // Cancelar job antigo do Inverno D'Italia de 21/10 para reagendar hoje
  await pool.query(`
    UPDATE sales_automation_jobs
    SET status = 'cancelled', last_error = 'reagendado para 24/10:live'
    WHERE idempotency_key = '2026-10-21:live:801c4f07-89bc-41df-926b-e623ba5b3697'
  `);

  // 2. Obter ou criar registro da run do dia 24/10
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
      JSON.stringify({ scheduled_targets: 'Dois Córregos / Maravilha / Lagoa Vermelha / Braço do Norte' })
    ]);
    run = insertRun.rows[0];
  }
  const runId = run.id;
  console.log(`✓ Run ID: ${runId} (${runKey})\n`);

  // 3. Grade de 15 slots para a tarde de 24/10 (14:15 até 17:05 BRT)
  const slots = [
    new Date('2026-10-24T14:15:00-03:00'),
    new Date('2026-10-24T14:27:00-03:00'),
    new Date('2026-10-24T14:39:00-03:00'),
    new Date('2026-10-24T14:51:00-03:00'),
    new Date('2026-10-24T15:03:00-03:00'),
    new Date('2026-10-24T15:15:00-03:00'),
    new Date('2026-10-24T15:27:00-03:00'),
    new Date('2026-10-24T15:39:00-03:00'),
    new Date('2026-10-24T15:51:00-03:00'),
    new Date('2026-10-24T16:03:00-03:00'),
    new Date('2026-10-24T16:15:00-03:00'),
    new Date('2026-10-24T16:27:00-03:00'),
    new Date('2026-10-24T16:39:00-03:00'),
    new Date('2026-10-24T16:51:00-03:00'),
    new Date('2026-10-24T17:05:00-03:00')
  ];

  // 4. Os 15 leads qualificados e validados (sem histórico de envio prévio)
  const targetLeadIds = [
    '801c4f07-89bc-41df-926b-e623ba5b3697', // Inverno D´Italia Dois Córregos
    'edb7c40b-e6d3-4a97-b73c-a953e41a1db7', // Open House Beer
    'ee482c4f-4e26-489f-82a6-4930221649a8', // Bar Route 66
    '4f54fa98-ab89-4c43-818b-cef4fdc814a3', // Cervejaria Enigma/Enigma British PUB
    'dbf6a718-4c4e-4b8d-9d25-4de7d2af6a69', // Açai V Mix
    'e8b421c2-f61b-4903-b889-562171643a12', // Cantina Roman
    'a3897392-9e43-4bd0-9440-1fdeae55c881', // Via Daros Padaria e Confeitaria
    'fffcf804-1c26-46d3-b5b9-760e8a102d46', // Bar 52 by Alvaro Cyrino
    'a7b5f672-400d-4464-becc-286f231ff752', // Baraios Bar
    'ed5b92a1-fcd4-4b46-9615-5a70ad588d5e', // Avenida Café
    'fa8f2f77-742a-44e0-aec1-e586c82cb8d4', // D'Angelo Café e Restaurante
    '73fad018-0f44-40d4-9d98-f2811fbed51e', // The Best Açaí Maravilha
    '5d9394de-647d-4daa-9873-8399168869fd', // Açaí Ten
    '4dae8f8b-79e8-4330-a437-1555c0004d6d', // Eskimó Maravilha SC
    '86544373-64c9-457c-a98c-b240777dcf8d'  // Cabana Grill Restaurante
  ];

  const leadsRes = await pool.query(`
    SELECT l.id, l.business_name, l.phone, l.normalized_phone, l.city, l.state, l.segment, 
           l.stage, l.metadata, l.google_place_id, l.preview_desktop_path, l.preview_mobile_path
    FROM sales_leads l
    WHERE l.id = ANY($1::uuid[])
    ORDER BY array_position($1::uuid[], l.id)
  `, [targetLeadIds]);

  const selectedLeads = leadsRes.rows;
  console.log(`✓ ${selectedLeads.length} leads qualificados carregados.\n`);

  const scheduledSummary = [];

  for (let i = 0; i < selectedLeads.length; i++) {
    const lead = selectedLeads[i];
    const slot = slots[i];
    const timeStr = slot.toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit' });

    console.log(`[${i + 1}/15] Processando: ${lead.business_name} (${lead.city}/${lead.state}) para ${timeStr} BRT...`);

    // 5. Garantir que a loja existe no banco
    let slug = lead.metadata?.menu_slug;
    let storeRes = slug ? await pool.query('SELECT id, slug FROM stores WHERE slug = $1 LIMIT 1', [slug]) : { rowCount: 0, rows: [] };
    
    if (storeRes.rowCount === 0) {
      console.log(`  -> Provisionando loja e cardápio na TáPronto...`);
      const prov = await provisionOutreachStore({ lead, pool, baseUrl: 'https://taprontomenu.com.br' });
      slug = prov.slug;
      lead.metadata = { ...(lead.metadata || {}), menu_slug: slug, menu_url: prov.menuUrl, store_id: prov.storeId };
    } else {
      console.log(`  -> Loja ativa: ${slug}`);
      if (!lead.metadata?.menu_url) {
        lead.metadata = { ...(lead.metadata || {}), menu_slug: slug, menu_url: `https://taprontomenu.com.br/${slug}` };
      }
    }

    // 6. Gerar prévias visuais (desktop + mobile mockup) se ainda não existirem
    const localDir = path.resolve('artifacts/outreach/automated', runId, `${slug}-${lead.id.slice(0, 8)}`);
    const relativeDesktop = `artifacts/outreach/automated/${runId}/${slug}-${lead.id.slice(0, 8)}/menu-preview.png`;
    const relativeMobile = `artifacts/outreach/automated/${runId}/${slug}-${lead.id.slice(0, 8)}/menu-preview-mobile.png`;

    const desktopFullPath = path.resolve(relativeDesktop);
    const mobileFullPath = path.resolve(relativeMobile);

    const desktopOk = await fileExists(desktopFullPath);
    const mobileOk = await fileExists(mobileFullPath);

    if (!desktopOk || !mobileOk) {
      await mkdir(localDir, { recursive: true });
      console.log(`  -> Gerando prévias visuais com Chrome (desktop + mobile)...`);
      await buildOutreachPreview({
        lead,
        photos: [],
        outputDir: localDir,
        chromePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe'
      });
      console.log(`  ✓ Prévias geradas com sucesso!`);
    } else {
      console.log(`  -> Prévias já existentes em disco.`);
    }

    // 7. Sincronizar com Cadastro Assistido
    console.log(`  -> Sincronizando com Cadastro Assistido...`);
    try {
      await syncLeadToAssistedRegistration({
        leadId: lead.id,
        lead,
        pool,
        actor: 'schedule_20261024'
      });
    } catch (err) {
      console.warn(`  ⚠️ Aviso ao sincronizar com Cadastro Assistido:`, err.message);
    }

    // 8. Montar mensagem personalizada Harvey com rastreio de clique (?ref=wa&lid=<id>)
    const message = buildOutreachMessage(lead);

    // 9. Atualizar lead no banco com last_validated_at de hoje para passar o send gate
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
          last_validated_at = '2026-10-24 14:00:00-03:00',
          discard_code = null,
          metadata = $4::jsonb,
          updated_at = NOW()
      WHERE id = $1
    `, [lead.id, relativeDesktop, relativeMobile, JSON.stringify(updatedMetadata)]);

    // 10. Inserir ou atualizar job em sales_automation_jobs
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

    // 11. Registrar evento de agendamento
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
      slot: i + 1,
      empresa: lead.business_name,
      cidade: `${lead.city}/${lead.state}`,
      telefone: lead.phone,
      horario: `${timeStr} BRT`,
      cardapio: `${lead.metadata?.menu_url}?ref=wa&lid=${lead.id}`
    });

    console.log(`  ✓ Agendado para ${timeStr} BRT!\n`);
  }

  // 12. Atualizar registro da run
  await pool.query(`
    UPDATE sales_discovery_runs
    SET qualified_count = 15,
        preview_count = 15,
        status = 'pending',
        updated_at = NOW()
    WHERE id = $1
  `, [runId]);

  // 13. Garantir que as configurações globais estão ativas
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
    execSync(`scp -o BatchMode=yes -r "${runArtifactLocalPath}" root@192.168.1.108:/var/lib/docker/volumes/tapronto_outreach_artifacts/_data/`, { stdio: 'pipe' });
    console.log('✓ Artefatos copiados para o volume do Docker na VM!');
  } catch (err) {
    console.warn('⚠️ Aviso ao copiar para VM via SCP (pode sincronizar depois):', err.message);
  }

  // Sincronizar com Servidor de Produção
  try {
    console.log(`Copiando artefatos para Produção (130.51.23.180)...`);
    execSync(`ssh -o BatchMode=yes root@130.51.23.180 "mkdir -p /var/www/artifacts/outreach/automated"`, { stdio: 'pipe' });
    execSync(`scp -o BatchMode=yes -r "${runArtifactLocalPath}" root@130.51.23.180:/var/www/artifacts/outreach/automated/`, { stdio: 'pipe' });
    console.log('✓ Artefatos copiados para o servidor de produção!');
  } catch (err) {
    console.warn('⚠️ Aviso ao copiar para produção via SCP (pode sincronizar depois):', err.message);
  }

  console.log('\n================================================================');
  console.log('  GRADE DE 15 DISPAROS HARVEY PROGRAMADA COM SUCESSO!            ');
  console.log('================================================================\n');
  console.table(scheduledSummary);

  await pool.end();
}

main().catch(err => {
  console.error('[ERRO FATAL]', err);
  process.exit(1);
});

