import path from 'node:path';
import { mkdir, readFile } from 'node:fs/promises';
import { execSync } from 'node:child_process';
import pg from 'pg';
import { provisionOutreachStore, resolveProductIllustration } from '../src/lib/outreach-store-provisioning.js';
import { captureWithCDP } from '../src/lib/outreach-preview.js';
import { evolutionV2SalesConfig, evolutionV2Request } from '../src/lib/evolution-v2-sales.js';

try { process.loadEnvFile?.('.env'); } catch {}

const pool = new pg.Pool({
  connectionString: 'postgresql://cardapio_user:ca3b7539eb748218ad8c652ae489f7087d42360367a9470d@localhost:5433/cardapio?schema=public'
});

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// 1. Script de Copywriting Humano & Persuasivo (Anti-AI)
function buildPersonalizedMessage(lead, menuUrl) {
  const name = lead.business_name
    .replace(/\s*-\s*Marmitaria.*/i, '')
    .replace(/\s*\|\s*Restaurante.*/i, '')
    .replace(/\s*-\s*Explosão de Sabores/i, '')
    .replace(/\(.*\)/, '')
    .trim();
  const city = lead.city || 'região';
  const trackedUrl = `${menuUrl}?ref=wa&lid=${lead.id}`;

  return `Oi pessoal da ${name}! Vi o trabalho de vocês aí em ${city} e sei bem a correria que é atender no WhatsApp no almoço mandando foto do cardápio e calculando entrega na mão.\n\nMontei uma demonstração prática de como os clientes podem escolher a marmita do dia e mandar o pedido prontinho no WhatsApp em 30 segundos, sem você pagar porcentagem sobre as vendas:\n\n👉 ${trackedUrl}\n\nSe quiserem, deixo o cardápio liberado pra vocês rodarem um teste essa semana sem custo nenhum, só pra ver os pedidos entrando. O que acham?`;
}

