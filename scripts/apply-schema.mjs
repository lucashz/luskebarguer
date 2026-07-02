import { spawn } from 'node:child_process';

const child = spawn('npx.cmd', ['prisma', 'migrate', 'deploy'], {
  stdio: 'inherit',
  shell: process.platform === 'win32'
});

child.on('exit', (code) => process.exit(code || 0));

