import { getLocalPool } from '../src/lib/local-postgrest-adapter.js';
import { syncLeadToAssistedRegistration } from '../src/lib/outreach-menu-lifecycle.js';

const pool = getLocalPool();

console.log('--- Iniciando sincronização em lote de leads de prospecção para Cadastro Assistido ---');

const leadsRes = await pool.query(`
  SELECT *
  FROM sales_leads
  WHERE metadata->>'store_id' IS NOT NULL OR metadata->>'menu_url' IS NOT NULL
  ORDER BY created_at ASC
`);

console.log(`Encontrados ${leadsRes.rows.length} leads com cardápio demonstrativo/loja.`);

let syncedCount = 0;
let errorsCount = 0;

for (const lead of leadsRes.rows) {
  try {
    const res = await syncLeadToAssistedRegistration({
      leadId: lead.id,
      lead,
      pool,
      actor: 'batch_migration'
    });
    syncedCount += 1;
    console.log(`[${syncedCount}/${leadsRes.rows.length}] ✓ ${lead.business_name} -> Registration ${res.registrationId} (${res.categoryCount} cats, ${res.itemCount} items)`);
  } catch (err) {
    errorsCount += 1;
    console.error(`[ERRO] Falha ao sincronizar lead ${lead.id} (${lead.business_name}):`, err.message);
  }
}

const finalAssistedCount = await pool.query('SELECT count(*)::int as count FROM assisted_registrations');
console.log(`\nSincronização concluída!`);
console.log(`Sucessos: ${syncedCount}`);
console.log(`Erros: ${errorsCount}`);
console.log(`Total de cadastros assistidos no banco: ${finalAssistedCount.rows[0].count}`);

await pool.end();
