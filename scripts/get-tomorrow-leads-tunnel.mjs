import pg from 'pg';

const connectionString = 'postgresql://cardapio_user:ca3b7539eb748218ad8c652ae489f7087d42360367a9470d@127.0.0.1:6543/cardapio?schema=public';
const pool = new pg.Pool({ connectionString });

async function main() {
  try {
    const res = await pool.query(`
      SELECT j.id AS job_id, l.id AS lead_id, l.business_name, l.phone,
        to_char(j.run_at at time zone 'America/Sao_Paulo','YYYY-MM-DD HH24:MI') AS scheduled_time
      FROM sales_automation_jobs j
      LEFT JOIN sales_leads l ON l.id = j.lead_id
      WHERE (j.run_at at time zone 'America/Sao_Paulo')::date = $1
        AND j.status = 'pending'
      ORDER BY j.run_at ASC;
    `, ['2026-10-22']);
    console.table(res.rows);
  } catch (err) {
    console.error('Error:', err);
  } finally {
    await pool.end();
  }
}

main();

