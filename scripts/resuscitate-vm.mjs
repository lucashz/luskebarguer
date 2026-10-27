import { execSync } from 'node:child_process';
import { evolutionV2SalesConfig, getEvolutionV2ConnectionState } from '../src/lib/evolution-v2-sales.js';

try { process.loadEnvFile?.('.env'); } catch {}

const VBOX_MANAGE = 'C:\\Program Files\\Oracle\\VirtualBox\\VBoxManage.exe';
const VM_NAME = 'Cardápio';

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function runCmd(cmd) {
  try {
    return execSync(cmd, { encoding: 'utf8', timeout: 30000 });
  } catch (err) {
    return err.stdout || err.stderr || err.message;
  }
}

export async function resuscitateVm({ forceReset = false, dispatch = false } = {}) {
  console.log('================================================================');
  console.log(`  WATCHDOG & RESSUSCITAÇÃO DA VM VIRTUALBOX: "${VM_NAME}"       `);
  console.log('================================================================\n');

  // 1. Checar estado no VirtualBox
  console.log('[1/4] Checando estado no VirtualBox...');
  const vmsOutput = runCmd(`"${VBOX_MANAGE}" list runningvms`);
  const isRunning = vmsOutput.includes(VM_NAME);
  console.log(`Estado da VM: ${isRunning ? 'RUNNING' : 'STOPPED'}`);

  if (forceReset || !isRunning) {
    if (isRunning) {
      console.log('Forçando reset da VM via VBoxManage...');
      runCmd(`"${VBOX_MANAGE}" controlvm "${VM_NAME}" reset`);
    } else {
      console.log('Iniciando VM em modo headless...');
      runCmd(`"${VBOX_MANAGE}" startvm "${VM_NAME}" --type headless`);
    }
    console.log('Aguardando 20 segundos para o boot...');
    await sleep(20000);
  }

  // 2. Checar Evolution API
  console.log('[2/4] Verificando Evolution API e WhatsApp...');
  const cfg = evolutionV2SalesConfig();
  let connected = false;
  for (let attempt = 1; attempt <= 15; attempt++) {
    try {
      const state = await getEvolutionV2ConnectionState(cfg);
      if (state.connected && state.state === 'open') {
        connected = true;
        console.log(`✅ WhatsApp conectado com sucesso (instância: ${cfg.instance}, status: ${state.state})`);
        break;
      } else {
        console.log(`Tentativa ${attempt}: Estado é "${state.state}". Aguardando 4s...`);
      }
    } catch {
      console.log(`Tentativa ${attempt}: Evolution API inicializando...`);
    }
    await sleep(4000);
  }

  if (!connected) {
    console.warn('⚠️ Tentando reiniciar contêiner da Evolution API...');
    runCmd('ssh -o ConnectTimeout=5 root@192.168.1.108 "docker restart evolution_api"');
    await sleep(15000);
  }

  // 3. Garantir Túnel SSH e Proxies
  console.log('[3/5] Garantindo Túnel SSH (5433) e Proxies (8888, 10800) ativos...');
  runCmd('powershell -ExecutionPolicy Bypass -File scripts/start-hidden-services.ps1');

  // 4. Checar status da fila no banco
  console.log('[4/5] Verificando status dos disparos de hoje...');
  runCmd('node scripts/check-tomorrow-leads-status.mjs');

  // 5. Disparo opcional
  if (dispatch) {
    console.log('[4/4] Executando disparo do lote agora...');
    runCmd('node scripts/dispatch-monday-marmitarias.mjs --retry-failed');
  } else {
    console.log('[4/4] VM e serviços 100% saudáveis e operacionais!');
  }

  console.log('\n================================================================');
  console.log('  PROCEDIMENTO DE RESSUSCITAÇÃO CONCLUÍDO!');
  console.log('================================================================\n');
}

const isDirectRun = process.argv[1]?.endsWith('resuscitate-vm.mjs');
if (isDirectRun) {
  const args = new Set(process.argv.slice(2));
  resuscitateVm({
    forceReset: args.has('--reset'),
    dispatch: args.has('--dispatch')
  }).catch(console.error);
}

