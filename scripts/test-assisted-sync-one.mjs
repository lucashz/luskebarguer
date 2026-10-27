import { getLocalPool } from '../src/lib/local-postgrest-adapter.js';
import { syncLeadToAssistedRegistration } from '../src/lib/outreach-menu-lifecycle.js';

try { process.loadEnvFile?.('.env'); } catch {}

const pool = getLocalPool();

async function main() {
  const leadRes = await pool.query(`
    SELECT * FROM sales_leads WHERE metadata->>'menu_slug' = 'boteco-do-bakana' LIMIT 1
  `);
  const lead = leadRes.rows[0];
  console.log('Testing assisted registration sync for:', lead.business_name);

  const syncResult = await syncLeadToAssistedRegistration({
    leadId: lead.id,
    lead,
    pool,
    actor: 'schedule_20261020'
  });

  console.log('Sync result:', {
    ok: syncResult?.ok,
    registrationId: syncResult?.registration?.id,
    status: syncResult?.registration?.status,
    establishmentName: syncResult?.registration?.establishment_name,
    hasDraft: Boolean(syncResult?.registration?.draft_menu)
  });

  await pool.end();
}

main().catch(console.error);
