import { getLocalPool } from '../src/lib/local-postgrest-adapter.js';

try { process.loadEnvFile?.('.env'); } catch {}

const pool = getLocalPool();

async function main() {
  const jobsRes = await pool.query(`
    SELECT j.id, j.status, 
           to_char(j.run_at at time zone 'America/Sao_Paulo', 'HH24:MI') as time_brt,
           l.business_name, l.phone, l.city, l.state, l.stage,
           (j.payload->'previews'->>'desktopPath') as desktop,
           (j.payload->'previews'->>'mobilePath') as mobile,
           (j.payload->>'message') as message
    FROM sales_automation_jobs j
    JOIN sales_leads l ON l.id = j.lead_id
    WHERE (j.run_at at time zone 'America/Sao_Paulo')::date = '2026-10-20'
    ORDER BY j.run_at ASC
  `);

  console.log(`Total jobs agendados para 20/10: ${jobsRes.rowCount}`);
  console.table(jobsRes.rows.map(r => ({
    horario: r.time_brt,
    nome: r.business_name,
    cidade: `${r.city}/${r.state}`,
    telefone: r.phone,
    status: r.status,
    tem_desktop: Boolean(r.desktop),
    tem_mobile: Boolean(r.mobile),
    tem_ref_wa: r.message.includes('ref=wa&lid=')
  })));

  await pool.end();
}

main().catch(console.error);
