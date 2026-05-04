const fs = require('fs');
const os = require('os');
const path = require('path');

const tempRoot = path.join(os.tmpdir(), 'muse-mail-verify-ai-muse-tools');
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
  const { AiMuseToolService } = require('../dist/services/AiMuseToolService.js');
  const db = require('../dist/database/index.js').default;

  try {
    runMigrations();

    const service = new AiMuseToolService();

    const redacted = service.formatResultsForModel([
      {
        call: {
          tool: 'ai_accounts.create',
          args: {
            token: 'plain-token',
            api_key: 'sk-live-secret',
            password: 'pw123',
            nested: {
              refresh_token: 'rt-secret',
              url: 'https://x.test?token=abc123',
            },
          },
        },
        ok: false,
        error: 'Bearer abc.def token=raw-secret password=raw-pw',
        result: {
          token: 'result-token',
          session_payload: '{secret}',
          safe: 'ok',
        },
      },
    ]);

    [
      'plain-token',
      'sk-live-secret',
      'pw123',
      'rt-secret',
      'abc123',
      'raw-secret',
      'raw-pw',
      '{secret}',
    ].forEach((fragment) => {
      assert(!redacted.includes(fragment), `redaction leak detected: ${fragment}`);
    });

    const openResults = await service.executeCalls([
      { tool: 'muse.open', args: { path: 'proxy' } },
      { tool: 'muse.open', args: { pathname: 'newspaper' } },
      { tool: 'muse.open', args: { url: 'http://localhost:5173/rules?tab=1' } },
      { tool: 'muse.open', args: { route: 'ai#chat' } },
      { tool: 'muse.open', args: { target: '/inbox' } },
    ], '打开页面');

    const openTargets = openResults.map((item) => item.uiAction?.path || '');
    assert(openResults.every((item) => item.ok), `muse.open alias execution failed: ${JSON.stringify(openResults)}`);
    assert(openTargets[0] === '/proxy', `path alias mismatch: ${openTargets[0]}`);
    assert(openTargets[1] === '/newspaper', `pathname alias mismatch: ${openTargets[1]}`);
    assert(openTargets[2] === '/rules?tab=1', `url alias mismatch: ${openTargets[2]}`);
    assert(openTargets[3] === '/ai#chat', `route alias mismatch: ${openTargets[3]}`);
    assert(openTargets[4] === '/inbox', `target alias mismatch: ${openTargets[4]}`);

    const recent = await service.executeCalls([{ tool: 'mail.recent', args: {} }], '看最近邮件');
    assert(recent.length === 1 && recent[0].ok, `mail.recent should succeed: ${JSON.stringify(recent)}`);
    assert(Array.isArray(recent[0].result), 'mail.recent should return an array');
    assert(recent[0].result.length <= 5, `mail.recent default should cap at 5: ${recent[0].result.length}`);

    const prompt = service.getSystemPrompt();
    assert(prompt.includes('mail.recent'), 'system prompt should mention mail.recent');
    assert(prompt.includes('newspaper.article.read'), 'system prompt should mention newspaper.article.read');

    console.log(
      JSON.stringify(
        {
          ok: true,
          checks: {
            redaction: 'passed',
            muse_open_aliases: 'passed',
            mail_recent_default_limit: 'passed',
            native_prompt_bias: 'passed',
          },
          tempDbPath,
        },
        null,
        2
      )
    );
  } finally {
    db.close();
    cleanup();
  }
}

main().catch((error) => {
  console.error(error.stack || error.message || String(error));
  process.exit(1);
});
