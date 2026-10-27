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
      COALESCE((sl.metadata->>'continuity_confirmed')::boolean, false) AS continuity_confirmed,
      COALESCE((sl.metadata->>'is_showcase')::boolean, false) AS is_showcase,
      COALESCE(sl.metadata->>'menu_status', '') AS menu_status
    FROM assisted_registrations ar
    LEFT JOIN sales_leads sl ON (
      sl.id = (CASE WHEN ar.attribution->>'lead_id' ~ '^[0-9a-fA-F-]{36}$' THEN (ar.attribution->>'lead_id')::uuid ELSE NULL END)
      OR sl.metadata->>'registration_id' = ar.id::text
      OR sl.metadata->>'store_id' = ar.store_id::text
    )
    WHERE ar.status NOT IN ('published', 'activated')
    ORDER BY ar.created_at ASC
  `;

  const res = await client.query(query);
  console.log(`TOTAL NON-PUBLISHED/ACTIVATED: ${res.rows.length}`);
  
  const toDelete = res.rows.filter(r => {
    // If it's showcase or continuity confirmed, keep
    if (r.is_showcase || r.continuity_confirmed) return false;
    // If store already deleted
    if (r.menu_status === 'deleted') return true;
    // If contact or registration was more than 15 hours ago
    const contactAge = r.contact_age_hours ? Number(r.contact_age_hours) : null;
    const regAge = Number(r.age_hours);
    if (contactAge !== null && contactAge >= 15) return true;
    if (contactAge === null && regAge >= 15) return true;
    return false;
  });

  console.log(`ELIGIBLE FOR 15H CLEANUP: ${toDelete.length}`);
  for (const r of toDelete) {
    console.log(`- [${r.id}] ${r.establishment_name} | age: ${r.age_hours}h | contact: ${r.contact_age_hours}h | lead_stage: ${r.lead_stage} | menu_status: ${r.menu_status}`);
  }

  await client.end();
}

main().catch(console.error);

