import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const openteamsDir = path.join(rootDir, 'integrations', 'openteams');
const frontendDir = path.join(openteamsDir, 'frontend');
const mode = process.argv[2] || 'all';

const isWindows = process.platform === 'win32';
const corepack = isWindows ? 'corepack.cmd' : 'corepack';
const cargo = isWindows ? 'cargo.exe' : 'cargo';

function start(label, command, args, options = {}) {
  const child = spawn(command, args, {
    cwd: options.cwd,
    env: {
      ...process.env,
      ...options.env,
    },
    stdio: 'inherit',
    shell: !!options.shell,
  });

  child.on('exit', (code, signal) => {
    if (signal) {
      console.log(`[${label}] exited with signal ${signal}`);
      return;
    }
    if (code && code !== 0) {
      console.error(`[${label}] exited with code ${code}`);
      process.exitCode = code;
    }
  });

  return child;
}

function startBackend() {
  return start('openteams-backend', cargo, ['run', '--bin', 'server'], {
    cwd: openteamsDir,
    env: {
      BACKEND_PORT: process.env.BACKEND_PORT || '43101',
      HOST: process.env.HOST || '127.0.0.1',
      RUST_LOG: process.env.RUST_LOG || 'info',
    },
  });
}

function startFrontend() {
  return start('openteams-frontend', `${corepack} pnpm run dev`, [], {
    cwd: frontendDir,
    shell: true,
    env: {
      BACKEND_PORT: process.env.BACKEND_PORT || '43101',
      FRONTEND_PORT: process.env.FRONTEND_PORT || '43100',
      VITE_OPEN: process.env.VITE_OPEN || 'false',
    },
  });
}

const children = [];

if (mode === 'backend') {
  children.push(startBackend());
} else if (mode === 'frontend') {
  children.push(startFrontend());
} else if (mode === 'all' || mode === 'dev') {
  children.push(startBackend());
  children.push(startFrontend());
} else {
  console.error(`Unknown mode "${mode}". Use backend, frontend, or all.`);
  process.exit(1);
}

function shutdown() {
  for (const child of children) {
    if (!child.killed) child.kill('SIGINT');
  }
}

process.on('SIGINT', () => {
  shutdown();
  process.exit(130);
});

process.on('SIGTERM', () => {
  shutdown();
  process.exit(143);
});
