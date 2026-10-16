import assert from 'node:assert/strict';
import { getLocalPool } from '../src/lib/local-postgrest-adapter.js';
import {
  confirmLeadContinuity,
  deleteOutreachMenuForLead,
  cleanupExpiredOutreachMenus
} from '../src/lib/outreach-menu-lifecycle.js';

const pool = getLocalPool();

async function runSmoke() {
  console.log('--- STARTING OUTREACH MENU LIFECYCLE SMOKE ---');

  // 0. Clean any lingering smoke data
  await pool.query("DELETE FROM sales_leads WHERE business_name LIKE 'Lead test-smoke%'");
  await pool.query("DELETE FROM stores WHERE slug LIKE 'test-smoke%'");
  await pool.query("DELETE FROM companies WHERE name LIKE 'Mock Company test-smoke%'");

  // 1. Create a mock company, store, and sales_lead
  const mockSlug = `test-smoke-${Date.now()}`;
  const mockPhone = `55559${String(Date.now()).slice(-7)}`;
  const companyRes = await pool.query(
    "INSERT INTO companies (name, status, created_at, updated_at) VALUES ($1, 'active', now(), now()) RETURNING *",
    [`Mock Company ${mockSlug}`]
  );
  const company = companyRes.rows[0];

  const storeRes = await pool.query(
    "INSERT INTO stores (company_id, name, slug, description, public_url, is_active, created_at, updated_at) VALUES ($1, $2, $3, 'Smoke store', $4, true, now(), now()) RETURNING *",
    [company.id, `Mock Store ${mockSlug}`, mockSlug, `/${mockSlug}`]
  );
  const store = storeRes.rows[0];

  const leadRes = await pool.query(
    `INSERT INTO sales_leads (business_name, phone, normalized_phone, city, state, segment, source, stage, last_contact_at, metadata)
     VALUES ($1, $2, $2, 'Horizontina', 'RS', 'Padaria', 'google_outreach', 'awaiting_reply', now() - interval '3 days', $3::jsonb)
     RETURNING *`,
    [
      `Lead ${mockSlug}`,
      mockPhone,
      JSON.stringify({
        store_id: store.id,
        menu_url: `https://taprontomenu.com.br/${mockSlug}`,
        menu_slug: mockSlug
      })
    ]
  );
  const lead = leadRes.rows[0];
  console.log('✓ Created mock store and lead:', lead.id, store.id);

  // 2. Test cleanupExpiredOutreachMenus in dryRun mode
  const dryResult = await cleanupExpiredOutreachMenus({ pool, dryRun: true, days: 2 });
  assert.equal(dryResult.ok, true);
  assert.equal(dryResult.dryRun, true);
  const foundInDry = dryResult.candidates.find((c) => c.id === lead.id);
  assert.ok(foundInDry, 'Candidate should be found because last_contact_at was 3 days ago and no continuity was confirmed');
  console.log('✓ Dry-run identified expired candidate successfully');

  // 3. Test confirmLeadContinuity
  const confirmed = await confirmLeadContinuity({ leadId: lead.id, pool, actor: 'lucas@admin.com' });
  assert.equal(confirmed.ok, true);
  assert.equal(confirmed.lead.metadata.continuity_confirmed, true);
  assert.equal(confirmed.lead.metadata.continuity_confirmed_by, 'lucas@admin.com');
  assert.equal(confirmed.lead.stage, 'engaged');
  console.log('✓ Continuity confirmed successfully, stage updated to engaged');

  // 4. Verify that with continuity confirmed, cleanupExpiredOutreachMenus does NOT select this lead
  const dryResultAfterConfirm = await cleanupExpiredOutreachMenus({ pool, dryRun: true, days: 2 });
  const foundAfterConfirm = dryResultAfterConfirm.candidates.find((c) => c.id === lead.id);
  assert.equal(foundAfterConfirm, undefined, 'Lead with confirmed continuity must not be selected for deletion');
  console.log('✓ Confirmed lead is safely protected from auto-cleanup');

  // 5. Test deleteOutreachMenuForLead directly (e.g. manual delete or simulated non-confirmed lead)
  const mockSlug2 = `test-smoke2-${Date.now()}`;
  const mockPhone2 = `55558${String(Date.now()).slice(-7)}`;
  const storeRes2 = await pool.query(
    "INSERT INTO stores (company_id, name, slug, description, public_url, is_active, created_at, updated_at) VALUES ($1, $2, $3, 'Smoke store 2', $4, true, now(), now()) RETURNING *",
    [company.id, `Mock Store ${mockSlug2}`, mockSlug2, `/${mockSlug2}`]
  );
  const store2 = storeRes2.rows[0];

  const leadRes2 = await pool.query(
    `INSERT INTO sales_leads (business_name, phone, normalized_phone, city, state, segment, source, stage, last_contact_at, metadata)
     VALUES ($1, $2, $2, 'Horizontina', 'RS', 'Padaria', 'google_outreach', 'awaiting_reply', now() - interval '3 days', $3::jsonb)
     RETURNING *`,
    [
      `Lead ${mockSlug2}`,
      mockPhone2,
      JSON.stringify({
        store_id: store2.id,
        menu_url: `https://taprontomenu.com.br/${mockSlug2}`,
        menu_slug: mockSlug2
      })
    ]
  );
  const lead2 = leadRes2.rows[0];

  const deleteRes = await deleteOutreachMenuForLead({ leadId: lead2.id, pool, reason: 'test_expiration' });
  assert.equal(deleteRes.ok, true);
  assert.equal(deleteRes.storeDeleted, true);
  assert.equal(deleteRes.lead.metadata.menu_status, 'deleted');
  assert.equal(deleteRes.lead.stage, 'lost');

  // Verify store was removed from database
  const checkStore = await pool.query('SELECT * FROM stores WHERE id = $1', [store2.id]);
  assert.equal(checkStore.rows.length, 0, 'Store must be deleted from database');
  console.log('✓ Menu deleted cleanly, stage updated to lost, store removed from database');

  // Clean up remaining test data
  await pool.query('DELETE FROM sales_leads WHERE id IN ($1, $2)', [lead.id, lead2.id]);
  await pool.query('DELETE FROM stores WHERE id = $1', [store.id]);
  await pool.query('DELETE FROM companies WHERE id = $1', [company.id]);
  console.log('✓ Test fixtures cleaned up');

  console.log('\n--- ALL LIFECYCLE SMOKE TESTS PASSED! ---');
}

runSmoke()
  .catch((err) => {
    console.error('Smoke failed:', err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end().catch(() => {});
  });

