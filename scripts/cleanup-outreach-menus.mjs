import { getLocalPool } from '../src/lib/local-postgrest-adapter.js';
import { cleanupExpiredOutreachMenus } from '../src/lib/outreach-menu-lifecycle.js';

try { process.loadEnvFile?.('.env'); } catch {}

const args = new Set(process.argv.slice(2));
const apply = args.has('--apply');
const daysArg = process.argv.find((arg) => arg.startsWith('--days='));
const days = daysArg ? Number(daysArg.split('=')[1]) : 2;

const pool = getLocalPool();

async function main() {
  console.log(`[outreach-menu-cleanup] Verificando cardápios criados com mais de ${days} dias sem continuidade...`);
  console.log(`[outreach-menu-cleanup] Modo: ${apply ? 'APLICAR EXCLUSÃO' : 'SIMULAÇÃO (dry-run)'}`);

  const result = await cleanupExpiredOutreachMenus({ pool, dryRun: !apply, days });
  console.log(JSON.stringify(result, null, 2));

  if (!apply && result.candidates?.length) {
    console.log(`\nPara excluir estes ${result.candidates.length} cardápio(s), execute com a flag --apply`);
  }
}

main()
  .catch((err) => {
    console.error('[outreach-menu-cleanup] Erro:', err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end().catch(() => {});
  });

