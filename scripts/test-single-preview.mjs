import path from 'node:path';
import { mkdir } from 'node:fs/promises';
import { getLocalPool } from '../src/lib/local-postgrest-adapter.js';
import { buildOutreachPreview } from '../src/lib/outreach-preview.js';

try { process.loadEnvFile?.('.env'); } catch {}

const pool = getLocalPool();

async function main() {
  const leadRes = await pool.query(`
    SELECT * FROM sales_leads WHERE metadata->>'menu_slug' = 'boteco-do-bakana' LIMIT 1
  `);
  const lead = leadRes.rows[0];
  console.log('Testing preview for:', lead.business_name, lead.metadata?.menu_url);

  const outputDir = path.resolve('artifacts/outreach/automated/test-preview', `${lead.metadata.menu_slug}-${lead.id.slice(0, 8)}`);
  await mkdir(outputDir, { recursive: true });

  const preview = await buildOutreachPreview({
    lead,
    photos: [],
    outputDir,
    chromePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe'
  });

  console.log('Preview generated successfully:');
  console.log('Desktop:', preview.desktopPath);
  console.log('Mobile:', preview.mobilePath);

  await pool.end();
}

main().catch(console.error);
