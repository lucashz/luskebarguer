import { getLocalPool } from '../src/lib/local-postgrest-adapter.js';
import { cleanupExpiredOutreachMenus } from '../src/lib/outreach-menu-lifecycle.js';

try { process.loadEnvFile?.('.env'); } catch {}

const pool = getLocalPool();

async function main() {
  console.log('=== EXECUÇÃO DA REGRA DE 15 HORAS: LIMPEZA DE CARDÁPIOS EXPIRADOS ===\n');

  // 1. Diagnóstico preliminar (Dry Run)
  console.log('Varrendo leads contatados há mais de 15 horas sem continuidade...');
  const preview = await cleanupExpiredOutreachMenus({ pool, dryRun: true, hours: 15 });

  console.log(`Leads encontrados elegíveis para exclusão: ${preview.scanned}`);
  if (preview.scanned > 0) {
    console.log('\nLista de candidatos a limpeza:');
    for (const c of preview.candidates) {
      console.log(` - ${c.business_name} (Último contato: ${new Date(c.last_contact_at).toLocaleString('pt-BR')}) | URL: ${c.menu_url}`);
    }

    // 2. Executar limpeza real
    console.log('\nIniciando exclusão segura dos cardápios expirados...');
    const result = await cleanupExpiredOutreachMenus({ pool, dryRun: false, hours: 15 });
    console.log(`\nResultado da limpeza:`);
    console.log(`Processados: ${result.processed}`);
    for (const r of result.results) {
      if (r.success) {
        console.log(` ✅ ${r.business_name}: Cardápio excluído com sucesso (loja removida: ${r.storeDeleted})`);
      } else {
        console.log(` ⚠️ ${r.business_name}: Falha (${r.error})`);
      }
    }
  } else {
    console.log('Nenhum lead com cardápio pendente de exclusão no momento.');
  }

  console.log('\n========================================');
  console.log('✅ CICLO DE LIMPEZA DE 15 HORAS FINALIZADO!');
  console.log('========================================\n');

  await pool.end();
}

main().catch(console.error);

