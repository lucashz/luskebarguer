import { spawn } from 'node:child_process';

const child = spawn('npx.cmd', ['prisma', 'migrate', 'deploy'], {
  stdio: 'inherit',
  shell: false
});

child.on('exit', (code) => process.exit(code || 0));
