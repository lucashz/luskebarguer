import assert from 'node:assert/strict';
import { getLocalPool } from '../src/lib/local-postgrest-adapter.js';
import { cleanupExpiredOutreachMenus } from '../src/lib/outreach-menu-lifecycle.js';

try { process.loadEnvFile?.('.env'); } catch {}

const pool = getLocalPool();

async function testLifecycle() {
  console.log('[Test Lifecycle] Testando comportamento da limpeza com horas = 0 (varrendo todos)...');

  const result = await cleanupExpiredOutreachMenus({ pool, dryRun: true, hours: 0 });
  console.log(`Candidatos identificados pelo robô para exclusão: ${result.candidates.length}`);

  // Verificar se algum candidato possui is_showcase = true ou continuity_confirmed = true
  for (const c of result.candidates) {
    const check = await pool.query('SELECT metadata, city FROM sales_leads WHERE id = $1', [c.id]);
    const lead = check.rows[0];
    const isShowcase = lead.metadata?.is_showcase;
    const cont = lead.metadata?.continuity_confirmed;

    assert(!isShowcase, `ERRO CRÍTICO: Lead vitrine ${c.business_name} (${lead.city}) foi capturado para exclusão!`);
    assert(!cont, `ERRO CRÍTICO: Lead com continuidade ${c.business_name} (${lead.city}) foi capturado para exclusão!`);
  }

  console.log('✓ Blindagem validada: NENHUM cardápio vitrine/protegido é capturado para exclusão!');
  await pool.end();
}

testLifecycle().catch(err => {
  console.error('[FALHA NO TESTE]', err);
  process.exit(1);
});

