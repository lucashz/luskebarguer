import { getLocalPool } from '../src/lib/local-postgrest-adapter.js';
import sharp from 'sharp';
import fs from 'node:fs/promises';

try { process.loadEnvFile?.('.env'); } catch {}

const pool = getLocalPool();

async function main() {
  console.log('=== AUDITORIA DE PRÉVIAS GERADAS NO BANCO ===\n');

  const leads = await pool.query(`
    SELECT id, business_name, phone, stage, preview_desktop_path, preview_mobile_path, metadata
    FROM sales_leads
    WHERE preview_desktop_path IS NOT NULL OR preview_mobile_path IS NOT NULL
    ORDER BY updated_at DESC
  `);

  console.log(`Leads com prévias cadastradas: ${leads.rowCount}`);

  for (const lead of leads.rows) {
    console.log(`\nLead: ${lead.business_name} (${lead.stage})`);
    console.log(`  Menu URL: ${lead.metadata?.menu_url || 'N/A'}`);
    
    // Desktop
    if (lead.preview_desktop_path) {
      try {
        const meta = await sharp(lead.preview_desktop_path).metadata();
        console.log(`  Desktop: ${lead.preview_desktop_path} -> ${meta.width}x${meta.height} (${meta.width === 1080 && meta.height === 1350 ? '✅ 1080x1350 OK' : '⚠️ ' + meta.width + 'x' + meta.height})`);
      } catch (err) {
        console.log(`  Desktop: ${lead.preview_desktop_path} -> ❌ Erro ao ler: ${err.message}`);
      }
    }

    // Mobile
    if (lead.preview_mobile_path) {
      try {
        const meta = await sharp(lead.preview_mobile_path).metadata();
        console.log(`  Mobile:  ${lead.preview_mobile_path} -> ${meta.width}x${meta.height} (${meta.width === 1080 && meta.height === 1350 ? '✅ 1080x1350 Mockup OK' : '⚠️ ' + meta.width + 'x' + meta.height})`);
      } catch (err) {
        console.log(`  Mobile:  ${lead.preview_mobile_path} -> ❌ Erro ao ler: ${err.message}`);
      }
    }
  }

  await pool.end();
}

main().catch(console.error);

