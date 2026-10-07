import pg from 'pg';

const email = String(process.argv[2] || '').trim().toLowerCase();
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
try {
  const result = await pool.query(`
    select ar.id, ar.status, ar.email_status, ar.updated_at,
      count(distinct arf.id)::int as file_count,
      coalesce(array_agg(distinct arf.mime_type) filter (where arf.id is not null), '{}') as file_types,
      amd.id is not null as has_draft,
      coalesce(jsonb_array_length(amd.content->'categories'), 0) as category_count,
      amd.version as draft_version,
      amd.reviewed_at
    from assisted_registrations ar
    left join assisted_registration_files arf on arf.registration_id=ar.id
    left join assisted_menu_drafts amd on amd.registration_id=ar.id
    where lower(ar.email)=$1
    group by ar.id, amd.id
    order by ar.updated_at desc
    limit 1
  `, [email]);
  console.log(JSON.stringify({ openai_configured: Boolean(process.env.OPENAI_API_KEY), registration: result.rows[0] || null }));
} finally {
  await pool.end();
}
