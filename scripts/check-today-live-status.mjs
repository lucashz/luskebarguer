import { getLocalPool } from '../src/lib/local-postgrest-adapter.js';

const pool = getLocalPool();

async function main() {
  const res = await pool.query(`
    SELECT to_char(j.run_at at time zone 'America/Sao_Paulo', 'HH24:MI') as horario,
           j.status, 
           l.business_name,
           l.phone,
           (j.payload->>'message' LIKE '%ref=wa&lid=%') as rastreado
    FROM sales_automation_jobs j
    JOIN sales_leads l ON l.id = j.lead_id
    WHERE (j.run_at at time zone 'America/Sao_Paulo')::date = '2026-10-21'
      AND j.status != 'cancelled'
    ORDER BY j.run_at ASC
  `);

  console.log(`\nGrade Oficial de Hoje (21/10) - Total de jobs ativos: ${res.rowCount}`);
  console.table(res.rows);

  const completedCount = res.rows.filter(r => r.status === 'completed').length;
  const pendingCount = res.rows.filter(r => r.status === 'pending').length;
  const claimedCount = res.rows.filter(r => r.status === 'claimed').length;

  console.log(`\nResumo:`);
  console.log(`- Enviados (completed): ${completedCount}`);
  console.log(`- Em processamento (claimed): ${claimedCount}`);
  console.log(`- Pendentes na fila (pending): ${pendingCount}`);

  await pool.end();
}

main().catch(console.error);
