"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.IntegrationService = void 0;
const snapshotCache_1 = require("../utils/snapshotCache");
class IntegrationService {
    cache = new Map();
    inflight = new Map();
    maskToken(token) {
        if (!token)
            return '';
        if (token.length <= 8)
            return `${token.slice(0, 2)}***`;
        return `${token.slice(0, 4)}...${token.slice(-4)}`;
    }
    async fetchJson(url, init, errorPrefix) {
        const response = await fetch(url, init);
        if (!response.ok) {
            const text = await response.text();
            throw new Error(`${errorPrefix}: ${response.status} ${text || response.statusText}`);
        }
        return response.json();
    }
    async fetchGitHubPaged(path, token) {
        const all = [];
        let page = 1;
        while (true) {
            const url = `https://api.github.com${path}${path.includes('?') ? '&' : '?'}per_page=100&page=${page}`;
            const data = await this.fetchJson(url, {
                headers: {
                    Accept: 'application/vnd.github+json',
                    Authorization: `Bearer ${token}`,
                    'X-GitHub-Api-Version': '2022-11-28',
                    'User-Agent': 'muse-mail',
                },
            }, 'GitHub API request failed');
            all.push(...data);
            if (data.length < 100)
                break;
            page += 1;
            if (page > 10)
                break;
        }
        return all;
    }
    async fetchCloudflarePaged(path, token) {
        const all = [];
        let page = 1;
        while (true) {
            const url = `https://api.cloudflare.com/client/v4${path}${path.includes('?') ? '&' : '?'}page=${page}&per_page=100`;
            const data = await this.fetchJson(url, {
                headers: {
                    Authorization: `Bearer ${token}`,
                    'Content-Type': 'application/json',
                },
            }, 'Cloudflare API request failed');
            if (!data.success) {
                throw new Error('Cloudflare API returned unsuccessful response');
            }
            all.push(...data.result);
            const totalPages = data.result_info?.total_pages ?? 1;
            if (page >= totalPages || data.result.length < 100)
                break;
            page += 1;
            if (page > 10)
                break;
        }
        return all;
    }
    async safeRequest(fn, fallback) {
        try {
            return await fn();
        }
        catch {
            return fallback;
        }
    }
    cacheKey(kind, token, suffix = '') {
        return `${kind}:${this.maskToken(token)}:${suffix}`;
    }
    getCached(key) {
        const entry = this.cache.get(key);
        if (!entry)
            return null;
        if (Date.now() > entry.expiresAt) {
            this.cache.delete(key);
            return null;
        }
        return entry.value;
    }
    setCached(key, value, ttlMs) {
        this.cache.set(key, { value, expiresAt: Date.now() + ttlMs });
        return value;
    }
    async withCache(key, ttlMs, force, loader) {
        if (!force) {
            const cached = this.getCached(key);
            if (cached)
                return cached;
            const snapshot = (0, snapshotCache_1.getSnapshot)(key, ttlMs);
            if (snapshot)
                return this.setCached(key, snapshot, ttlMs);
            const inflight = this.inflight.get(key);
            if (inflight)
                return inflight;
        }
        const promise = loader()
            .then((value) => {
            (0, snapshotCache_1.setSnapshot)(key, value);
            return this.setCached(key, value, ttlMs);
        })
            .finally(() => {
            if (this.inflight.get(key) === promise) {
                this.inflight.delete(key);
            }
        });
        this.inflight.set(key, promise);
        return promise;
    }
    async mapWithConcurrency(items, concurrency, worker) {
        const results = new Array(items.length);
        let cursor = 0;
        const runners = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
            while (cursor < items.length) {
                const index = cursor;
                cursor += 1;
                results[index] = await worker(items[index], index);
            }
        });
        await Promise.all(runners);
        return results;
    }
    notionHeaders(token) {
        return {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
            'Notion-Version': '2022-06-28',
        };
    }
    extractRichText(parts) {
        return (parts || []).map((part) => part.plain_text || '').join('').trim();
    }
    summarizeNotionPage(item) {
        const properties = item?.properties || {};
        const titleProperty = Object.values(properties).find((value) => value?.type === 'title');
        return {
            object: item.object,
            id: item.id,
            url: item.url,
            created_time: item.created_time,
            last_edited_time: item.last_edited_time,
            title: this.extractRichText(titleProperty?.title) || 'Untitled page',
            parent: item.parent || {},
            icon: item.icon,
            archived: !!item.archived,
            propertyCount: Object.keys(properties).length,
            propertiesPreview: Object.fromEntries(Object.entries(properties)
                .slice(0, 4)
                .map(([key, value]) => [key, this.summarizeNotionPropertyValue(value)])
                .filter(([, value]) => value)),
        };
    }
    summarizeNotionDatabase(item) {
        const properties = item?.properties || {};
        return {
            object: item.object,
            id: item.id,
            url: item.url,
            created_time: item.created_time,
            last_edited_time: item.last_edited_time,
            title: this.extractRichText(item.title) || 'Untitled database',
            parent: item.parent || {},
            description: this.extractRichText(item.description),
            propertyCount: Object.keys(properties).length,
            properties: Object.fromEntries(Object.entries(properties).map(([name, value]) => [
                name,
                { id: value?.id, name, type: value?.type },
            ])),
        };
    }
    async fetchGitHubRepoExtras(token, repos) {
        const targets = repos.filter((repo) => !repo.archived).slice(0, 25);
        const [issueGroups, pullGroups, releaseGroups, branchGroups] = await Promise.all([
            Promise.all(targets.map((repo) => this.safeRequest(async () => {
                const items = await this.fetchGitHubPaged(`/repos/${repo.full_name}/issues?state=open&sort=updated`, token);
                return items
                    .filter((item) => !item.pull_request)
                    .map((item) => ({ ...item, repo_full_name: repo.full_name }));
            }, []))),
            Promise.all(targets.map((repo) => this.safeRequest(async () => {
                const items = await this.fetchGitHubPaged(`/repos/${repo.full_name}/pulls?state=open&sort=updated`, token);
                return items.map((item) => ({ ...item, repo_full_name: repo.full_name }));
            }, []))),
            Promise.all(targets.map((repo) => this.safeRequest(async () => {
                const items = await this.fetchGitHubPaged(`/repos/${repo.full_name}/releases`, token);
                return items.map((item) => ({ ...item, repo_full_name: repo.full_name }));
            }, []))),
            Promise.all(targets.map((repo) => this.safeRequest(async () => {
                const items = await this.fetchGitHubPaged(`/repos/${repo.full_name}/branches`, token);
                return items.map((item) => ({ ...item, repo_full_name: repo.full_name })).slice(0, 20);
            }, []))),
        ]);
        return {
            issues: issueGroups.flat().slice(0, 200),
            pulls: pullGroups.flat().slice(0, 200),
            releases: releaseGroups.flat().slice(0, 200),
            branches: branchGroups.flat().slice(0, 400),
        };
    }
    summarizeNotionBlock(item, parentPageId) {
        return {
            object: item.object,
            id: item.id,
            type: item.type,
            has_children: !!item.has_children,
            created_time: item.created_time,
            last_edited_time: item.last_edited_time,
            parentPageId,
        };
    }
    async searchNotionAll(token) {
        const results = [];
        let cursor;
        let guard = 0;
        do {
            const body = {
                page_size: 100,
                sort: {
                    direction: 'descending',
                    timestamp: 'last_edited_time',
                },
            };
            if (cursor)
                body.start_cursor = cursor;
            const response = await this.fetchJson('https://api.notion.com/v1/search', {
                method: 'POST',
                headers: this.notionHeaders(token),
                body: JSON.stringify(body),
            }, 'Notion search request failed');
            results.push(...response.results);
            cursor = response.has_more ? response.next_cursor || undefined : undefined;
            guard += 1;
        } while (cursor && guard < 100);
        return results;
    }
    async fetchNotionBlockChildrenAll(token, blockId) {
        const results = [];
        let cursor;
        let guard = 0;
        do {
            const url = new URL(`https://api.notion.com/v1/blocks/${blockId}/children`);
            url.searchParams.set('page_size', '100');
            if (cursor)
                url.searchParams.set('start_cursor', cursor);
            const response = await this.fetchJson(url.toString(), { headers: this.notionHeaders(token) }, 'Notion page blocks request failed');
            results.push(...response.results);
            cursor = response.has_more ? response.next_cursor || undefined : undefined;
            guard += 1;
        } while (cursor && guard < 100);
        return results;
    }
    extractNotionBlockText(item) {
        const value = item?.[item?.type] || {};
        const richText = value.rich_text || value.text || value.caption || value.title;
        if (Array.isArray(richText))
            return this.extractRichText(richText);
        if (typeof value.url === 'string')
            return value.url;
        if (typeof value.expression === 'string')
            return value.expression;
        return '';
    }
    summarizeNotionPropertyValue(property) {
        if (!property?.type)
            return '';
        switch (property.type) {
            case 'title':
            case 'rich_text':
                return this.extractRichText(property[property.type]);
            case 'select':
                return property.select?.name || '';
            case 'multi_select':
                return (property.multi_select || []).map((item) => item.name).join(', ');
            case 'status':
                return property.status?.name || '';
            case 'date':
                return property.date?.start || '';
            case 'number':
                return property.number?.toString() || '';
            case 'checkbox':
                return property.checkbox ? 'true' : 'false';
            case 'url':
            case 'email':
            case 'phone_number':
                return property[property.type] || '';
            case 'formula':
                return String(property.formula?.string || property.formula?.number || property.formula?.boolean || '');
            case 'people':
                return (property.people || []).map((item) => item.name).join(', ');
            case 'relation':
                return `${(property.relation || []).length} relations`;
            default:
                return '';
        }
    }
    summarizeReadableNotionBlock(item, children = []) {
        const value = item?.[item?.type] || {};
        return {
            object: item.object,
            id: item.id,
            type: item.type,
            text: this.extractNotionBlockText(item),
            has_children: !!item.has_children,
            created_time: item.created_time,
            last_edited_time: item.last_edited_time,
            url: value.url || value.file?.url || value.external?.url,
            language: value.language,
            checked: value.checked,
            children,
        };
    }
    notionEditableBlockTypes = new Set([
        'paragraph',
        'heading_1',
        'heading_2',
        'heading_3',
        'bulleted_list_item',
        'numbered_list_item',
        'to_do',
        'toggle',
        'quote',
        'callout',
        'code',
    ]);
    buildNotionBlockUpdatePayload(type, text) {
        if (!this.notionEditableBlockTypes.has(type)) {
            throw new Error(`暂不支持编辑 ${type} 类型的 Notion block`);
        }
        return {
            [type]: {
                rich_text: [
                    {
                        type: 'text',
                        text: {
                            content: text,
                        },
                    },
                ],
            },
        };
    }
    async fetchReadableNotionBlocks(token, blockId, depth = 0) {
        const rawBlocks = await this.fetchNotionBlockChildrenAll(token, blockId);
        const blocks = await Promise.all(rawBlocks.map(async (item) => {
            const children = item.has_children && depth < 2
                ? await this.safeRequest(() => this.fetchReadableNotionBlocks(token, item.id, depth + 1), [])
                : [];
            return this.summarizeReadableNotionBlock(item, children);
        }));
        return blocks;
    }
    async fetchNotionPageBlocks(token, pages) {
        const groups = await this.mapWithConcurrency(pages, 4, async (page) => this.safeRequest(async () => {
            const blocks = await this.fetchNotionBlockChildrenAll(token, page.id);
            return blocks.map((item) => this.summarizeNotionBlock(item, page.id));
        }, []));
        return groups.flat();
    }
    summarizeNotionDatabaseRow(item) {
        const properties = item?.properties || {};
        const titleProperty = Object.values(properties).find((value) => value?.type === 'title');
        return {
            id: item.id,
            url: item.url,
            created_time: item.created_time,
            last_edited_time: item.last_edited_time,
            archived: !!item.archived,
            title: this.extractRichText(titleProperty?.title) || 'Untitled row',
            properties: Object.fromEntries(Object.entries(properties)
                .map(([key, value]) => [key, this.summarizeNotionPropertyValue(value)])
                .filter(([, value]) => value)),
        };
    }
    async queryNotionDatabaseAll(token, databaseId) {
        const results = [];
        let cursor;
        let guard = 0;
        do {
            const body = {
                page_size: 100,
            };
            if (cursor)
                body.start_cursor = cursor;
            const response = await this.fetchJson(`https://api.notion.com/v1/databases/${databaseId}/query`, {
                method: 'POST',
                headers: this.notionHeaders(token),
                body: JSON.stringify(body),
            }, 'Notion database query failed');
            results.push(...response.results);
            cursor = response.has_more ? response.next_cursor || undefined : undefined;
            guard += 1;
        } while (cursor && guard < 100);
        return results;
    }
    async fetchCloudflareZoneDetails(token, zones) {
        const targets = zones.slice(0, 50);
        const results = await Promise.all(targets.map(async (zone) => {
            const records = await this.safeRequest(() => this.fetchCloudflarePaged(`/zones/${zone.id}/dns_records`, token), []);
            return {
                zoneId: zone.id,
                dnsRecordCount: records.length,
                proxiedRecordCount: records.filter((record) => !!record.proxied).length,
                records,
            };
        }));
        return results;
    }
    async fetchCloudflarePagesProjects(token, accounts) {
        const results = await Promise.all(accounts.slice(0, 20).map((account) => this.safeRequest(() => this.fetchCloudflarePaged(`/accounts/${account.id}/pages/projects`, token), [])));
        return results.flat();
    }
    async fetchCloudflareWorkerScripts(token, accounts) {
        const results = await Promise.all(accounts.slice(0, 20).map((account) => this.safeRequest(() => this.fetchCloudflarePaged(`/accounts/${account.id}/workers/scripts`, token), [])));
        return results.flat();
    }
    async fetchCloudflareRulesets(token, accounts, zones) {
        const accountRulesets = await Promise.all(accounts.slice(0, 20).map((account) => this.safeRequest(() => this.fetchCloudflarePaged(`/accounts/${account.id}/rulesets`, token), [])));
        const zoneRulesets = await Promise.all(zones.slice(0, 50).map((zone) => this.safeRequest(() => this.fetchCloudflarePaged(`/zones/${zone.id}/rulesets`, token), [])));
        return [...accountRulesets.flat(), ...zoneRulesets.flat()];
    }
    async fetchGitHubData(record, options) {
        const token = record.token;
        return this.withCache(this.cacheKey('github-summary', token), 5 * 60 * 1000, !!options?.force, async () => {
            const profile = await this.fetchJson('https://api.github.com/user', {
                headers: {
                    Accept: 'application/vnd.github+json',
                    Authorization: `Bearer ${token}`,
                    'X-GitHub-Api-Version': '2022-11-28',
                    'User-Agent': 'muse-mail',
                },
            }, 'GitHub profile request failed');
            const [repos, starred, orgs, gists, events] = await Promise.all([
                this.fetchGitHubPaged('/user/repos?sort=updated&affiliation=owner,collaborator,organization_member', token),
                this.fetchGitHubPaged('/user/starred?sort=updated', token),
                this.safeRequest(() => this.fetchGitHubPaged('/user/orgs', token), []),
                this.safeRequest(() => this.fetchGitHubPaged('/gists', token), []),
                this.safeRequest(() => this.fetchGitHubPaged(`/users/${profile.login}/events/public`, token), []),
            ]);
            const extras = await this.fetchGitHubRepoExtras(token, repos);
            return {
                connected: true,
                tokenMasked: this.maskToken(token),
                lastSyncAt: record.updated_at,
                profile,
                repos,
                starred,
                orgs,
                gists,
                events,
                ...extras,
            };
        });
    }
    async fetchCloudflareData(record, options) {
        const token = record.token;
        return this.withCache(this.cacheKey('cloudflare-summary', token), 3 * 60 * 1000, !!options?.force, async () => {
            const [userResponse, accounts, zones] = await Promise.all([
                this.fetchJson('https://api.cloudflare.com/client/v4/user', {
                    headers: {
                        Authorization: `Bearer ${token}`,
                        'Content-Type': 'application/json',
                    },
                }, 'Cloudflare user request failed'),
                this.fetchCloudflarePaged('/accounts', token),
                this.fetchCloudflarePaged('/zones', token),
            ]);
            if (!userResponse.success) {
                throw new Error('Cloudflare user request was not successful');
            }
            const [zoneDetails, pagesProjects, workerScripts, rulesets] = await Promise.all([
                this.fetchCloudflareZoneDetails(token, zones),
                this.fetchCloudflarePagesProjects(token, accounts),
                this.fetchCloudflareWorkerScripts(token, accounts),
                this.fetchCloudflareRulesets(token, accounts, zones),
            ]);
            return {
                connected: true,
                tokenMasked: this.maskToken(token),
                lastSyncAt: record.updated_at,
                user: userResponse.result,
                accounts,
                zones,
                zoneDetails,
                pagesProjects,
                workerScripts,
                rulesets,
            };
        });
    }
    async fetchNotionData(record, options) {
        const token = record.token;
        return this.withCache(this.cacheKey('notion-summary', token), 5 * 60 * 1000, !!options?.force, async () => {
            const [bot, usersResponse, searchResults] = await Promise.all([
                this.fetchJson('https://api.notion.com/v1/users/me', { headers: this.notionHeaders(token) }, 'Notion bot request failed'),
                this.safeRequest(() => this.fetchJson('https://api.notion.com/v1/users?page_size=100', { headers: this.notionHeaders(token) }, 'Notion users request failed'), { results: [] }),
                this.safeRequest(() => this.searchNotionAll(token), []),
            ]);
            const pages = searchResults
                .filter((item) => item?.object === 'page')
                .map((item) => this.summarizeNotionPage(item));
            const databases = searchResults
                .filter((item) => item?.object === 'database')
                .map((item) => this.summarizeNotionDatabase(item));
            return {
                connected: true,
                tokenMasked: this.maskToken(token),
                lastSyncAt: record.updated_at,
                bot,
                users: usersResponse.results,
                pages,
                databases,
                metrics: {
                    pageCount: pages.length,
                    databaseCount: databases.length,
                    userCount: usersResponse.results.length,
                    archivedPageCount: pages.filter((item) => item.archived).length,
                    pageWithDatabaseParentCount: pages.filter((item) => item.parent?.type === 'database_id').length,
                },
            };
        });
    }
    async fetchNotionInsights(record, options) {
        const token = record.token;
        return this.withCache(this.cacheKey('notion-insights', token), 3 * 60 * 1000, !!options?.force, async () => {
            const summary = await this.fetchNotionData(record, options);
            const blocks = await this.fetchNotionPageBlocks(token, summary.pages);
            const countByType = new Map();
            const countByPage = new Map();
            for (const block of blocks) {
                countByType.set(block.type, (countByType.get(block.type) || 0) + 1);
                countByPage.set(block.parentPageId, (countByPage.get(block.parentPageId) || 0) + 1);
            }
            return {
                totalBlocks: blocks.length,
                sampledPages: summary.pages.length,
                blockTypeCounts: [...countByType.entries()]
                    .map(([type, count]) => ({ type, count }))
                    .sort((a, b) => b.count - a.count),
                pageBlockCounts: [...countByPage.entries()]
                    .map(([pageId, count]) => ({
                    pageId,
                    count,
                    title: summary.pages.find((item) => item.id === pageId)?.title || 'Untitled page',
                }))
                    .sort((a, b) => b.count - a.count)
                    .slice(0, 20),
                recentEditedPages: [...summary.pages]
                    .sort((a, b) => new Date(b.last_edited_time).getTime() - new Date(a.last_edited_time).getTime())
                    .slice(0, 20)
                    .map((item) => ({
                    pageId: item.id,
                    title: item.title,
                    lastEditedTime: item.last_edited_time,
                })),
            };
        });
    }
    async fetchNotionPageContent(record, pageId) {
        const token = record.token;
        return this.withCache(this.cacheKey('notion-page', token, pageId), 5 * 60 * 1000, false, async () => {
            const [page, blocks] = await Promise.all([
                this.fetchJson(`https://api.notion.com/v1/pages/${pageId}`, { headers: this.notionHeaders(token) }, 'Notion page request failed'),
                this.fetchReadableNotionBlocks(token, pageId),
            ]);
            return {
                page: this.summarizeNotionPage(page),
                blocks,
            };
        });
    }
    async fetchNotionDatabaseContent(record, databaseId) {
        const token = record.token;
        return this.withCache(this.cacheKey('notion-database', token, databaseId), 5 * 60 * 1000, false, async () => {
            const [database, rows] = await Promise.all([
                this.fetchJson(`https://api.notion.com/v1/databases/${databaseId}`, { headers: this.notionHeaders(token) }, 'Notion database request failed'),
                this.queryNotionDatabaseAll(token, databaseId),
            ]);
            return {
                database: this.summarizeNotionDatabase(database),
                rows: rows.map((item) => this.summarizeNotionDatabaseRow(item)),
            };
        });
    }
    async updateNotionBlock(record, blockId, type, text) {
        const token = record.token;
        const payload = this.buildNotionBlockUpdatePayload(type, text);
        const block = await this.fetchJson(`https://api.notion.com/v1/blocks/${blockId}`, {
            method: 'PATCH',
            headers: this.notionHeaders(token),
            body: JSON.stringify(payload),
        }, 'Notion block update request failed');
        this.cache.delete(this.cacheKey('notion-page', token, block.parent?.page_id || ''));
        this.cache.delete(this.cacheKey('notion-insights', token));
        return this.summarizeReadableNotionBlock(block);
    }
    normalizeMiSubBaseUrl(url) {
        const value = (url || '').trim();
        if (!value)
            throw new Error('MiSub 地址不能为空');
        const normalized = /^https?:\/\//i.test(value) ? value : `https://${value}`;
        return normalized.replace(/\/+$/, '');
    }
    parseMiSubRecord(record) {
        try {
            const parsed = JSON.parse(record.token || '{}');
            if (!parsed.baseUrl || !parsed.password)
                throw new Error('invalid misub payload');
            return {
                baseUrl: this.normalizeMiSubBaseUrl(parsed.baseUrl),
                password: parsed.password,
            };
        }
        catch {
            return {
                baseUrl: 'https://misub.y130.icu',
                password: record.token,
            };
        }
    }
    serializeMiSubRecord(baseUrl, password) {
        return JSON.stringify({
            baseUrl: this.normalizeMiSubBaseUrl(baseUrl),
            password,
        });
    }
    maskPassword(password) {
        if (!password)
            return '';
        if (password.length <= 2)
            return '*'.repeat(password.length);
        return `${password[0]}${'*'.repeat(Math.max(password.length - 2, 1))}${password[password.length - 1]}`;
    }
    async loginMiSub(baseUrl, password) {
        const response = await fetch(`${baseUrl}/api/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ password }),
        });
        if (!response.ok) {
            const text = await response.text();
            throw new Error(`MiSub 登录失败: ${response.status} ${text || response.statusText}`);
        }
        const cookie = response.headers.get('set-cookie');
        if (!cookie) {
            throw new Error('MiSub 登录成功但未返回会话 Cookie');
        }
        const sessionCookie = cookie.split(';')[0]?.trim();
        if (!sessionCookie) {
            throw new Error('MiSub 会话 Cookie 无效');
        }
        return sessionCookie;
    }
    async fetchMiSubJson(baseUrl, cookie, path, init) {
        const response = await fetch(`${baseUrl}${path}`, {
            ...init,
            headers: {
                Cookie: cookie,
                'Content-Type': 'application/json',
                ...(init?.headers || {}),
            },
        });
        const text = await response.text();
        if (!response.ok) {
            throw new Error(`MiSub 请求失败 ${path}: ${response.status} ${text || response.statusText}`);
        }
        return text ? JSON.parse(text) : {};
    }
    async validateMiSubCredentials(baseUrl, password) {
        const normalizedBaseUrl = this.normalizeMiSubBaseUrl(baseUrl);
        const cookie = await this.loginMiSub(normalizedBaseUrl, password);
        const [data, settings] = await Promise.all([
            this.fetchMiSubJson(normalizedBaseUrl, cookie, '/api/data'),
            this.fetchMiSubJson(normalizedBaseUrl, cookie, '/api/settings'),
        ]);
        return {
            connected: true,
            baseUrl: normalizedBaseUrl,
            passwordMasked: this.maskPassword(password),
            lastSyncAt: new Date().toISOString(),
            misubs: data.misubs || [],
            profiles: data.profiles || [],
            settings: settings || null,
        };
    }
    async fetchMiSubData(record, options) {
        const { baseUrl, password } = this.parseMiSubRecord(record);
        return this.withCache(this.cacheKey('misub-summary', `${baseUrl}:${password}`), 60 * 1000, !!options?.force, async () => {
            const cookie = await this.loginMiSub(baseUrl, password);
            const [data, settings] = await Promise.all([
                this.fetchMiSubJson(baseUrl, cookie, '/api/data'),
                this.fetchMiSubJson(baseUrl, cookie, '/api/settings'),
            ]);
            return {
                connected: true,
                baseUrl,
                passwordMasked: this.maskPassword(password),
                lastSyncAt: record.updated_at,
                misubs: data.misubs || [],
                profiles: data.profiles || [],
                settings: settings || null,
            };
        });
    }
    async saveMiSubData(record, misubs, profiles) {
        const { baseUrl, password } = this.parseMiSubRecord(record);
        const cookie = await this.loginMiSub(baseUrl, password);
        await this.fetchMiSubJson(baseUrl, cookie, '/api/misubs', {
            method: 'POST',
            body: JSON.stringify({ misubs, profiles }),
        });
        return this.fetchMiSubData(record, { force: true });
    }
    async saveMiSubSettings(record, settings) {
        const { baseUrl, password } = this.parseMiSubRecord(record);
        const cookie = await this.loginMiSub(baseUrl, password);
        await this.fetchMiSubJson(baseUrl, cookie, '/api/settings', {
            method: 'POST',
            body: JSON.stringify(settings),
        });
        return this.fetchMiSubData(record, { force: true });
    }
    async updateMiSubNodeCount(record, url, fetchProxy, plusAsSpace) {
        const { baseUrl, password } = this.parseMiSubRecord(record);
        const cookie = await this.loginMiSub(baseUrl, password);
        return this.fetchMiSubJson(baseUrl, cookie, '/api/node_count', {
            method: 'POST',
            body: JSON.stringify({
                url,
                ...(fetchProxy ? { fetchProxy } : {}),
                ...(plusAsSpace ? { plusAsSpace: true } : {}),
            }),
        });
    }
    async batchUpdateMiSubNodes(record, subscriptionIds) {
        const { baseUrl, password } = this.parseMiSubRecord(record);
        const cookie = await this.loginMiSub(baseUrl, password);
        const result = await this.fetchMiSubJson(baseUrl, cookie, '/api/batch_update_nodes', {
            method: 'POST',
            body: JSON.stringify({ subscriptionIds }),
        });
        return result.results || [];
    }
    buildMiSubRecordPayload(baseUrl, password) {
        return this.serializeMiSubRecord(baseUrl, password);
    }
}
exports.IntegrationService = IntegrationService;
//# sourceMappingURL=IntegrationService.js.map