import assert from 'node:assert/strict';

let policy = null;
try {
  policy = await import('../src/lib/maintenance-policy.js');
} catch {}

assert.equal(typeof policy?.isManagedBackupFile, 'function', 'A retenção precisa reconhecer os backups compactados gerados em produção.');
assert.equal(policy.isManagedBackupFile('postgres-2026-09-21T23-07-42.dump.gz'), true);
assert.equal(policy.isManagedBackupFile('backup-status.json'), false);

assert.equal(typeof policy?.trialDeletionCutoff, 'function', 'A limpeza de trials precisa usar um período de segurança após a expiração.');
assert.equal(
  policy.trialDeletionCutoff(new Date('2026-09-22T12:00:00.000Z'), 14).toISOString(),
  '2026-09-08T12:00:00.000Z'
);

console.log('Maintenance policy smoke: OK');
