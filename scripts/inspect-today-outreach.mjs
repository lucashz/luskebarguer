import { getLocalPool } from '/app/src/lib/local-postgrest-adapter.js';

const pool = getLocalPool();

async function main() {
  console.log('=== SALES DISCOVERY RUNS (Recent) ===');
  const runs = await pool.query(`
    select * from sales_discovery_runs
    order by created_at desc
    limit 5
  `);
  console.log(JSON.stringify(runs.rows, null, 2));

  console.log('=== SALES AUTOMATION JOBS (Recent) ===');
  const jobs = await pool.query(`
    select id, lead_id, job_type, status, idempotency_key, to_char(run_at, 'YYYY-MM-DD HH24:MI:SS') run_at, attempt_count, last_error
    from sales_automation_jobs
    order by created_at desc
    limit 10
  `);
  console.table(jobs.rows);

  console.log('=== SALES AUTOMATION SETTINGS ===');
  const settings = await pool.query(`select * from sales_automation_settings`);
  console.log(JSON.stringify(settings.rows, null, 2));

  console.log('=== RECENT SALES AUTOMATION EVENTS ===');
  const events = await pool.query(`
    select event_type, stage, result, details, to_char(created_at, 'YYYY-MM-DD HH24:MI:SS') created
    from sales_automation_events
    order by created_at desc
    limit 15
  `);
  console.table(events.rows);

  await pool.end();
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
