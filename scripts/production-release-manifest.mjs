import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ALLOWED_ROOT_FILES = new Set([
  '.env.example',
  '.env.production.example',
  'Dockerfile.outreach',
  'README.md',
  'docker-compose.yml',
  'package-lock.json',
  'package.json',
  'server.js'
]);

const ALLOWED_DIRECTORIES = [
  'deploy/',
  'marketing-studio/',
  'prisma/',
  'public/',
  'scripts/',
  'src/',
  'supabase/'
];

const SENSITIVE_PATHS = [
  /(^|\/)\.env(?:$|\.)/i,
  /(^|\/)\.deploy(?:\/|$)/i,
  /(^|\/)\.deploy-backups(?:\/|$)/i,
  /(^|\/)\.chrome[^/]*(?:\/|$)/i,
  /(^|\/)backups?(?:\/|$)/i,
  /(^|\/)private-uploads?(?:\/|$)/i,
  /(^|\/)uploads?(?:\/|$)/i,
  /recovery[-_]?key/i,
  /\.before[-_.]/i,
  /\.backup(?:[-_.]|$)/i,
  /\.(?:bundle|dump|key|pem|p12|pfx|tar\.gz)$/i
];

export function buildProductionReleaseManifest({ rootDir }) {
  const root = path.resolve(rootDir);
  const output = execFileSync('git', ['ls-files', '-z'], {
    cwd: root,
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024
  });
  const tracked = output.split('\0').filter(Boolean).map(normalizePath).sort();
  const rejected = tracked.filter(isSensitivePath);
  const files = tracked.filter((file) => !isSensitivePath(file) && isAllowedReleasePath(file));
  return { files, rejected };
}

export function isSensitivePath(file) {
  const normalized = normalizePath(file);
  if (normalized === '.env.example' || normalized === '.env.production.example') return false;
  return SENSITIVE_PATHS.some((pattern) => pattern.test(normalized));
}

export function isAllowedReleasePath(file) {
  const normalized = normalizePath(file);
  return ALLOWED_ROOT_FILES.has(normalized) || ALLOWED_DIRECTORIES.some((prefix) => normalized.startsWith(prefix));
}

function normalizePath(value) {
  return String(value || '').replaceAll('\\', '/').replace(/^\.\//, '');
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : '';
if (invokedPath === fileURLToPath(import.meta.url)) {
  const rootDir = path.resolve(process.argv[2] || process.cwd());
  const manifest = buildProductionReleaseManifest({ rootDir });
  process.stdout.write(`${JSON.stringify(manifest, null, 2)}\n`);
  if (manifest.rejected.length) process.exitCode = 1;
}
