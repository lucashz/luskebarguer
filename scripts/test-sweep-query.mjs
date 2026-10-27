import pg from 'pg';

async function main() {
  const client = new pg.Client({
    connectionString: 'postgresql://cardapio_user:ca3b7539eb748218ad8c652ae489f7087d42360367a9470d@localhost:5433/cardapio?schema=public'
  });
  await client.connect();

  const cutoffHours = 15;
  const selectQuery = `
    SELECT ar.id, ar.establishment_name, ar.status, ar.created_at
    FROM assisted_registrations ar
    WHERE ar.status NOT IN ('published', 'activated')
      AND (
        -- store was set but does not exist in stores table
        (ar.store_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM stores s WHERE s.id = ar.store_id))
        -- or store_id is null and registration is older than cutoffHours
        OR (ar.store_id IS NULL AND ar.created_at <= NOW() - ($1 || ' hours')::interval)
        -- or linked to an expired or deleted lead
        OR EXISTS (
          SELECT 1 FROM sales_leads sl 
          WHERE (sl.id = (CASE WHEN ar.attribution->>'lead_id' ~ '^[0-9a-fA-F-]{36}$' THEN (ar.attribution->>'lead_id')::uuid ELSE NULL END)
                 OR sl.metadata->>'registration_id' = ar.id::text)
            AND (
              COALESCE(sl.metadata->>'menu_status', '') = 'deleted'
              OR (
                sl.last_contact_at <= NOW() - ($1 || ' hours')::interval
                AND COALESCE((sl.metadata->>'continuity_confirmed')::boolean, false) = false
                AND COALESCE((sl.metadata->>'is_showcase')::boolean, false) = false
                AND COALESCE((sl.metadata->>'do_not_delete')::boolean, false) = false
                AND sl.stage NOT IN ('qualified', 'engaged', 'demo_requested', 'won', 'showcase')
              )
            )
        )
      )
  `;

  const preview = await client.query(selectQuery, [cutoffHours]);
  console.log(`Found ${preview.rows.length} orphaned/expired assisted registrations:`);
  for (const r of preview.rows) {
    console.log(`- [${r.id}] ${r.establishment_name} (${r.created_at})`);
  }

  await client.end();
}

main().catch(console.error);

