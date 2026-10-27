import fs from 'node:fs';
import path from 'node:path';

const worktreeDir = 'D:/lsk/TáProntomenu.com.br/.worktrees/release-production-outreach-20261014';

console.log('Iniciando aplicação das refatorações do pipeline de outbound...');

// --------------------------------------------------------------------------
// 1. Atualizar src/lib/sales-automation.js
// --------------------------------------------------------------------------
const salesAutoPath = path.join(worktreeDir, 'src/lib/sales-automation.js');
let salesAuto = fs.readFileSync(salesAutoPath, 'utf8');

salesAuto = salesAuto.replace(
  /export function initialSalesMessage\(lead = \{\}\) \{[\s\S]*?return `Oi, tudo bem\? Falo com quem cuida dos pedidos da \$\{business\}\? Vi o trabalho de vocês aqui em \$\{city\} e queria fazer uma pergunta rápida\.`;\s*\}/,
  `export function initialSalesMessage(lead = {}) {
  const business = clean(lead.business_name || lead.businessName || 'estabelecimento');
  return \`Oi, tudo bem? Falo com quem cuida dos pedidos da \${business}? Vi o trabalho de vocês e queria fazer uma pergunta rápida.\`;
}`
);

fs.writeFileSync(salesAutoPath, salesAuto, 'utf8');
console.log('✓ src/lib/sales-automation.js atualizado');

// --------------------------------------------------------------------------
// 2. Atualizar src/lib/outreach-metrics.js (Validade 72h)
// --------------------------------------------------------------------------
const metricsPath = path.join(worktreeDir, 'src/lib/outreach-metrics.js');
let metrics = fs.readFileSync(metricsPath, 'utf8');

metrics = metrics.replace(
  /const expiresAt = lastContact \? new Date\(lastContact\.getTime\(\) \+ 15 \* 3600000\)\.toISOString\(\) : null;/,
  'const expiresAt = lastContact ? new Date(lastContact.getTime() + 72 * 3600000).toISOString() : null;'
);

fs.writeFileSync(metricsPath, metrics, 'utf8');
console.log('✓ src/lib/outreach-metrics.js atualizado (72h)');

// --------------------------------------------------------------------------
// 3. Atualizar src/lib/outreach-menu-lifecycle.js (Validade 72h)
// --------------------------------------------------------------------------
const lifecyclePath = path.join(worktreeDir, 'src/lib/outreach-menu-lifecycle.js');
let lifecycle = fs.readFileSync(lifecyclePath, 'utf8');

lifecycle = lifecycle.replace(
  /export async function cleanupExpiredOutreachMenus\(\{ pool = null, dryRun = false, hours = 15, days = null \}\)/,
  'export async function cleanupExpiredOutreachMenus({ pool = null, dryRun = false, hours = 72, days = null })'
);

lifecycle = lifecycle.replace(
  /const cutoffHours = \(days !== null && days !== undefined\) \? Math\.max\(1, Number\(days\) \* 24\) : Math\.max\(1, Number\(hours\) \|\| 15\);/,
  'const cutoffHours = (days !== null && days !== undefined) ? Math.max(1, Number(days) * 24) : Math.max(1, Number(hours) || 72);'
);

lifecycle = lifecycle.replace(
  /\/\/ Sweep any orphaned or lingering assisted registrations that expired after 15h/,
  '// Sweep any orphaned or lingering assisted registrations that expired after 72h'
);

fs.writeFileSync(lifecyclePath, lifecycle, 'utf8');
console.log('✓ src/lib/outreach-menu-lifecycle.js atualizado (72h)');

// --------------------------------------------------------------------------
// 4. Atualizar public/platform-outreach.js (Exibição 72h / Xd)
// --------------------------------------------------------------------------
const platformOutreachPath = path.join(worktreeDir, 'public/platform-outreach.js');
let platformOutreach = fs.readFileSync(platformOutreachPath, 'utf8');

platformOutreach = platformOutreach.replace(
  /actionsCell = openAssistedBtn \|\| `<small class="muted">Prazo de 15h expirou<\/small>`;/,
  'actionsCell = openAssistedBtn || `<small class="muted">Prazo de 72h expirou</small>`;'
);

platformOutreach = platformOutreach.replace(
  /const expText = hours !== null \? \(hours > 0 \? `Expira em \${hours}h` : 'Expirando'\) : 'Ativo \(15h\)';/,
  `const expText = hours !== null
                    ? (hours > 24 ? \`Ativo (\${Math.floor(hours / 24)}d)\` : (hours > 0 ? \`Expira em \${hours}h\` : 'Expirando'))
                    : 'Ativo (72h)';`
);

fs.writeFileSync(platformOutreachPath, platformOutreach, 'utf8');
console.log('✓ public/platform-outreach.js atualizado');

console.log('Refatorações de base aplicadas com sucesso!');

