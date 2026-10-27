import { getLocalPool } from '../src/lib/local-postgrest-adapter.js';
import { confirmLeadContinuity } from '../src/lib/outreach-menu-lifecycle.js';

const pool = getLocalPool();

// Test with Refugio Gourmet
const lead = (await pool.query("SELECT * FROM sales_leads WHERE business_name ILIKE '%ref%gio%' LIMIT 1")).rows[0];
console.log('Testing confirmLeadContinuity on:', lead.business_name);

const res = await confirmLeadContinuity({
  leadId: lead.id,
  pool,
  actor: 'test_admin'
});

console.log('Result:');
console.log('ok:', res.ok);
console.log('registrationId:', res.registrationId);
console.log('lead stage:', res.lead?.stage);
console.log('continuity_confirmed:', res.lead?.metadata?.continuity_confirmed);
console.log('menu_status:', res.lead?.metadata?.menu_status);

await pool.end();
