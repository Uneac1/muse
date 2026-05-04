const path = require('path');
const Database = require('better-sqlite3');

const db = new Database(path.join(__dirname, '..', 'data', 'muse-mail.db'));

function normalizeText(value) {
  return String(value || '').trim().replace(/\s+/g, ' ');
}

function uniqueClauses(value) {
  const seen = new Set();
  const parts = normalizeText(value)
    .split(/[。！？!?；;]+/)
    .map((item) => normalizeText(item))
    .filter(Boolean);
  const kept = [];
  for (const part of parts) {
    const key = part.slice(0, 24);
    if (seen.has(key)) continue;
    seen.add(key);
    kept.push(part);
  }
  return kept.join('；');
}

function clipText(value, limit) {
  const normalized = uniqueClauses(value);
  return normalized.length > limit ? `${normalized.slice(0, Math.max(1, limit - 1))}...` : normalized;
}

function stripNoise(value) {
  return normalizeText(String(value || ''))
    .replace(/https?:\/\/\S+/gi, ' ')
    .replace(/复制打开抖音(?:极速版)?，看看/gi, ' ')
    .replace(/\b\d+(?:\.\d+)?\s+[A-Za-z0-9@:/._-]+\b/g, ' ')
    .replace(/\b[A-Za-z]@[A-Za-z0-9._-]+\b/g, ' ')
    .replace(/\b[A-Za-z]{1,6}:\/\b/gi, ' ')
    .replace(/\b\d{2}\/\d{2}\b/g, ' ')
    .replace(/[#*_~`]+/g, ' ')
    .replace(/[|｜]+/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function looksNoisy(value) {
  const raw = normalizeText(value);
  const cleaned = stripNoise(raw);
  if (!cleaned) return true;
  if (/(https?:\/\/|复制打开抖音|v\.douyin\.com|douyin|ATY:|mDh:|Q@|N@|H@|aaa:|图文作品|极速版|作品】|:\/)/i.test(raw)) return true;
  if (cleaned.length < 6) return true;
  const cjkCount = (cleaned.match(/[\u4e00-\u9fff]/g) || []).length;
  return cjkCount < Math.min(4, cleaned.length);
}

function cleanTitle(title, entityKey) {
  const normalized = stripNoise(
    normalizeText(title)
      .replace(/^Notion 提炼：/i, '')
      .replace(/\b[A-Z]{2,5}:\/\s*\d{2}\/\d{2}.*$/i, '')
  );
  return `Notion 提炼：${clipText(normalized || entityKey || '未命名页面', 40)}`;
}

function extractPropertyHints(content) {
  const match = String(content || '').match(/(?:属性线索|属性)[:：]\s*(.+)$/);
  return clipText(stripNoise(match ? match[1] : ''), 48);
}

function sanitizeBody(content) {
  return stripNoise(
    normalizeText(String(content || ''))
    .replace(/^文章提炼[:：]\s*/i, '')
    .replace(/^提炼摘要[:：]\s*/i, '')
    .replace(/^Notion 页面《.*?》已纳入记忆库，优先作为文章提炼来源保留。?/i, '')
    .replace(/(?:核心观点|可执行点|关联)[:：]/g, ' ')
    .replace(/(?:\/\s*)?(?:属性线索|属性)[:：].+$/i, '')
    .replace(/这条记忆属于 Notion 文章观点沉淀，后续检索时应优先作为文章摘要使用。?/g, ' ')
    .replace(/这条记忆偏向你的操作习惯或工作流，可作为后续执行默认项。?/g, ' ')
    .replace(/这条记忆偏向 Muse 改动或产品判断，后续改版时可直接复用。?/g, ' ')
    .replace(/后续可按这篇文章的判断继续整理、验证或落到具体动作。?/g, ' ')
    .replace(/后续可围绕《.*?》继续补充要点、动作和判断。?/g, ' ')
    .replace(/后续应补全原文信息，再决定是否保留为长期记忆。?/g, ' ')
    .replace(/这是一条标题信息较弱的 Notion 页面，当前先保留为待补充文章记忆。?/g, ' ')
    .replace(/这篇文章主要围绕《.*?》展开，当前先保留为可回看的文章线索。?/g, ' ')
    .replace(/页面《.*?》暂无可提炼正文，保留标题和属性/g, '')
  );
}

function splitSentences(text) {
  return text
    .split(/[\n。！？!?；;]+/)
    .map((item) => normalizeText(item))
    .filter((item) => item && item.length >= 4 && !looksNoisy(item))
    .slice(0, 6);
}

function classifyPage(cleanedTitle, propertyHints, sentences) {
  const pool = `${cleanedTitle} ${propertyHints} ${sentences.join(' ')}`;
  if (/^\d+$/.test(cleanedTitle) || /^Untitled page$/i.test(cleanedTitle) || cleanedTitle.length < 3) return 'weak';
  if (/梦|昨天|今天|醒来|睡|回到了小时候|又遇到你/.test(pool)) return 'journal';
  if (/“|”|摘录|引用|说过|我说|她说|他说|问我/.test(pool)) return 'excerpt';
  if (sentences.length <= 1) return 'short';
  return 'article';
}

function inferRelation(title, propertyHints, rawContent) {
  const pool = `${title} ${propertyHints} ${rawContent}`.toLowerCase();
  if (/muse|改动|迭代|发布|版本|功能|产品/.test(pool)) {
    return '这条记忆偏向 Muse 改动或产品判断，后续改版时可直接复用。';
  }
  if (/习惯|偏好|流程|步骤|操作|工作流|自动化/.test(pool)) {
    return '这条记忆偏向你的操作习惯或工作流，可作为后续执行默认项。';
  }
  return '这条记忆属于 Notion 文章观点沉淀，后续检索时应优先作为文章摘要使用。';
}

function buildFallbackCore(pageType, cleanedTitle, sentences) {
  if (pageType === 'weak') {
    return '这是一条标题信息较弱的 Notion 页面，当前先保留为待补充文章记忆。';
  }
  if (pageType === 'journal') {
    return clipText(sentences[0] || `这是一条围绕《${cleanedTitle}》的日常记录。`, 64);
  }
  if (pageType === 'excerpt') {
    return clipText(sentences[0] || `这是一条围绕《${cleanedTitle}》保留的摘录或引用。`, 64);
  }
  if (pageType === 'short') {
    return clipText(sentences[0] || `这是一条围绕《${cleanedTitle}》的短记。`, 64);
  }
  if (sentences[0]) return clipText(sentences[0], 64);
  return `这篇文章主要围绕《${cleanedTitle}》展开，当前先保留为可回看的文章线索。`;
}

function buildFallbackAction(pageType, cleanedTitle, sentences) {
  const actionable = sentences.find((item) => /建议|应该|可以|先|再|步骤|方法|做法|需要|适合|用于|避免|保持|记录|复盘/.test(item));
  if (actionable) return clipText(actionable, 64);
  if (pageType === 'weak') {
    return '后续应补全原文信息，再决定是否保留为长期记忆。';
  }
  if (pageType === 'journal') {
    return '后续可结合时间线或上下文，把这条记录补成更完整的经历记忆。';
  }
  if (pageType === 'excerpt') {
    return '后续可补上这段摘录为什么重要，以及你准备怎么用它。';
  }
  if (pageType === 'short') {
    return `后续可围绕《${clipText(cleanedTitle, 24)}》补充背景、结论和下一步。`;
  }
  return `后续可围绕《${clipText(cleanedTitle, 24)}》继续补充要点、动作和判断。`;
}

function buildStructuredContent(row) {
  const propertyHints = extractPropertyHints(row.content);
  const sanitizedBody = sanitizeBody(row.content);
  const sentences = splitSentences(sanitizedBody);
  const cleanedTitle = cleanTitle(row.title, row.entity_key).replace(/^Notion 提炼：/, '');
  const pageType = classifyPage(cleanedTitle, propertyHints, sentences);
  const core = buildFallbackCore(pageType, cleanedTitle, sentences);
  const action = buildFallbackAction(pageType, cleanedTitle, sentences);
  const relationBase = inferRelation(row.title, propertyHints, row.content);
  const relation = clipText(
    propertyHints ? `${relationBase} 属性线索：${propertyHints}` : relationBase,
    84
  );
  return `核心观点：${core} 可执行点：${action} 关联：${relation}`;
}

const rows = db.prepare("SELECT id, title, content, entity_key FROM personal_memory WHERE source = 'auto:notion'").all();
const update = db.prepare(`
  UPDATE personal_memory
  SET title = ?, content = ?, updated_at = CURRENT_TIMESTAMP
  WHERE id = ?
`);

let updated = 0;
for (const row of rows) {
  const nextTitle = cleanTitle(row.title, row.entity_key);
  const nextContent = buildStructuredContent(row);
  if (normalizeText(row.title) !== nextTitle || normalizeText(row.content) !== nextContent) {
    update.run(nextTitle, nextContent, row.id);
    updated += 1;
  }
}

console.log(JSON.stringify({ updated, total: rows.length }, null, 2));
