import { spawn } from 'node:child_process';

const server = spawn(process.execPath, ['--env-file-if-exists=.env', '--no-warnings', '--watch', 'server/index.js'], {
  stdio: 'inherit',
});

const vite = spawn(process.execPath, ['./node_modules/vite/bin/vite.js'], {
  stdio: 'inherit',
});

const procs = [server, vite];

const stop = () => {
  for (const p of procs) {
    try {
      p.kill();
    } catch {}
  }
};

process.on('SIGINT', () => { stop(); process.exit(0); });
process.on('SIGTERM', () => { stop(); process.exit(0); });
server.on('exit', () => stop());
vite.on('exit', () => stop());
