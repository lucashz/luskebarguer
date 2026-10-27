import pg from 'pg';

const pool = new pg.Pool({
  connectionString: 'postgresql://cardapio_user:ca3b7539eb748218ad8c652ae489f7087d42360367a9470d@localhost:5433/cardapio?schema=public'
});

async function main() {
  const stats = await pool.query(`
    SELECT 
      count(*) as total_leads,
      count(*) FILTER (WHERE last_contact_at IS NOT NULL OR attempt_count > 0) as contacted_leads,
      count(*) FILTER (WHERE last_contact_at IS NULL AND attempt_count = 0) as uncontacted_leads,
      count(*) FILTER (WHERE stage = 'lead' AND last_contact_at IS NULL) as raw_uncontacted_stage_lead
    FROM sales_leads
  `);
  console.log('Stats:', stats.rows[0]);

  // Check some uncontacted leads
  const samples = await pool.query(`
    SELECT id, business_name, city, state, segment, phone, last_contact_at, attempt_count, created_at
    FROM sales_leads
    WHERE last_contact_at IS NULL AND attempt_count = 0
    ORDER BY created_at DESC
    LIMIT 10
  `);
  console.log('\nSample uncontacted leads:');
  for (const s of samples.rows) {
    console.log(`- ${s.business_name} (${s.city}-${s.state}) | Seg: ${s.segment} | Tel: ${s.phone}`);
  }

  await pool.end();
}

main().catch(console.error);

