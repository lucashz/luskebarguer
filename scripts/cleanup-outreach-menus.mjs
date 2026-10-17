import { getLocalPool } from '../src/lib/local-postgrest-adapter.js';
import { cleanupExpiredOutreachMenus } from '../src/lib/outreach-menu-lifecycle.js';

try { process.loadEnvFile?.('.env'); } catch {}

const args = new Set(process.argv.slice(2));
const apply = args.has('--apply');
const hoursArg = process.argv.find((arg) => arg.startsWith('--hours='));
const daysArg = process.argv.find((arg) => arg.startsWith('--days='));
const hours = hoursArg ? Number(hoursArg.split('=')[1]) : (daysArg ? Number(daysArg.split('=')[1]) * 24 : 15);

const pool = getLocalPool();

async function main() {
  console.log(`[outreach-menu-cleanup] Verificando cardápios contatados há mais de ${hours}h sem resposta/continuidade...`);
  console.log(`[outreach-menu-cleanup] Modo: ${apply ? 'APLICAR EXCLUSÃO' : 'SIMULAÇÃO (dry-run)'}`);

  const result = await cleanupExpiredOutreachMenus({ pool, dryRun: !apply, hours });
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

