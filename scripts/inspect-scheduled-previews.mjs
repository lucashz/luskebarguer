import { getLocalPool } from '../src/lib/local-postgrest-adapter.js';

try { process.loadEnvFile?.('.env'); } catch {}

const pool = getLocalPool();

async function main() {
  const res = await pool.query(`
    SELECT
      id,
      business_name,
      phone,
      last_validated_at,
      to_char(last_validated_at at time zone 'America/Sao_Paulo', 'YYYY-MM-DD HH24:MI') as val_time_sp,
      preview_desktop_path,
      preview_mobile_path,
      metadata->>'menu_url' as menu_url
    FROM sales_leads
    WHERE stage = 'scheduled'
  `);

  console.log(`=== PREVIEWS E VALIDAÇÃO DOS 9 LEADS AGENDADOS ===`);
  for (const r of res.rows) {
    console.log(`\nLead: ${r.business_name} (${r.phone}) | Validado em: ${r.val_time_sp}`);
    console.log(`Cardápio: ${r.menu_url}`);
    console.log(`Desktop: ${r.preview_desktop_path}`);
    console.log(`Mobile:  ${r.preview_mobile_path}`);
  }

  await pool.end();
}

main().catch(console.error);
