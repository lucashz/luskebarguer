import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { buildProductionReleaseManifest } from './production-release-manifest.mjs';

const rootDir = await mkdtemp(path.join(tmpdir(), 'tapronto-release-manifest-'));

try {
  const files = {
    'server.js': 'console.log("ok");\n',
    'public/app.js': 'export const ok = true;\n',
    'src/lib/example.js': 'export default true;\n',
    'prisma/migrations/20261014000000_example/migration.sql': 'select 1;\n',
    '.env': 'SECRET=do-not-ship\n',
    '.deploy/recursive-release.tar.gz': 'archive',
    'backups/database.dump': 'backup',
    'artifacts/backup-email-recovery-key.txt': 'recovery-key',
    'private-uploads/customer/menu.txt': 'private',
    '.chrome-preview/Default/History': 'browser-state',
    'public/app.js.before-deploy': 'backup',
    'src/lib/example.js.backup-': 'backup'
  };

  for (const [relativePath, content] of Object.entries(files)) {
    const target = path.join(rootDir, relativePath);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, content);
  }

  execFileSync('git', ['init', '--quiet'], { cwd: rootDir, stdio: 'ignore' });
  execFileSync('git', ['-c', 'core.autocrlf=false', 'add', '--force', '.'], { cwd: rootDir, stdio: 'ignore' });

  const manifest = buildProductionReleaseManifest({ rootDir });
  assert.deepEqual(manifest.files, [
    'prisma/migrations/20261014000000_example/migration.sql',
    'public/app.js',
    'server.js',
    'src/lib/example.js'
  ]);
  assert.deepEqual(manifest.rejected, [
    '.chrome-preview/Default/History',
    '.deploy/recursive-release.tar.gz',
    '.env',
    'artifacts/backup-email-recovery-key.txt',
    'backups/database.dump',
    'private-uploads/customer/menu.txt',
    'public/app.js.before-deploy',
    'src/lib/example.js.backup-'
  ]);
  console.log('Production release manifest smoke: OK');
} finally {
  await rm(rootDir, { recursive: true, force: true });
}
