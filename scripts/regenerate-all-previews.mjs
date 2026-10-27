import path from 'node:path';
import { mkdir, stat } from 'node:fs/promises';
import { execSync } from 'node:child_process';
import { getLocalPool } from '../src/lib/local-postgrest-adapter.js';
import { captureWithCDP } from '../src/lib/outreach-preview.js';

try { process.loadEnvFile?.('.env'); } catch {}

const pool = getLocalPool();
const SERVER_HOST = 'lucas@130.51.23.180';

async function main() {
  console.log('================================================================');
  console.log('🚀 REGENERAÇÃO DE PRÉVIAS EM ALTA FIDELIDADE (CDP NATIVO)');
  console.log('================================================================\n');

  const res = await pool.query(`
    SELECT id, business_name, preview_desktop_path, preview_mobile_path,
           metadata->>'menu_slug' as slug, metadata->>'menu_url' as menu_url, metadata->>'vip' as vip
    FROM sales_leads
    WHERE stage = 'preview_ready' OR metadata->>'vip' = 'true'
    ORDER BY (metadata->>'vip' = 'true') DESC, created_at DESC
  `);

  const leads = res.rows;
  console.log(`Total de estabelecimentos para regenerar: ${leads.length}`);

  let successCount = 0;
  let failCount = 0;

  for (let idx = 0; idx < leads.length; idx++) {
    const lead = leads[idx];
    const isVip = Boolean(lead.vip === 'true' || lead.vip === true);
    const slug = lead.slug;
    const url = lead.menu_url || `https://taprontomenu.com.br/${slug}`;
    const id8 = lead.id.slice(0, 8);
    const label = `[${idx + 1}/${leads.length}] ${isVip ? '⭐ VIP' : '🏪 AUTO'} ${lead.business_name} (${slug})`;

    console.log(`\n----------------------------------------------------------------`);
    console.log(label);
    console.log(`URL: ${url}`);

    // Local target directories
    const subDir = isVip ? `vip/${slug}` : `automated/${slug}-${id8}`;
    const localDir = path.resolve('artifacts/outreach', subDir);
    await mkdir(localDir, { recursive: true });

    const localDesktop = path.join(localDir, 'menu-preview.png');
    const localMobile = path.join(localDir, 'menu-preview-mobile.png');

    // Remote target directories
    const remoteDir = isVip ? `/var/www/artifacts/outreach/vip/${slug}` : `/var/www/artifacts/outreach/automated/${slug}-${id8}`;
    const remoteDesktop = `${remoteDir}/menu-preview.png`;
    const remoteMobile = `${remoteDir}/menu-preview-mobile.png`;

    try {
      const startT = Date.now();

      // 1. Desktop
      await captureWithCDP({
        url,
        outputPath: localDesktop,
        isMobile: false,
        width: 1080,
        height: 1350
      });

      // 2. Mobile mockup
      await captureWithCDP({
        url,
        outputPath: localMobile,
        isMobile: true
      });

      const statDesk = await stat(localDesktop);
      const statMob = await stat(localMobile);
      const durationSec = ((Date.now() - startT) / 1000).toFixed(1);

      console.log(`  ✅ Capturado localmente em ${durationSec}s!`);
      console.log(`     Desktop: ${(statDesk.size / 1024).toFixed(0)} KB | Mobile: ${(statMob.size / 1024).toFixed(0)} KB`);

      // 3. Sincronizar com servidor de produção via SSH/SCP
      try {
        execSync(`ssh ${SERVER_HOST} "mkdir -p ${remoteDir}"`, { stdio: 'ignore' });
        execSync(`scp "${localDesktop}" "${localMobile}" ${SERVER_HOST}:${remoteDir}/`, { stdio: 'ignore' });
        console.log(`  ☁️ Sincronizado com produção: ${remoteDir}`);
      } catch (sshErr) {
        console.warn(`  ⚠️ Aviso ao enviar para produção: ${sshErr.message}`);
      }

      // 4. Garantir que os caminhos no banco de dados estão alinhados
      await pool.query(`
        UPDATE sales_leads
        SET preview_desktop_path = $2,
            preview_mobile_path = $3,
            updated_at = NOW()
        WHERE id = $1
      `, [lead.id, remoteDesktop, remoteMobile]);

      successCount++;
    } catch (err) {
      console.error(`  ❌ Falha ao processar ${lead.business_name}:`, err.message);
      failCount++;
    }
  }

  console.log('\n================================================================');
  console.log(`🏁 REGENERAÇÃO CONCLUÍDA! Sucessos: ${successCount} | Falhas: ${failCount}`);
  console.log('================================================================\n');
}

main()
  .catch(console.error)
  .finally(async () => {
    await pool.end();
  });
