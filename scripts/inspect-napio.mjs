import pg from 'pg';

if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL ausente.');
const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();
try {
  const registrations = await client.query(`
    select id, status, establishment_name, version, company_id, store_id,
           (responsible_name <> '') as has_responsible,
           (phone <> '') as has_phone,
           (email <> '') as has_email,
           (length(document_normalized) in (11,14)) as has_document
      from assisted_registrations
     where translate(lower(establishment_name), 'áàâãéêíóôõúç', 'aaaaeeiooouc') like '%napio%'
        or lower(answers::text) like '%horizontina%'
        or regexp_replace(coalesce(phone, ''), '\\D', '', 'g') like '%22440208%'
        or regexp_replace(coalesce(answers::text, ''), '\\D', '', 'g') like '%22440208%'
     order by updated_at desc
     limit 20
  `);
  const stores = await client.query(`
    select id, name, slug, is_active
      from stores
     where translate(lower(name), 'áàâãéêíóôõúç', 'aaaaeeiooouc') like '%napio%'
     order by updated_at desc
     limit 5
  `);
  const leads = await client.query(`
    select id, business_name, contact_name, phone, city, state, stage, metadata
      from sales_leads
     where translate(lower(coalesce(business_name, '')), 'áàâãéêíóôõúç', 'aaaaeeiooouc') like '%napio%'
        or lower(coalesce(city, '')) = 'horizontina'
        or regexp_replace(coalesce(phone, ''), '\\D', '', 'g') like '%22440208%'
     order by updated_at desc
     limit 5
  `);
  const registrationIds = registrations.rows.map((row) => row.id);
  const drafts = registrationIds.length ? await client.query(`
    select registration_id, version, reviewed_at,
           coalesce(jsonb_array_length(content->'categories'), 0) as categories
      from assisted_menu_drafts
     where registration_id = any($1::uuid[])
  `, [registrationIds]) : { rows: [] };
  const files = registrationIds.length ? await client.query(`
    select registration_id, count(*)::int as files
      from assisted_registration_files
     where registration_id = any($1::uuid[])
     group by registration_id
  `, [registrationIds]) : { rows: [] };
  console.log(JSON.stringify({ registrations: registrations.rows, drafts: drafts.rows, files: files.rows, stores: stores.rows, leads: leads.rows }, null, 2));
} finally {
  await client.end();
}
