import pg from 'pg';
const client = new pg.Client('postgresql://cardapio_user:ca3b7539eb748218ad8c652ae489f7087d42360367a9470d@localhost:5433/cardapio?schema=public');
await client.connect();

const leadIds = [
  '801c4f07-89bc-41df-926b-e623ba5b3697',
  'edb7c40b-e6d3-4a97-b73c-a953e41a1db7',
  'ee482c4f-4e26-489f-82a6-4930221649a8'
];

await client.query(`
  update sales_leads
  set stage = 'scheduled',
      automation_status = 'active',
      stop_reason = null,
      updated_at = now()
  where id = any($1::uuid[])
`, [leadIds]);

await client.query(`
  update sales_automation_jobs
  set status = 'pending',
      last_error = null,
      attempt_count = 0,
      payload = jsonb_set(payload, '{progress}', '{}'::jsonb),
      run_at = now(),
      updated_at = now()
  where lead_id = any($1::uuid[])
`, [leadIds]);

console.log('Successfully reset 3 leads to pending/active');
await client.end();
