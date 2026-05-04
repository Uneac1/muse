import fs from 'fs';
import os from 'os';
import path from 'path';

function assert(condition: unknown, message: string) {
  if (!condition) {
    throw new Error(message);
  }
}

function never<T>(): Promise<T> {
  return new Promise<T>(() => {});
}

async function main() {
  const tempRoot = path.join(os.tmpdir(), 'muse-agent-autonomy-guardrails');
  const tempDbPath = path.join(tempRoot, 'muse-mail.db');
  fs.rmSync(tempRoot, { recursive: true, force: true });
  fs.mkdirSync(tempRoot, { recursive: true });
  process.env.DB_PATH = tempDbPath;
  process.env.PORT = '0';

  const { runMigrations } = await import('../src/database/migrations');
  const { agentAutonomyService } = await import('../src/services/AgentAutonomyService');
  const { proxyKernelService } = await import('../src/services/ProxyKernelService');
  const { personalMemoryIngestionService } = await import('../src/services/PersonalMemoryIngestionService');
  const db = (await import('../src/database')).default;

  const proxy = proxyKernelService as any;
  const memory = personalMemoryIngestionService as any;
  const originalProxyStatus = proxy.getStatus.bind(proxy);
  const originalProxyBootstrap = proxy.ensureKernelBootstrapped.bind(proxy);
  const originalMemoryState = memory.getState.bind(memory);
  const originalMemoryRun = memory.runNow.bind(memory);

  try {
    runMigrations();
    agentAutonomyService.updateConfig({
      enabled: true,
      intervalHours: 1,
      memoryIngestionEnabled: false,
      ruleAutomationEnabled: false,
      backupEnabled: false,
    });

    proxy.getStatus = () => never();
    let startedAt = Date.now();
    let state = await agentAutonomyService.runNow({ force: true });
    const statusTimeoutMs = Date.now() - startedAt;
    assert(state.latestRun?.status === 'success', 'proxy status timeout did not finish as successful degraded run');
    assert(statusTimeoutMs < 14000, `proxy status timeout blocked too long: ${statusTimeoutMs}ms`);

    proxy.getStatus = async () => ({
      running: false,
      availableSources: [{ kind: 'subscription', id: 1, label: 'test-source' }],
      sourceLabel: 'test-source',
      lastError: 'guardrail test',
    });
    proxy.ensureKernelBootstrapped = () => never();
    memory.getState = () => ({
      latestRun: {
        id: 1,
        status: 'failed',
        error: 'guardrail test memory failure',
        summary: 'failed',
        finishedAt: new Date().toISOString(),
      },
    });
    memory.runNow = () => never();

    startedAt = Date.now();
    state = await agentAutonomyService.runNow({ force: true });
    const recoveryTimeoutMs = Date.now() - startedAt;
    assert(state.latestRun?.status === 'success', 'recovery timeout did not allow autonomy main loop to finish');
    assert(recoveryTimeoutMs < 40000, `recovery timeout blocked too long: ${recoveryTimeoutMs}ms`);

    const incidentText = JSON.stringify(state.recentIncidents);
    assert(incidentText.includes('Proxy kernel recovery timed out after 15000ms'), 'missing proxy recovery timeout incident');
    assert(incidentText.includes('Memory ingestion recovery timed out after 20000ms'), 'missing memory recovery timeout incident');

    console.log(JSON.stringify({
      ok: true,
      checks: {
        proxy_status_timeout_degrades: 'passed',
        recovery_timeout_main_loop_continues: 'passed',
        timeout_incidents_recorded: 'passed',
        frontend_acceptance_surface: 'not expanded: server-only guardrail script and service change',
      },
      timingsMs: {
        proxyStatusTimeoutScenario: statusTimeoutMs,
        recoveryTimeoutScenario: recoveryTimeoutMs,
      },
      latestRun: {
        id: state.latestRun?.id,
        status: state.latestRun?.status,
        actions: state.latestRun?.actions,
      },
    }, null, 2));
  } finally {
    proxy.getStatus = originalProxyStatus;
    proxy.ensureKernelBootstrapped = originalProxyBootstrap;
    memory.getState = originalMemoryState;
    memory.runNow = originalMemoryRun;
    db.close();
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error.stack || error.message || String(error));
  process.exit(1);
});
