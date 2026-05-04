const fs = require('fs');
const os = require('os');
const path = require('path');

const tempRoot = path.join(os.tmpdir(), 'muse-mail-verify-agent-autonomy');
const tempDbPath = path.join(tempRoot, 'muse-mail.db');

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function cleanup() {
  fs.rmSync(tempRoot, { recursive: true, force: true });
}

async function main() {
  cleanup();
  fs.mkdirSync(tempRoot, { recursive: true });
  process.env.DB_PATH = tempDbPath;
  process.env.PORT = '0';

  const { runMigrations } = require('../dist/database/migrations.js');
  const { agentAutonomyService } = require('../dist/services/AgentAutonomyService.js');
  const { AiMuseToolService } = require('../dist/services/AiMuseToolService.js');
  const { AgentCapabilityWeightModel } = require('../dist/models/PersonalOS.js');
  const db = require('../dist/database/index.js').default;

  try {
    runMigrations();

    agentAutonomyService.updateConfig({
      enabled: true,
      intervalHours: 1,
      memoryIngestionEnabled: false,
      ruleAutomationEnabled: true,
      backupEnabled: true,
      backupDir: './agent-backups',
      backupRetentionCount: 2,
      profileLearningEnabled: true,
      skillLearningEnabled: true,
    });

    const learnResult = await agentAutonomyService.learnFromConversation({
      userMessage: '我要像 Hermes Agent 一样跨会话记忆，共同成长。不要问我，自己推进，提示词别太多。',
      assistantMessage: '已开始执行。',
      toolDetails: [
        { tool: 'agent.autonomy.state', ok: true },
        { tool: 'workspace.run_command', ok: true },
      ],
    });

    const profile = agentAutonomyService.listProfile();
    assert(profile.some((item) => item.key === 'desired_agent_archetype'), 'missing Hermes profile memory');
    assert(profile.some((item) => item.key === 'execution_style'), 'missing execution style memory');
    assert(profile.some((item) => item.key === 'prompt_density'), 'missing prompt density memory');

    const skills = agentAutonomyService.listSkills(10);
    assert(skills.some((item) => item.pattern.includes('agent.autonomy.state')), 'missing learned workflow pattern');

    const stateAfterConfig = agentAutonomyService.getState();
    assert(stateAfterConfig.automationHealth.ruleAutomationEnabled === true, 'runtime automation health did not reflect rule automation config');

    const capabilityModel = new AgentCapabilityWeightModel();
    capabilityModel.remember({
      capability: 'learning_loop',
      outcome: 'neutral',
      summary: 'first neutral sample',
    });
    capabilityModel.remember({
      capability: 'learning_loop',
      outcome: 'success',
      summary: 'follow-up success sample',
    });
    const learnedCapability = capabilityModel.getByCapability('learning_loop');
    assert(learnedCapability, 'missing learned capability weight');
    assert(learnedCapability.neutralCount === 1, `neutral count not persisted: ${JSON.stringify(learnedCapability)}`);
    assert(learnedCapability.successCount === 1, `success count not persisted: ${JSON.stringify(learnedCapability)}`);
    assert(learnedCapability.weight < 0.99, `neutral sample was ignored in weight calculation: ${JSON.stringify(learnedCapability)}`);

    const runState = await agentAutonomyService.runNow({ force: true });
    const backupPath = runState.latestRun && runState.latestRun.backupPath;
    assert(runState.latestRun && runState.latestRun.status === 'success', 'autonomy run did not succeed');
    assert(backupPath && fs.existsSync(backupPath), `backup snapshot missing: ${backupPath || ''}`);

    const museToolService = new AiMuseToolService();
    const toolResults = await museToolService.executeCalls([
      { tool: 'agent.autonomy.state', args: {} },
      { tool: 'agent.profile.list', args: {} },
      { tool: 'agent.skills.list', args: { limit: 5 } },
    ], '检查自治状态和沉淀能力');

    assert(toolResults.every((item) => item.ok), `muse tools failed: ${JSON.stringify(toolResults)}`);
    assert(Array.isArray(toolResults[1].result) && toolResults[1].result.length > 0, 'agent.profile.list returned empty');
    assert(Array.isArray(toolResults[2].result) && toolResults[2].result.length > 0, 'agent.skills.list returned empty');

    console.log(JSON.stringify({
      ok: true,
      checks: {
        profile_learning: 'passed',
        skill_learning: 'passed',
        runtime_config_reflection: 'passed',
        capability_weight_learning: 'passed',
        autonomy_backup_run: 'passed',
        muse_tool_agent_state: 'passed',
      },
      learnedActions: learnResult.actions,
      backupPath,
    }, null, 2));
  } finally {
    db.close();
    cleanup();
  }
}

main().catch((error) => {
  console.error(error.stack || error.message || String(error));
  process.exit(1);
});
