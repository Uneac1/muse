const { spawn } = require('child_process');
const net = require('net');
const path = require('path');
const { cleanupServerProcesses } = require('./cleanup-server-processes');

const repoRoot = path.resolve(__dirname, '..');
const serverDir = path.join(repoRoot, 'server');

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function waitForChildExit(child, timeoutMs = 5000) {
  return new Promise((resolve) => {
    if (child.exitCode !== null || child.signalCode !== null) {
      resolve();
      return;
    }
    const timer = setTimeout(resolve, timeoutMs);
    child.once('exit', () => {
      clearTimeout(timer);
      resolve();
    });
  });
}

function findFreePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      const port = typeof address === 'object' && address ? address.port : 0;
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve(port);
      });
    });
    server.on('error', reject);
  });
}

async function requestJson(url, options = {}) {
  const { timeoutMs = 90000, ...fetchOptions } = options;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let response;
  let text;
  try {
    response = await fetch(url, { ...fetchOptions, signal: controller.signal });
    text = await response.text();
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`${fetchOptions.method || 'GET'} ${url} failed before response: ${detail}`);
  } finally {
    clearTimeout(timer);
  }
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    throw new Error(`Failed to parse JSON from ${url}: ${text.slice(0, 300)}`);
  }
  if (!response.ok) {
    throw new Error(`${fetchOptions.method || 'GET'} ${url} failed with ${response.status}: ${text.slice(0, 500)}`);
  }
  return json;
}

async function requestJsonWithRetry(url, options = {}, attempts = 3, delayMs = 1500) {
  let lastError;
  for (let index = 0; index < attempts; index += 1) {
    try {
      return await requestJson(url, options);
    } catch (error) {
      lastError = error;
      const message = error instanceof Error ? error.message : String(error);
      const isTransient = /failed before response|timed out|aborted|quota exceeded|temporarily unavailable|overloaded|429|503/i.test(message);
      if (!isTransient || index === attempts - 1) {
        throw error;
      }
      await delay(delayMs);
    }
  }
  throw lastError;
}

async function requestText(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 90000);
  let response;
  let text;
  try {
    response = await fetch(url, { signal: controller.signal });
    text = await response.text();
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`GET ${url} failed before response: ${detail}`);
  } finally {
    clearTimeout(timer);
  }
  if (!response.ok) {
    throw new Error(`GET ${url} failed with ${response.status}: ${text.slice(0, 300)}`);
  }
  return { status: response.status, text };
}

async function requestTextWithRetry(url, attempts = 4, delayMs = 800) {
  let lastError;
  for (let index = 0; index < attempts; index += 1) {
    try {
      return await requestText(url);
    } catch (error) {
      lastError = error;
      if (!(error instanceof Error) || !/failed with 404/i.test(error.message) || index === attempts - 1) {
        throw error;
      }
      await delay(delayMs);
    }
  }
  throw lastError;
}

