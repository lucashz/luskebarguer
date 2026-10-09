import { spawnSync } from 'node:child_process';

const checks = [
  ['Contrato de proveniência', 'node', ['scripts/registration-provenance-test.mjs']],
  ['Migração e banco local', 'node', ['scripts/local-db-smoke.mjs']],
  ['Cadastro público e acesso direto', 'node', ['scripts/core-flow-smoke.mjs']],
  ['Cadastro assistido e criação manual', 'node', ['scripts/assisted-registration-api-smoke.mjs']],
  ['Filtros, detalhe e timeline', 'node', ['scripts/platform-client-query-regression.mjs']],
  ['Exclusões das métricas', 'node', ['scripts/platform-metrics-exclusions-smoke.mjs']],
  ['Login direto e impersonação', 'node', ['scripts/security-hardening-smoke.mjs']],
  ['Autenticação 2FA e acesso direto', 'node', ['scripts/customer-access-2fa-smoke.mjs']],
  ['Impersonação real e auditoria operacional', 'node', ['scripts/platform-health-smoke.mjs']],
  ['Interface de rastreabilidade', 'node', ['scripts/registration-provenance-ui-smoke.mjs']]
];

for (const [label, command, args] of checks) {
  process.stdout.write(`\n[proveniência] ${label}\n`);
  const result = spawnSync(command, args, { cwd: process.cwd(), env: process.env, stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status || 1);
}

console.log('\nRegistration provenance release regression: OK');
