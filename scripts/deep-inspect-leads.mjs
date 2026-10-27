import { getLocalPool } from '../src/lib/local-postgrest-adapter.js';
const pool = getLocalPool();

async function main() {
  const allLeads = await pool.query(`
    SELECT id, business_name, phone, city, state, segment, stage, last_contact_at, attempt_count,
           metadata->>'menu_url' as menu_url
    FROM sales_leads
    ORDER BY created_at ASC
  `);
  console.log(`Total leads in DB: ${allLeads.rowCount}`);
  
  // Count by stage
  const byStage = {};
  for (const l of allLeads.rows) {
    byStage[l.stage] = (byStage[l.stage] || 0) + 1;
  }
  console.log('By stage:', byStage);

  // Check uncontacted leads
  const uncontacted = allLeads.rows.filter(l => !l.last_contact_at && l.attempt_count === 0);
  console.log(`Uncontacted leads: ${uncontacted.length}`);

  // Inspect their phone formats
  const phoneTypes = { mobile: 0, landline: 0, nullPhone: 0, other: 0 };
  const mobiles = [];
  for (const l of uncontacted) {
    if (!l.phone) phoneTypes.nullPhone++;
    else if (/^55\d{2}9\d{8}$/.test(l.phone)) {
      phoneTypes.mobile++;
      mobiles.push(l);
    } else if (/^55\d{2}[2-5]\d{7}$/.test(l.phone)) phoneTypes.landline++;
    else phoneTypes.other++;
  }
  console.log('Uncontacted phone types:', phoneTypes);

  console.log('\nAll uncontacted mobiles:');
  console.table(mobiles.map(m => ({
    id: m.id.slice(0, 8),
    name: m.business_name,
    city: `${m.city}/${m.state}`,
    phone: m.phone,
    stage: m.stage,
    menu: Boolean(m.menu_url)
  })));

  await pool.end();
}

main().catch(console.error);

