import pg from 'pg';

async function main() {
  const client = new pg.Client({
    connectionString: 'postgresql://cardapio_user:ca3b7539eb748218ad8c652ae489f7087d42360367a9470d@localhost:5433/cardapio?schema=public'
  });
  await client.connect();

  const query = `
    SELECT 
      ar.id,
      ar.establishment_name,
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
    LEFT JOIN sales_leads sl ON (
      sl.id = (CASE WHEN ar.attribution->>'lead_id' ~ '^[0-9a-fA-F-]{36}$' THEN (ar.attribution->>'lead_id')::uuid ELSE NULL END)
      OR sl.metadata->>'registration_id' = ar.id::text
      OR sl.metadata->>'store_id' = ar.store_id::text
    )
    WHERE ar.status NOT IN ('published', 'active', 'activated')
    ORDER BY ar.created_at ASC
  `;

  const res = await client.query(query);
  console.log(`TOTAL NON-ACTIVATED ASSISTED REGISTRATIONS: ${res.rows.length}`);
  
  const olderThan15h = res.rows.filter(r => Number(r.age_hours) >= 15);
  console.log(`OLDER THAN 15 HOURS: ${olderThan15h.length}`);
  for (const r of olderThan15h) {
    console.log(`- ${r.establishment_name} (age: ${r.age_hours}h, lead_stage: ${r.lead_stage}, menu_status: ${r.menu_status}, continuity: ${r.continuity_confirmed})`);
  }

  await client.end();
}

main().catch(console.error);

