import { getLocalPool } from '../src/lib/local-postgrest-adapter.js';

try { process.loadEnvFile?.('.env'); } catch {}

const pool = getLocalPool();

async function main() {
  const res = await pool.query(`
    SELECT id, business_name, preview_desktop_path, preview_mobile_path,
           metadata->>'menu_slug' as slug, metadata->>'menu_url' as menu_url, metadata->>'vip' as vip
    FROM sales_leads
    WHERE stage = 'preview_ready' OR metadata->>'vip' = 'true'
    ORDER BY created_at DESC
  `);

  console.log(`Total de leads encontrados: ${res.rowCount}`);
  for (const r of res.rows) {
    console.log(`[${r.vip ? 'VIP' : 'AUTO'}] ${r.business_name}`);
    console.log(`  slug: ${r.slug} | url: ${r.menu_url}`);
    console.log(`  desktop: ${r.preview_desktop_path}`);
    console.log(`  mobile:  ${r.preview_mobile_path}\n`);
  }
}

main().finally(() => pool.end());
