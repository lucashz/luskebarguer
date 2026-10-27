import { getLocalPool } from '../src/lib/local-postgrest-adapter.js';

try { process.loadEnvFile?.('.env'); } catch {}

const pool = getLocalPool();

async function main() {
  const jobs = await pool.query(`
    SELECT j.id, j.status, l.business_name, l.phone, l.city, l.state, j.payload
    FROM sales_automation_jobs j
    JOIN sales_leads l ON l.id = j.lead_id
    WHERE j.status = 'pending'
      AND (j.run_at at time zone 'America/Sao_Paulo')::date = '2026-10-20'
    ORDER BY j.run_at ASC
  `);

  console.log(`Encontrados ${jobs.rowCount} jobs pendentes:`);
  for (const job of jobs.rows) {
    console.log(`\n--- ${job.business_name} (${job.phone}) ---`);
    console.log(`ID: ${job.id}`);
    console.log(`Previews:`, job.payload?.previews);
    console.log(`Mensagem: "${job.payload?.message?.slice(0, 150)}..."`);
  }

  await pool.end();
}

main().catch(console.error);
