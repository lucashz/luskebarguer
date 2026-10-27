import { execSync } from 'node:child_process';
import path from 'node:path';

const targetDirs = [
  'cervejaria-enigma-enigma-british-4f54fa98',
  'via-daros-padaria-e-confeitaria-a3897392',
  'cantina-roman-e8b421c2',
  'open-house-beer-edb7c40b',
  'bar-route-66-ee482c4f'
];

const runId = 'c12390a3-73df-4c0c-971a-738547ecda14';

console.log('Iniciando sincronização das novas prévias com a VM e com a Produção...');

for (const dir of targetDirs) {
  const localDir = path.resolve(`artifacts/outreach/automated/${runId}/${dir}`);
  const desktopFile = path.join(localDir, 'menu-preview.png').replace(/\\/g, '/');
  const mobileFile = path.join(localDir, 'menu-preview-mobile.png').replace(/\\/g, '/');

  console.log(`\nSincronizando ${dir}:`);

  // 1. VM
  const vmTarget = `root@192.168.1.108:/var/lib/docker/volumes/tapronto_outreach_artifacts/_data/${runId}/${dir}/`;
  try {
    execSync(`scp -o BatchMode=yes "${desktopFile}" "${mobileFile}" "${vmTarget}"`, { stdio: 'inherit' });
    console.log(`  ✓ Copiado para VM`);
  } catch (err) {
    console.error(`  ❌ Erro ao copiar para VM: ${err.message}`);
  }

  // 2. Produção
  const prodTarget = `lucas@130.51.23.180:/var/www/artifacts/outreach/automated/${runId}/${dir}/`;
  try {
    execSync(`scp -o BatchMode=yes "${desktopFile}" "${mobileFile}" "${prodTarget}"`, { stdio: 'inherit' });
    console.log(`  ✓ Copiado para Produção`);
  } catch (err) {
    console.error(`  ❌ Erro ao copiar para Produção: ${err.message}`);
  }
}

console.log('\nSincronização concluída com sucesso!');