async function waitForHealth(baseUrl, timeoutMs = 30000, getLogs = () => '') {
  const startedAt = Date.now();
  let lastError = 'server did not start';

  while (Date.now() - startedAt < timeoutMs) {
    try {
      const payload = await requestJson(`${baseUrl}/api/newspaper/health`);
      return payload;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
      await delay(1000);
    }
  }

  throw new Error(`Timed out waiting for ${baseUrl}/api/newspaper/health: ${lastError}\n${getLogs()}`);
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

async function run() {
  cleanupServerProcesses();

  const port = Number(process.env.SMOKE_PORT || await findFreePort());
  const baseUrl = `http://127.0.0.1:${port}`;
  const child = spawn('node', ['dist/server.js'], {
    cwd: serverDir,
    env: {
      ...process.env,
      PORT: String(port),
      ACCESS_PASSWORD: '',
      ADMIN_GOOGLE_CLIENT_ID: '',
      ADMIN_GOOGLE_CLIENT_SECRET: '',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });

  let stdout = '';
  let stderr = '';
  let exitInfo = '';
  child.stdout.on('data', (chunk) => { stdout += chunk.toString(); });
  child.stderr.on('data', (chunk) => { stderr += chunk.toString(); });
  child.on('exit', (code, signal) => {
    exitInfo = `child exited with code=${code} signal=${signal}`;
  });

  const getLogs = () => {
    const out = stdout.trim().slice(-4000);
    const err = stderr.trim().slice(-4000);
    return [
      exitInfo ? `process: ${exitInfo}` : '',
      out ? `stdout:\n${out}` : '',
      err ? `stderr:\n${err}` : '',
    ].filter(Boolean).join('\n');
  };

  try {
    const health = await waitForHealth(baseUrl, 30000, getLogs);
    assert(health?.code === 200, 'health endpoint did not return code 200');
    assert(health?.data?.featureVersion === 'newspaper-ai-auto-v4', 'unexpected newspaper feature version');

    const briefing = await requestJsonWithRetry(`${baseUrl}/api/newspaper/briefing?limit=1`, { timeoutMs: 60000 }, 3, 2000);
    assert(briefing?.code === 200, 'briefing endpoint did not return code 200');
    assert(Array.isArray(briefing?.data?.sections) && briefing.data.sections.length > 0, 'briefing sections are empty');

    const allItems = briefing.data.sections.flatMap((section) => Array.isArray(section.items) ? section.items : []);
    const articleSeed = allItems.find((item) => item?.url && !/arxiv\.org/i.test(item.url) && item.source !== 'arXiv cs.LG')
      || allItems.find((item) => item?.url);
    assert(articleSeed?.url, 'briefing did not contain a readable article');
    assert(typeof articleSeed?.aiCardStatus === 'string', 'briefing item is missing AI card status');
    if (articleSeed.titleZh) {
      assert(!/关键词|自动导读|自动中译摘要/i.test(articleSeed.titleZh), 'briefing item headline still uses keyword template');
    }
    if (articleSeed.summaryZh) {
      assert(!/Article URL|Comments URL|Listen now|Read more/i.test(articleSeed.summaryZh), 'briefing item summary still contains feed junk');
    }

    const newspaperPage = await requestTextWithRetry(`${baseUrl}/newspaper`);
    const readerPage = await requestTextWithRetry(`${baseUrl}/newspaper/read`);
    assert(newspaperPage.status === 200 && /<div id="root"><\/div>/.test(newspaperPage.text), 'newspaper page HTML is invalid');
    assert(readerPage.status === 200 && /<div id="root"><\/div>/.test(readerPage.text), 'reader page HTML is invalid');

    const briefingInsight = await requestJsonWithRetry(`${baseUrl}/api/newspaper/briefing-insight`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ limit: 1, refresh: true, query: '' }),
      timeoutMs: 45000,
    }, 2, 1500);
    assert(briefingInsight?.code === 200, 'briefing insight endpoint did not return code 200');
    assert(Array.isArray(briefingInsight?.data?.sections) && briefingInsight.data.sections.length > 0, 'briefing insight returned no sections');
    assert((briefingInsight.data.highlights || []).length >= 6, 'briefing insight highlights are unexpectedly sparse');
    assert(!/all models failed|全部暂时不可用|本地导读/i.test(String(briefingInsight.data.summary || '')), 'briefing insight succeeded only through degraded local fallback');

    const articleParams = new URLSearchParams({
      url: articleSeed.url,
      source: articleSeed.source || '',
      title: articleSeed.title || '',
      titleZh: articleSeed.titleZh || '',
    });
    const article = await requestJson(`${baseUrl}/api/newspaper/article?${articleParams.toString()}`);
    assert(article?.code === 200, 'article endpoint did not return code 200');
    assert(typeof article?.data?.translatedContent === 'string' && article.data.translatedContent.length > 0, 'article translated content is empty');
    ['fulltextStatus', 'imageStatus', 'replyStatus', 'translationStatus'].forEach((key) => {
      assert(typeof article?.data?.[key] === 'string', `article detail is missing ${key}`);
    });

    const articleInsight = await requestJson(`${baseUrl}/api/newspaper/insight`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        url: articleSeed.url,
        source: articleSeed.source || '',
        title: articleSeed.title || '',
        titleZh: articleSeed.titleZh || '',
      }),
    });
    assert(articleInsight?.code === 200, 'article insight endpoint did not return code 200');
    assert(typeof articleInsight?.data?.summary === 'string' && articleInsight.data.summary.length > 0, 'article insight summary is empty');
    assert(articleInsight?.data?.status === 'ready', `article insight is still degraded: ${articleInsight?.data?.degradedReason || 'unknown reason'}`);
    assert(!/all models failed|全部暂时不可用|本地导读/i.test(String(articleInsight.data.summary || '')), 'article insight succeeded only through degraded local fallback');

    const result = {
      ok: true,
      port,
      health: {
        featureVersion: health.data.featureVersion,
        activeAiAccounts: health.data.ai.activeAccountCount,
        defaultModel: health.data.ai.defaultModel,
      },
      briefing: {
        sectionCount: briefing.data.sections.length,
        totalItems: briefing.data.totalItems,
      },
      briefingInsight: {
        account: briefingInsight.data.accountName,
        model: briefingInsight.data.model,
        headline: briefingInsight.data.headline,
      },
      article: {
        url: articleSeed.url,
        translationMode: article.data.translationMode,
        replyCount: article.data.replyCount,
      },
      articleInsight: {
        account: articleInsight.data.accountName,
        model: articleInsight.data.model,
        summary: articleInsight.data.summary,
      },
    };

    console.log(JSON.stringify(result, null, 2));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`${message}\n${getLogs()}`.trim());
  } finally {
    if (!child.killed) {
      child.kill('SIGTERM');
      await waitForChildExit(child, 1500);
      if (child.exitCode === null && child.signalCode === null) {
        child.kill('SIGKILL');
        await waitForChildExit(child, 3000);
      }
    }
    cleanupServerProcesses();
  }
}

run().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
