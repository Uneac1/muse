import fs from 'fs';
import net from 'net';
import path from 'path';
import { ChildProcess, spawn, spawnSync } from 'child_process';

export type OpenTeamsDependencyStatus = 'ready' | 'missing';
export type OpenTeamsProcessStatus = 'stopped' | 'starting' | 'running' | 'error';

export interface OpenTeamsStatus {
  status: OpenTeamsProcessStatus;
  sourceRoot: string;
  frontendUrl: string;
  backendUrl: string;
  frontendPort: number;
  backendPort: number;
  frontendPid: number | null;
  backendPid: number | null;
  frontendReady: boolean;
  backendReady: boolean;
  dependencies: {
    source: OpenTeamsDependencyStatus;
    frontendNodeModules: OpenTeamsDependencyStatus;
    rootNodeModules: OpenTeamsDependencyStatus;
    corepack: OpenTeamsDependencyStatus;
    cargo: OpenTeamsDependencyStatus;
  };
  commands: {
    install: string;
    prepare: string;
    dev: string;
  };
  lastError: string;
  updatedAt: string;
}

const FRONTEND_PORT = 43100;
const BACKEND_PORT = 43101;

function resolveRepoRoot() {
  return path.resolve(__dirname, '..', '..', '..');
}

function isWindows() {
  return process.platform === 'win32';
}

function commandExists(command: string, args: string[] = ['--version'], shell = false) {
  try {
    const result = spawnSync(shell ? [command, ...args].join(' ') : command, shell ? [] : args, {
      stdio: 'ignore',
      shell,
      windowsHide: true,
    });
    return !result.error && result.status === 0;
  } catch {
    return false;
  }
}

function isProcessRunning(child: ChildProcess | null) {
  return !!child && child.exitCode === null && child.signalCode === null && !child.killed;
}

function terminateProcessTree(child: ChildProcess | null) {
  if (!child?.pid || !isProcessRunning(child)) return;
  if (isWindows()) {
    spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], {
      stdio: 'ignore',
      windowsHide: true,
    });
    return;
  }
  child.kill('SIGTERM');
}

function canConnect(port: number) {
  return new Promise<boolean>((resolve) => {
    const socket = net.createConnection({ host: '127.0.0.1', port });
    const finish = (ok: boolean) => {
      socket.removeAllListeners();
      socket.destroy();
      resolve(ok);
    };
    socket.setTimeout(500);
    socket.once('connect', () => finish(true));
    socket.once('timeout', () => finish(false));
    socket.once('error', () => finish(false));
  });
}

export class OpenTeamsService {
  private backendProcess: ChildProcess | null = null;
  private frontendProcess: ChildProcess | null = null;
  private status: OpenTeamsProcessStatus = 'stopped';
  private lastError = '';

  private rootDir = resolveRepoRoot();
  private sourceRoot = path.join(this.rootDir, 'integrations', 'openteams');
  private frontendDir = path.join(this.sourceRoot, 'frontend');

  get frontendUrl() {
    return `http://127.0.0.1:${FRONTEND_PORT}`;
  }

  get backendUrl() {
    return `http://127.0.0.1:${BACKEND_PORT}`;
  }

  private getCorepackCommand() {
    return isWindows() ? 'corepack.cmd' : 'corepack';
  }

  private getCargoCommand() {
    return isWindows() ? 'cargo.exe' : 'cargo';
  }

  private buildDependencies(): OpenTeamsStatus['dependencies'] {
    return {
      source: fs.existsSync(path.join(this.sourceRoot, 'package.json')) ? 'ready' : 'missing',
      frontendNodeModules: fs.existsSync(path.join(this.frontendDir, 'node_modules')) ? 'ready' : 'missing',
      rootNodeModules: fs.existsSync(path.join(this.sourceRoot, 'node_modules')) ? 'ready' : 'missing',
      corepack: commandExists('corepack', ['--version'], true) ? 'ready' : 'missing',
      cargo: commandExists(this.getCargoCommand(), ['--version']) ? 'ready' : 'missing',
    };
  }

  private assertStartable() {
    const dependencies = this.buildDependencies();
    const missing = Object.entries(dependencies)
      .filter(([, status]) => status === 'missing')
      .map(([name]) => name);
    if (missing.length) {
      throw new Error(`OpenTeams 依赖未就绪：${missing.join(', ')}。请先运行 npm run openteams:install；首次运行还需要 npm run openteams:prepare。`);
    }
  }

