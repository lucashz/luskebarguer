import { execSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const logDir = path.resolve(rootDir, 'logs');
if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true });

const daemonScript = path.resolve(rootDir, 'scripts/autonomous-daily-outreach.mjs');
const logFile = path.resolve(logDir, 'outreach-daemon.log');
const pidFile = path.resolve(logDir, 'outreach-agent.pid');

function isAgentRunning() {
  try {
    const stdout = execSync('pgrep -f "autonomous-daily-outreach.mjs"', { encoding: 'utf8' }).trim();
    const pids = stdout.split(/\s+/).filter(Boolean);
    return pids.length > 0 ? pids[0] : null;
  } catch {
    return null;
  }
}

const runningPid = isAgentRunning();
if (runningPid) {
  console.log(`[Watchdog ${new Date().toISOString()}] Outreach Agent ativo (PID: ${runningPid}).`);
  process.exit(0);
}

console.log(`[Watchdog ${new Date().toISOString()}] Outreach Agent parado. Reiniciando em background...`);

const out = fs.openSync(logFile, 'a');
const child = spawn(process.execPath, [daemonScript], {
  cwd: rootDir,
  detached: true,
  stdio: ['ignore', out, out],
  env: process.env
});

child.unref();

fs.writeFileSync(pidFile, String(child.pid), 'utf8');
console.log(`[Watchdog ${new Date().toISOString()}] Outreach Agent iniciado com sucesso (PID: ${child.pid}). Log: ${logFile}`);
