import pg from 'pg';

async function main() {
  const client = new pg.Client({
    connectionString: 'postgresql://cardapio_user:ca3b7539eb748218ad8c652ae489f7087d42360367a9470d@localhost:5433/cardapio?schema=public'
  });
  await client.connect();

  const res = await client.query(`
    SELECT 
      ar.id,
      ar.establishment_name,
      ar.phone,
      ar.status,
      ar.store_id,
      ar.created_at,
      ROUND(EXTRACT(EPOCH FROM (NOW() - ar.created_at)) / 3600) AS age_hours,
      sl.id AS lead_id,
      sl.business_name AS lead_name,
      sl.stage AS lead_stage,
      sl.last_contact_at,
      ROUND(EXTRACT(EPOCH FROM (NOW() - sl.last_contact_at)) / 3600) AS contact_age_hours,
      sl.metadata->>'continuity_confirmed' AS continuity_confirmed,
      sl.metadata->>'is_showcase' AS is_showcase,
      sl.metadata->>'menu_status' AS menu_status
    FROM assisted_registrations ar
    LEFT JOIN sales_leads sl ON sl.id = (ar.attribution->>'lead_id')::uuid OR sl.metadata->>'registration_id' = ar.id::text OR sl.metadata->>'store_id' = ar.store_id::text
    ORDER BY ar.created_at ASC
  `);

  console.log(`TOTAL ASSISTED REGISTRATIONS: ${res.rows.length}`);
  console.log(JSON.stringify(res.rows, null, 2));

  await client.end();
}

main().catch(console.error);