  private attachProcess(label: 'backend' | 'frontend', child: ChildProcess) {
    const onOutput = (chunk: Buffer) => {
      const text = chunk.toString('utf8').trim();
      if (!text) return;
      if (/error|failed|panic/i.test(text)) {
        this.lastError = `[${label}] ${text.slice(-1200)}`;
      }
    };

    child.stdout?.on('data', onOutput);
    child.stderr?.on('data', onOutput);
    child.once('error', (error) => {
      this.status = 'error';
      this.lastError = `[${label}] ${error.message}`;
    });
    child.once('exit', (code, signal) => {
      if (label === 'backend') this.backendProcess = null;
      if (label === 'frontend') this.frontendProcess = null;
      if (code && code !== 0) {
        this.status = 'error';
        this.lastError = `[${label}] exited with code ${code}`;
        return;
      }
      if (signal && signal !== 'SIGINT' && signal !== 'SIGTERM') {
        this.status = 'error';
        this.lastError = `[${label}] exited with signal ${signal}`;
        return;
      }
      if (!isProcessRunning(this.backendProcess) && !isProcessRunning(this.frontendProcess) && this.status !== 'error') {
        this.status = 'stopped';
      }
    });
  }

  async getStatus(): Promise<OpenTeamsStatus> {
    const backendRunning = isProcessRunning(this.backendProcess);
    const frontendRunning = isProcessRunning(this.frontendProcess);
    const backendReady = await canConnect(BACKEND_PORT);
    const frontendReady = await canConnect(FRONTEND_PORT);

    if (frontendRunning && backendRunning && frontendReady && backendReady) {
      this.status = 'running';
    } else if ((frontendRunning || backendRunning) && this.status !== 'error') {
      this.status = 'starting';
    } else if (!frontendRunning && !backendRunning && this.status !== 'error') {
      this.status = 'stopped';
    }

    return {
      status: this.status,
      sourceRoot: this.sourceRoot,
      frontendUrl: this.frontendUrl,
      backendUrl: this.backendUrl,
      frontendPort: FRONTEND_PORT,
      backendPort: BACKEND_PORT,
      frontendPid: frontendRunning ? this.frontendProcess?.pid || null : null,
      backendPid: backendRunning ? this.backendProcess?.pid || null : null,
      frontendReady,
      backendReady,
      dependencies: this.buildDependencies(),
      commands: {
        install: 'npm run openteams:install',
        prepare: 'npm run openteams:prepare',
        dev: 'npm run openteams:dev',
      },
      lastError: this.lastError,
      updatedAt: new Date().toISOString(),
    };
  }

  async start(): Promise<OpenTeamsStatus> {
    this.assertStartable();
    this.lastError = '';
    this.status = 'starting';

    if (!isProcessRunning(this.backendProcess)) {
      const child = spawn(this.getCargoCommand(), ['run', '--bin', 'server'], {
        cwd: this.sourceRoot,
        env: {
          ...process.env,
          BACKEND_PORT: String(BACKEND_PORT),
          HOST: '127.0.0.1',
          RUST_LOG: process.env.RUST_LOG || 'info',
        },
        stdio: ['ignore', 'pipe', 'pipe'],
        windowsHide: true,
      });
      this.backendProcess = child;
      this.attachProcess('backend', child);
    }

    if (!isProcessRunning(this.frontendProcess)) {
      const child = spawn('corepack pnpm run dev', [], {
        cwd: this.frontendDir,
        env: {
          ...process.env,
          BACKEND_PORT: String(BACKEND_PORT),
          FRONTEND_PORT: String(FRONTEND_PORT),
          VITE_OPEN: 'false',
        },
        stdio: ['ignore', 'pipe', 'pipe'],
        shell: true,
        windowsHide: true,
      });
      this.frontendProcess = child;
      this.attachProcess('frontend', child);
    }

    return this.getStatus();
  }

  async stop(): Promise<OpenTeamsStatus> {
    for (const child of [this.frontendProcess, this.backendProcess]) {
      terminateProcessTree(child);
    }
    this.frontendProcess = null;
    this.backendProcess = null;
    this.status = 'stopped';
    return this.getStatus();
  }
}

export const openTeamsService = new OpenTeamsService();
