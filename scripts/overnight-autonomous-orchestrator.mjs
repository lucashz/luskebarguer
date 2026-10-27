import path from 'node:path';
import { mkdir, readFile } from 'node:fs/promises';
import sharp from 'sharp';
import { getLocalPool } from '../src/lib/local-postgrest-adapter.js';
import { provisionOutreachStore } from '../src/lib/outreach-store-provisioning.js';
import { buildOutreachPreview } from '../src/lib/outreach-preview.js';
import { cleanupExpiredOutreachMenus } from '../src/lib/outreach-menu-lifecycle.js';

try { process.loadEnvFile?.('.env'); } catch {}

const pool = getLocalPool();

// Palavras-chave para fotos gastronômicas HD
const KEYWORD_PHOTOS = [
  { pattern: /pizza.*calabresa/i, url: 'https://images.unsplash.com/photo-1628840042765-356cda07504e?auto=format&fit=crop&w=1200&q=85' },
  { pattern: /pizza.*margherita|pizza.*marguerita/i, url: 'https://images.unsplash.com/photo-1604382354936-07c5d9983bd3?auto=format&fit=crop&w=1200&q=85' },
  { pattern: /pizza.*queijo|quatro queijos/i, url: 'https://images.unsplash.com/photo-1513104890138-7c749659a591?auto=format&fit=crop&w=1200&q=85' },
  { pattern: /pizza.*doce|pizza.*chocolate/i, url: 'https://images.unsplash.com/photo-1590947132387-155cc02f3212?auto=format&fit=crop&w=1200&q=85' },
  { pattern: /pizza/i, url: 'https://images.unsplash.com/photo-1565299624946-b28f40a0ae38?auto=format&fit=crop&w=1200&q=85' },
  { pattern: /bacon/i, url: 'https://images.unsplash.com/photo-1553979459-d2229ba7433b?auto=format&fit=crop&w=1200&q=85' },
  { pattern: /duplo|smash/i, url: 'https://images.unsplash.com/photo-1586190848861-99aa4a171e90?auto=format&fit=crop&w=1200&q=85' },
  { pattern: /burger|hamburguer|hambúrguer/i, url: 'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?auto=format&fit=crop&w=1200&q=85' },
  { pattern: /batata|fritas/i, url: 'https://images.unsplash.com/photo-1573080496219-bb080dd4f877?auto=format&fit=crop&w=1200&q=85' },
  { pattern: /calabresa acebolada/i, url: 'https://images.unsplash.com/photo-1544025162-d76694265947?auto=format&fit=crop&w=1200&q=85' },
  { pattern: /frango|iscas/i, url: 'https://images.unsplash.com/photo-1626082927389-6cd097cdc6ec?auto=format&fit=crop&w=1200&q=85' },
  { pattern: /porcao|porção|petisco/i, url: 'https://images.unsplash.com/photo-1541592106381-b31e9677c0e5?auto=format&fit=crop&w=1200&q=85' },
  { pattern: /marmitex|executivo|comercial/i, url: 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?auto=format&fit=crop&w=1200&q=85' },
  { pattern: /file|filé|parmegiana|bife/i, url: 'https://images.unsplash.com/photo-1600891964599-f61ba0e24092?auto=format&fit=crop&w=1200&q=85' },
  { pattern: /salada/i, url: 'https://images.unsplash.com/photo-1512621776951-a57141f2eefd?auto=format&fit=crop&w=1200&q=85' },
  { pattern: /pao|pão/i, url: 'https://images.unsplash.com/photo-1509440159596-0249088772ff?auto=format&fit=crop&w=1200&q=85' },
  { pattern: /bolo|torta/i, url: 'https://images.unsplash.com/photo-1578985545062-69928b1d9587?auto=format&fit=crop&w=1200&q=85' },
  { pattern: /croissant/i, url: 'https://images.unsplash.com/photo-1555396273-367ea4eb4db5?auto=format&fit=crop&w=1200&q=85' },
  { pattern: /cafe|café|cappuccino|expresso/i, url: 'https://images.unsplash.com/photo-1514432324607-a09d9b4aefdd?auto=format&fit=crop&w=1200&q=85' },
  { pattern: /acai|açaí/i, url: 'https://images.unsplash.com/photo-1590080875515-8a3a8dc5735e?auto=format&fit=crop&w=1200&q=85' },
  { pattern: /sorvete/i, url: 'https://images.unsplash.com/photo-1501443762994-82bd5dace89a?auto=format&fit=crop&w=1200&q=85' },
  { pattern: /cerveja|chopp/i, url: 'https://images.unsplash.com/photo-1518176258769-f227c798150e?auto=format&fit=crop&w=1200&q=85' },
  { pattern: /suco/i, url: 'https://images.unsplash.com/photo-1613478223719-2ab802602423?auto=format&fit=crop&w=1200&q=85' },
  { pattern: /refrigerante|coca|guarana|água/i, url: 'https://images.unsplash.com/photo-1554866585-cd94860890b7?auto=format&fit=crop&w=1200&q=85' }
];

const DEFAULT_FOOD_PHOTO = 'https://images.unsplash.com/photo-1504674900247-0877df9cc836?auto=format&fit=crop&w=1200&q=85';

function resolvePhotoForItem(item, storeName = '') {
  const text = `${item.name || ''} ${item.description || ''} ${storeName}`.toLowerCase();
  for (const entry of KEYWORD_PHOTOS) {
    if (entry.pattern.test(text)) return entry.url;
  }
  return DEFAULT_FOOD_PHOTO;
}

// 1. Limpeza de cardápios expirados (15h)
export async function runCleanupCycle() {
  console.log('[Orchestrator] Executando ciclo de limpeza de cardápios (15h)...');
  const result = await cleanupExpiredOutreachMenus({ pool, dryRun: false, hours: 15 });
  console.log(`[Orchestrator] Limpeza concluída: ${result.processed} cardápios excluídos.`);
  return result;
}

// 2. Garantir fotos em 100% dos itens
export async function runImageFixCycle() {
  console.log('[Orchestrator] Verificando itens sem fotos...');
  const missing = await pool.query(`
    SELECT mi.id, mi.name, mi.description, s.name as store_name
    FROM menu_items mi
    JOIN stores s ON s.id = mi.store_id
    WHERE mi.image_url IS NULL OR trim(mi.image_url) = ''
  `);

  if (missing.rowCount > 0) {
    console.log(`[Orchestrator] Encontrados ${missing.rowCount} itens sem foto. Corrigindo...`);
    for (const item of missing.rows) {
      const url = resolvePhotoForItem(item, item.store_name);
      await pool.query('UPDATE menu_items SET image_url = $1, updated_at = NOW() WHERE id = $2', [url, item.id]);
    }
    console.log(`[Orchestrator] Todos os ${missing.rowCount} itens foram corrigidos com fotos HD.`);
  } else {
    console.log('[Orchestrator] Zero itens sem foto. Banco 100% saudável.');
  }

  // Capas
  const missingCovers = await pool.query(`
    SELECT store_id FROM store_settings WHERE cover_url IS NULL OR trim(cover_url) = ''
  `);
  if (missingCovers.rowCount > 0) {
    for (const row of missingCovers.rows) {
      await pool.query('UPDATE store_settings SET cover_url = $1, updated_at = NOW() WHERE store_id = $2', [
        'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?auto=format&fit=crop&w=1200&q=85',
        row.store_id
      ]);
    }
    console.log(`[Orchestrator] ${missingCovers.rowCount} capas de loja atualizadas.`);
  }
}

// 3. Qualificar e preparar novos leads candidatos
export async function runCandidatePreparation(limit = 3) {
  console.log(`[Orchestrator] Buscando até ${limit} novos candidatos qualificados com celular...`);
  const candidates = await pool.query(`
    SELECT * FROM sales_leads
    WHERE stage = 'discovered'
      AND phone IS NOT NULL
      AND REGEXP_REPLACE(phone, '\\D', '', 'g') ~ '([0-9]{2}9[0-9]{8})$'
      AND (metadata->>'menu_url' IS NULL OR stage NOT IN ('awaiting_reply', 'opted_out', 'lost', 'won'))
    ORDER BY created_at ASC
    LIMIT $1
  `, [limit]);

  console.log(`[Orchestrator] Candidatos selecionados: ${candidates.rowCount}`);
  const prepared = [];

  for (const lead of candidates.rows) {
    const rawDigits = String(lead.phone || '').replace(/\D/g, '');
    const phone = rawDigits.startsWith('55') ? rawDigits : `55${rawDigits}`;

    console.log(`\nProvisionando: ${lead.business_name} (${phone}) - ${lead.city}/${lead.state}`);
    try {
      const provisioned = await provisionOutreachStore({
        lead,
        pool,
        baseUrl: process.env.APP_BASE_URL || 'https://taprontomenu.com.br'
      });
      console.log(`  -> Cardápio criado: ${provisioned.menuUrl}`);

      lead.metadata = {
        ...(lead.metadata || {}),
        store_id: provisioned.storeId,
        menu_slug: provisioned.slug,
        menu_url: provisioned.menuUrl,
        continuity_confirmed: false,
        menu_status: 'active'
      };

      const outputDir = path.resolve('artifacts/outreach/automated', `${provisioned.slug}-${lead.id.slice(0, 8)}`);
      await mkdir(outputDir, { recursive: true });

      const preview = await buildOutreachPreview({
        lead,
        photos: [],
        outputDir
      });

      console.log(`  -> Prévias 1080x1350 geradas com sucesso.`);

      // Sincronizar prévias para o servidor de produção
      const remoteDir = `/var/www/artifacts/outreach/automated/${provisioned.slug}-${lead.id.slice(0, 8)}`;
      const remoteDesktop = `${remoteDir}/menu-preview.png`;
      const remoteMobile = `${remoteDir}/menu-preview-mobile.png`;

      try {
        const { execSync } = await import('node:child_process');
        execSync(`ssh lucas@130.51.23.180 "mkdir -p ${remoteDir}"`);
        execSync(`scp "${preview.desktopPath}" "${preview.mobilePath}" lucas@130.51.23.180:${remoteDir}/`);
        console.log(`  -> Prévias sincronizadas para o servidor em: ${remoteDir}`);
      } catch (uploadErr) {
        console.warn(`  -> Aviso ao enviar prévias para o servidor:`, uploadErr.message);
      }

      // Atualizar o lead no banco com caminhos do servidor
      await pool.query(`
        UPDATE sales_leads
        SET preview_desktop_path = $2,
            preview_mobile_path = $3,
            stage = 'preview_ready',
            metadata = $4::jsonb,
            updated_at = NOW()
        WHERE id = $1
      `, [lead.id, remoteDesktop, remoteMobile, JSON.stringify(lead.metadata)]);

      prepared.push({ lead, provisioned, preview });
    } catch (err) {
      console.warn(`  -> Erro ao preparar lead ${lead.business_name}:`, err.message);
    }
  }

  console.log(`\n[Orchestrator] Preparação concluída: ${prepared.length} novos leads com cardápios e prévias prontas!`);
  return prepared;
}

async function main() {
  console.log('====================================================');
  console.log('🌙 ORQUESTRADOR AUTÔNOMO NOTURNO TÁPRONTO INICIADO');
  console.log(`Data e hora: ${new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}`);
  console.log('====================================================\n');

  try {
    // 1. Limpeza 15h
    await runCleanupCycle();

    // 2. Correção de fotos
    await runImageFixCycle();

    // 3. Preparação de candidatos matinais
    await runCandidatePreparation(3);

    console.log('\n====================================================');
    console.log('✅ CICLO PRINCIPAL EXECUTADO COM SUCESSO!');
    console.log('====================================================\n');
  } finally {
    await pool.end();
  }
}

if (process.argv[1]?.endsWith('overnight-autonomous-orchestrator.mjs')) {
  main().catch(console.error);
}