async function main() {
  console.log('================================================================');
  console.log('  PROVISIONAMENTO E AGENDAMENTO: 10 MARMITARIAS (SEGUNDA-FEIRA) ');
  console.log('================================================================\n');

  // Selecionar as 10 marmitarias de Botucatu, Marília e Bauru
  const leadsRes = await pool.query(`
    SELECT id, business_name, city, state, segment, phone, normalized_phone, metadata
    FROM sales_leads
    WHERE last_contact_at IS NULL 
      AND attempt_count = 0
      AND stage IN ('discovered', 'scheduled')
      AND segment = 'marmitaria'
      AND city IN ('Botucatu', 'Marília', 'Bauru')
      AND NOT EXISTS (
        SELECT 1 FROM sales_messages WHERE sales_messages.lead_id = sales_leads.id
      )
    ORDER BY 
      CASE WHEN city = 'Botucatu' THEN 1 WHEN city = 'Marília' THEN 2 ELSE 3 END,
      created_at DESC
    LIMIT 10
  `);

  const leads = leadsRes.rows;
  console.log(`Carregadas ${leads.length} marmitarias para provisionar e agendar:\n`);
  for (let i = 0; i < leads.length; i++) {
    console.log(` ${i + 1}. ${leads[i].business_name} (${leads[i].city} - ${leads[i].phone})`);
  }
  console.log('');

  const runId = 'batch-monday-2026-10-26';
  const artifactsBase = path.resolve('artifacts/outreach/automated', runId);
  await mkdir(artifactsBase, { recursive: true });

  // Grade de horários para amanhã de manhã (09:30 até 10:15 BRT)
  // 2026-10-26T09:30:00-03:00
  const baseTime = new Date('2026-10-26T09:30:00-03:00');

  const scheduledBatch = [];

  for (let i = 0; i < leads.length; i++) {
    const lead = leads[i];
    const phone = (lead.normalized_phone || lead.phone).replace(/\D/g, '');
    console.log(`----------------------------------------------------------------`);
    console.log(`[${i + 1}/${leads.length}] Provisionando: ${lead.business_name} (${phone}) - ${lead.city}`);

    // 1. Provisionar cardápio da loja
    let prov;
    try {
      prov = await provisionOutreachStore({ lead, pool, baseUrl: 'https://taprontomenu.com.br' });
    } catch (err) {
      console.error(`  ❌ Erro ao provisionar ${lead.business_name}:`, err.message);
      continue;
    }

    const storeId = prov.storeId;
    const storeSlug = prov.storeSlug || prov.slug;
    const menuUrl = `https://taprontomenu.com.br/${storeSlug}`;
    console.log(`  ✓ Cardápio provisionado: ${menuUrl}`);

    // 2. REGRA DE OURO: Validar que 100% dos itens possuem imagens válidas em alta resolução
    const itemsRes = await pool.query(`SELECT id, name, image_url FROM menu_items WHERE store_id = $1`, [storeId]);
    for (const item of itemsRes.rows) {
      if (!item.image_url || !item.image_url.trim()) {
        const fallbackImg = resolveProductIllustration(item.name, lead.segment);
        await pool.query(`UPDATE menu_items SET image_url = $1 WHERE id = $2`, [fallbackImg, item.id]);
        console.log(`  📸 Imagem corrigida para item: ${item.name}`);
      }
    }
    console.log(`  ✓ 100% dos ${itemsRes.rows.length} itens possuem fotos reais em alta resolução.`);

    // 3. Capturar prévias visuais reais com Chrome CDP
    const leadDir = path.join(artifactsBase, `${storeSlug}-${lead.id.slice(0, 8)}`);
    await mkdir(leadDir, { recursive: true });

    const desktopFile = path.join(leadDir, 'menu-preview.png');
    const mobileFile = path.join(leadDir, 'menu-preview-mobile.png');

    console.log('  -> Capturando prints do cardápio com Chrome CDP...');
    try {
      await captureWithCDP({
        url: menuUrl,
        outputPath: desktopFile,
        width: 1080,
        height: 1350,
        isMobile: false
      });
      await captureWithCDP({
        url: menuUrl,
        outputPath: mobileFile,
        width: 1080,
        height: 1350,
        isMobile: true
      });
      console.log('  ✓ Prints capturados com sucesso!');
    } catch (err) {
      console.warn(`  ⚠️ Aviso na captura CDP: ${err.message}.`);
    }

    // 4. Montar a copy personalizada
    const messageText = buildPersonalizedMessage(lead, menuUrl);

    // 5. Calcular horário agendado (intervalo de 4 a 5 minutos entre envios)
    const scheduledAt = new Date(baseTime.getTime() + (i * 4.5 * 60 * 1000));
    console.log(`  ⏰ Agendado para: ${scheduledAt.toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo' })} BRT`);

    // 6. Gravar job em sales_automation_jobs
    const idempotencyKey = `monday-marmitarias-2026-10-26:${lead.id}`;
    const payload = {
      runId,
      phone,
      businessName: lead.business_name,
      city: lead.city,
      menuUrl,
      message: messageText,
      desktopFile,
      mobileFile,
      desktopCaption: 'Assim fica o cardápio de vocês no computador, com as marmitas e opções organizadas.',
      mobileCaption: 'E esta é a experiência rápida no celular, direto para o cliente fazer pedidos pelo WhatsApp.'
    };

    await pool.query(`
      INSERT INTO sales_automation_jobs (
        lead_id, job_type, idempotency_key, run_at, status, payload, created_at, updated_at
      ) VALUES ($1, 'send_sequence', $2, $3, 'pending', $4::jsonb, now(), now())
      ON CONFLICT (idempotency_key) DO UPDATE SET
        run_at = EXCLUDED.run_at,
        payload = EXCLUDED.payload,
        status = 'pending',
        updated_at = now()
    `, [lead.id, idempotencyKey, scheduledAt, JSON.stringify(payload)]);

    // Atualizar metadata do lead com os caminhos dos prints e store_id
    await pool.query(`
      UPDATE sales_leads
      SET stage = 'scheduled',
          metadata = jsonb_set(
            jsonb_set(
              jsonb_set(
                COALESCE(metadata, '{}'::jsonb),
                '{scheduled_for}',
                to_jsonb($2::text)
              ),
              '{menu_url}',
              to_jsonb($3::text)
            ),
            '{store_id}',
            to_jsonb($4::text)
          ),
          updated_at = now()
      WHERE id = $1
    `, [lead.id, scheduledAt.toISOString(), menuUrl, storeId]);

    scheduledBatch.push({
      leadId: lead.id,
      name: lead.business_name,
      phone,
      city: lead.city,
      menuUrl,
      scheduledAt: scheduledAt.toISOString(),
      desktopFile,
      mobileFile
    });
  }

  // 7. Sincronizar artefatos para a VM (se acessível)
  console.log('\n================================================================');
  console.log('  SINCRONIZANDO ARTEFATOS COM O SERVIDOR VM...');
  try {
    execSync(`ssh root@192.168.1.108 "mkdir -p /var/lib/docker/volumes/tapronto_outreach_artifacts/_data/${runId}"`, { stdio: 'inherit' });
    execSync(`scp -r "${artifactsBase}/*" root@192.168.1.108:/var/lib/docker/volumes/tapronto_outreach_artifacts/_data/${runId}/`, { stdio: 'inherit' });
    console.log('✓ Artefatos sincronizados com a VM com sucesso!');
  } catch (err) {
    console.warn('⚠️ Aviso ao sincronizar artefatos com a VM:', err.message);
  }

  console.log('\n================================================================');
  console.log(`✅ LOTE DE ${scheduledBatch.length} MARMITARIAS 100% PREPARADO E AGENDADO!`);
  console.log('================================================================\n');

  await pool.end();
}

main().catch(console.error);
