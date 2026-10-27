import { getLocalPool } from '../src/lib/local-postgrest-adapter.js';

try { process.loadEnvFile?.('.env'); } catch {}

const pool = getLocalPool();

async function main() {
  console.log('=== VERIFICAÇÃO DE LEADS: HOJE (24/10), AMANHÃ (25/10) E PRÓXIMOS DIAS ===\n');

  // 1. Jobs agrupados por data agendada
  const scheduleByDate = await pool.query(`
    SELECT (run_at AT TIME ZONE 'America/Sao_Paulo')::date AS data_brt,
           to_char(run_at AT TIME ZONE 'America/Sao_Paulo', 'Dy') AS dia_semana,
           status,
           count(*) AS total
    FROM sales_automation_jobs
    GROUP BY 1, 2, 3
    ORDER BY 1 DESC, 3 ASC
    LIMIT 20
  `);
  console.log('--- RESUMO DOS JOBS POR DATA ---');
  console.table(scheduleByDate.rows);

  // 2. Jobs agendados para hoje (2026-10-24)
  const todayJobs = await pool.query(`
    SELECT j.id, j.status, 
           to_char(j.run_at AT TIME ZONE 'America/Sao_Paulo', 'HH24:MI') as horario,
           l.business_name, l.phone, l.city, l.segment
    FROM sales_automation_jobs j
    LEFT JOIN sales_leads l ON l.id = j.lead_id
    WHERE (j.run_at AT TIME ZONE 'America/Sao_Paulo')::date = '2026-10-24'
    ORDER BY j.run_at ASC
  `);
  console.log(`\n--- JOBS PARA HOJE (24/10/2026 - Sábado): ${todayJobs.rowCount} ---`);
  if (todayJobs.rowCount > 0) console.table(todayJobs.rows);

  // 3. Jobs agendados para amanhã (2026-10-25)
  const tomorrowJobs = await pool.query(`
    SELECT j.id, j.status, 
           to_char(j.run_at AT TIME ZONE 'America/Sao_Paulo', 'HH24:MI') as horario,
           l.business_name, l.phone, l.city, l.segment
    FROM sales_automation_jobs j
    LEFT JOIN sales_leads l ON l.id = j.lead_id
    WHERE (j.run_at AT TIME ZONE 'America/Sao_Paulo')::date = '2026-10-25'
    ORDER BY j.run_at ASC
  `);
  console.log(`\n--- JOBS PARA AMANHÃ (25/10/2026 - Domingo): ${tomorrowJobs.rowCount} ---`);
  if (tomorrowJobs.rowCount > 0) console.table(tomorrowJobs.rows);

  // 4. Jobs agendados para segunda-feira (2026-10-26)
  const mondayJobs = await pool.query(`
    SELECT j.id, j.status, 
           to_char(j.run_at AT TIME ZONE 'America/Sao_Paulo', 'HH24:MI') as horario,
           l.business_name, l.phone, l.city, l.segment
    FROM sales_automation_jobs j
    LEFT JOIN sales_leads l ON l.id = j.lead_id
    WHERE (j.run_at AT TIME ZONE 'America/Sao_Paulo')::date = '2026-10-26'
    ORDER BY j.run_at ASC
  `);
  console.log(`\n--- JOBS PARA SEGUNDA (26/10/2026): ${mondayJobs.rowCount} ---`);
  if (mondayJobs.rowCount > 0) console.table(mondayJobs.rows);

  // 5. Total de leads qualificados no pipeline disponíveis para novos agendamentos
  const qualifiedLeads = await pool.query(`
    SELECT stage, count(*) as total
    FROM sales_leads
    GROUP BY stage
    ORDER BY total DESC
  `);
  console.log('\n--- STATUS GERAL DO PIPELINE DE LEADS (sales_leads) ---');
  console.table(qualifiedLeads.rows);

  await pool.end();
}

main().catch(err => {
  console.error('Erro na verificação de agendamento:', err);
  process.exit(1);
});

