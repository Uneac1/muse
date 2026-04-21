"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TokenQuotaService = void 0;
const OpenAIAccountService_1 = require("./OpenAIAccountService");
const DEFAULT_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36';
const DEFAULT_ANALYTICS_URLS = {
    openai_codex: 'https://chatgpt.com/codex/cloud/settings/analytics',
    claude: 'https://claude.ai/settings/billing',
    claude_code: 'https://claude.ai/settings/billing',
};
const openAIAccountService = new OpenAIAccountService_1.OpenAIAccountService();
function decodeHtml(text) {
    return text
        .replace(/&nbsp;/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'");
}
function stripHtml(html) {
    return decodeHtml(html
        .replace(/<script[\s\S]*?<\/script>/gi, ' ')
        .replace(/<style[\s\S]*?<\/style>/gi, ' ')
        .replace(/<!--[\s\S]*?-->/g, ' ')
        .replace(/<[^>]+>/g, ' '))
        .replace(/\s+/g, ' ')
        .trim();
}
function uniqueStrings(values) {
    return [...new Set(values.map((item) => item.trim()).filter(Boolean))];
}
function extractTitle(html) {
    const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    return decodeHtml(titleMatch?.[1] || '').trim();
}
function extractH1(html) {
    const h1Match = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
    return decodeHtml(h1Match?.[1] || '').replace(/\s+/g, ' ').trim();
}
function extractCardNearLabel(text, key, label, tone) {
    const index = text.search(label);
    if (index === -1)
        return null;
    const window = text.slice(index, index + 180);
    const pctMatch = window.match(/(\d{1,3})\s*%\s*(?:剩余|remaining)/i);
    const resetMatch = window.match(/(?:重置时间|reset(?:s| time)?(?: at)?)\s*[:：]?\s*([0-9年月日:\-\/\sAPMapm]+)/i);
    const pct = pctMatch ? Number(pctMatch[1]) : null;
    const resetLabel = resetMatch?.[1]?.trim() || '';
    return {
        key,
        label,
        remainingPct: pct,
        remainingText: pct == null ? '未解析到剩余额度' : `${pct}% 剩余`,
        resetAt: resetLabel || null,
        resetLabel: resetLabel ? `重置时间：${resetLabel}` : '未解析到重置时间',
        tone,
    };
}
function findQuotedSegments(text, candidates) {
    return candidates.filter((item) => text.includes(item));
}
function parseSessionPayload(sessionPayload, format) {
    const payload = sessionPayload.trim();
    if (!payload)
        return '';
    if (format === 'cookie_header') {
        return payload.replace(/^cookie\s*:\s*/i, '').trim();
    }
    if (format === 'netscape') {
        const pairs = payload
            .split(/\r?\n/)
            .map((line) => line.trim())
            .filter((line) => line && !line.startsWith('#'))
            .map((line) => line.split('\t'))
            .filter((parts) => parts.length >= 7)
            .map((parts) => `${parts[5]}=${parts[6]}`);
        return pairs.join('; ');
    }
    try {
        const parsed = JSON.parse(payload);
        if (Array.isArray(parsed)) {
            return parsed
                .map((item) => {
                if (!item?.name)
                    return '';
                return `${item.name}=${item.value || ''}`;
            })
                .filter(Boolean)
                .join('; ');
        }
        if (Array.isArray(parsed?.cookies)) {
            return parsed.cookies
                .map((item) => {
                if (!item?.name)
                    return '';
                return `${item.name}=${item.value || ''}`;
            })
                .filter(Boolean)
                .join('; ');
        }
    }
    catch {
        return payload;
    }
    return payload;
}
function extractUsageSections(text) {
    const sections = [];
    const dateLabels = uniqueStrings(text.match(/\d{1,2}月\d{1,2}日/g) || []);
    const legends = uniqueStrings(findQuotedSegments(text, ['Desktop App', 'CLI', 'IDE Extension', '个人使用', '团队使用', 'ChatGPT', 'Claude Code']));
    if (dateLabels.length || legends.length) {
        sections.push({
            title: text.includes('使用详情') ? '使用详情' : '抓取到的使用线索',
            subtitle: legends.length ? `图例：${legends.join(' / ')}` : undefined,
            series: legends.length
                ? legends.map((legend) => ({
                    label: legend,
                    color: legend === 'Desktop App' ? '#dc2626' : '#2563eb',
                    points: dateLabels.map((label) => ({ label, value: null })),
                }))
                : [
                    {
                        label: '日期范围',
                        color: '#2563eb',
                        points: dateLabels.map((label) => ({ label, value: null })),
                    },
                ],
        });
    }
    return sections;
}
function parseOpenAiAnalytics(html, text, sourceUrl, finalUrl) {
    const cards = uniqueStrings([
        extractCardNearLabel(text, 'five_hour', '5小时使用限额', 'red'),
        extractCardNearLabel(text, 'five_hour_alt', '5 小时使用限额', 'red'),
        extractCardNearLabel(text, 'weekly', '每周使用限额', 'green'),
        extractCardNearLabel(text, 'daily', '每日使用限额', 'amber'),
        extractCardNearLabel(text, 'monthly', '每月使用限额', 'blue'),
        extractCardNearLabel(text, 'weekly_en', 'weekly usage limit', 'green'),
        extractCardNearLabel(text, 'five_hour_en', '5-hour usage limit', 'red'),
    ]
        .filter(Boolean)
        .map((item) => JSON.stringify(item))).map((item) => JSON.parse(item));
    const usageSections = extractUsageSections(text);
    return {
        sourceUrl,
        finalUrl,
        pageTitle: extractH1(html) || extractTitle(html) || 'Codex Analytics',
        fetchedAt: new Date().toISOString(),
        cards,
        usageSections,
        rangeLabels: uniqueStrings(text.match(/\d{1,2}月\d{1,2}日/g) || []),
        legends: uniqueStrings(findQuotedSegments(text, ['Desktop App', 'CLI', 'IDE Extension', '个人使用', '团队使用'])),
        rawSignals: uniqueStrings([
            ...findQuotedSegments(text, ['Codex 分析', '使用详情', '个人使用', 'Desktop App', '5 小时使用限额', '每周使用限额']),
            text.includes('analytics') ? 'analytics' : '',
        ]),
        textDigest: text.slice(0, 4000),
    };
}
function parseClaudeAnalytics(provider, html, text, sourceUrl, finalUrl) {
    const cards = uniqueStrings([
        extractCardNearLabel(text, 'daily', 'daily usage limit', 'amber'),
        extractCardNearLabel(text, 'weekly', 'weekly usage limit', 'green'),
        extractCardNearLabel(text, 'monthly', 'monthly usage limit', 'blue'),
        extractCardNearLabel(text, 'daily_cn', '每日使用限额', 'amber'),
        extractCardNearLabel(text, 'weekly_cn', '每周使用限额', 'green'),
        extractCardNearLabel(text, 'monthly_cn', '每月使用限额', 'blue'),
    ]
        .filter(Boolean)
        .map((item) => JSON.stringify(item))).map((item) => JSON.parse(item));
    const providerName = provider === 'claude_code' ? 'Claude Code' : 'Claude';
    return {
        sourceUrl,
        finalUrl,
        pageTitle: extractH1(html) || extractTitle(html) || `${providerName} Analytics`,
        fetchedAt: new Date().toISOString(),
        cards,
        usageSections: extractUsageSections(text),
        rangeLabels: uniqueStrings(text.match(/\d{1,2}月\d{1,2}日/g) || []),
        legends: uniqueStrings(findQuotedSegments(text, ['Claude Code', 'Web', '个人使用', '团队使用'])),
        rawSignals: uniqueStrings(findQuotedSegments(text, ['Usage', 'Billing', 'Claude Code', '个人使用', '团队使用', 'remaining'])),
        textDigest: text.slice(0, 4000),
    };
}
class TokenQuotaService {
    getDefaultAnalyticsUrl(provider) {
        return DEFAULT_ANALYTICS_URLS[provider];
    }
    getDefaultUserAgent() {
        return DEFAULT_UA;
    }
    async syncAccount(account) {
        const sourceUrl = (account.analytics_url || this.getDefaultAnalyticsUrl(account.provider)).trim();
        if (!sourceUrl) {
            throw new Error('请填写 analytics_url');
        }
        if (account.provider === 'openai_codex') {
            const authMethod = (account.auth_method || 'session');
            if (authMethod === 'api') {
                return {
                    sourceUrl,
                    finalUrl: sourceUrl,
                    pageTitle: 'OpenAI API Account',
                    fetchedAt: new Date().toISOString(),
                    cards: [],
                    usageSections: [{
                            title: 'API 账号说明',
                            subtitle: 'OpenAI 官方 Codex 剩余额度不对 API Key 账号开放，AI Tools Manager 也是同样限制。',
                            series: [{
                                    label: account.api_model_provider || 'API Account',
                                    color: '#2563eb',
                                    points: [{
                                            label: account.api_model || 'model',
                                            value: null,
                                            hint: account.api_base_url || '',
                                        }],
                                }],
                        }],
                    rangeLabels: [],
                    legends: ['API', account.api_model_provider || 'OpenAI Compatible'],
                    rawSignals: ['api-account-no-official-quota'],
                    textDigest: JSON.stringify({
                        model_provider: account.api_model_provider,
                        model: account.api_model,
                        base_url: account.api_base_url,
                        wire_api: account.api_wire_api,
                    }),
                };
            }
            if ((authMethod === 'oauth' || authMethod === 'manual') && (account.refresh_token || account.access_token)) {
                const tokenInfo = account.refresh_token
                    ? await openAIAccountService.refreshToken(account.refresh_token)
                    : openAIAccountService.parseTokenInfo(account.access_token, account.refresh_token, account.id_token);
                return openAIAccountService.fetchWhamSnapshot(sourceUrl, tokenInfo.accessToken || account.access_token, account.external_account_id || tokenInfo.chatgptAccountId);
            }
        }
        const cookieHeader = parseSessionPayload(account.session_payload, account.session_format);
        if (!cookieHeader) {
            throw new Error('请先导入该账号的 Cookie / Session');
        }
        const response = await fetch(sourceUrl, {
            method: 'GET',
            redirect: 'follow',
            headers: {
                Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
                'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
                'Cache-Control': 'no-cache',
                Cookie: cookieHeader,
                Pragma: 'no-cache',
                'Sec-Ch-Ua': '"Chromium";v="135", "Not:A-Brand";v="24", "Google Chrome";v="135"',
                'Sec-Ch-Ua-Mobile': '?0',
                'Sec-Ch-Ua-Platform': '"Windows"',
                'Sec-Fetch-Dest': 'document',
                'Sec-Fetch-Mode': 'navigate',
                'Sec-Fetch-Site': 'same-origin',
                'Sec-Fetch-User': '?1',
                'Upgrade-Insecure-Requests': '1',
                'User-Agent': account.user_agent.trim() || DEFAULT_UA,
            },
        });
        const html = await response.text();
        if (!response.ok) {
            throw new Error(`抓取官方页面失败：${response.status} ${response.statusText}`);
        }
        const text = stripHtml(html);
        if (!text) {
            throw new Error('页面没有返回可解析文本，可能被登录墙或风控拦截');
        }
        const finalUrl = response.url || sourceUrl;
        const snapshot = account.provider === 'openai_codex'
            ? parseOpenAiAnalytics(html, text, sourceUrl, finalUrl)
            : parseClaudeAnalytics(account.provider, html, text, sourceUrl, finalUrl);
        if (!snapshot.cards.length && !snapshot.usageSections.length) {
            throw new Error('已拿到页面，但暂未解析出额度卡片或使用详情，可能需要更新 Cookie 或适配新版页面结构');
        }
        return snapshot;
    }
}
exports.TokenQuotaService = TokenQuotaService;
//# sourceMappingURL=TokenQuotaService.js.map