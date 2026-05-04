import {
  CloudflareDnsRecord,
  CloudflareAccountInfo,
  CloudflareIntegrationData,
  CloudflareUser,
  CloudflareZone,
  CloudflareZoneDetail,
  CloudflarePagesProject,
  CloudflareRuleset,
  CloudflareWorkerScript,
  GitHubEvent,
  GitHubGist,
  GitHubIntegrationData,
  GitHubIssue,
  GitHubOrganization,
  GitHubProfile,
  GitHubPullRequest,
  GitHubRelease,
  GitHubBranch,
  GitHubRepository,
  IntegrationTokenRecord,
  LinuxDoIntegrationData,
  LinuxDoUser,
  MiSubBatchUpdateResult,
  MiSubIntegrationData,
  MiSubProfile,
  MiSubSettings,
  MiSubSubscription,
  NotionBot,
  NotionBlockSummary,
  NotionDatabaseSummary,
  NotionDatabaseContent,
  NotionDatabaseRow,
  NotionIntegrationData,
  NotionInsights,
  NotionPageSummary,
  NotionPageContent,
  NotionReadableBlock,
  NotionUser,
} from '../types';
import { getSnapshot, setSnapshot } from '../utils/snapshotCache';
import logger from '../utils/logger';
import { LinuxDoConnectService } from './LinuxDoConnectService';

export class IntegrationService {
  private linuxDoConnectService = new LinuxDoConnectService();
  private cache = new Map<string, { expiresAt: number; value: unknown }>();
  private inflight = new Map<string, Promise<unknown>>();
  private readonly notionInsightsSampleLimit = 48;
  private readonly externalRequestConcurrency = 4;
  private readonly notionSearchPageLimit = 10;
  private readonly notionContentPageLimit = 20;

  private maskToken(token: string): string {
    if (!token) return '';
    if (token.length <= 8) return `${token.slice(0, 2)}***`;
    return `${token.slice(0, 4)}...${token.slice(-4)}`;
  }

  private async fetchJson<T>(url: string, init: RequestInit, errorPrefix: string): Promise<T> {
    const response = await fetch(url, init);
    if (!response.ok) {
      const text = await response.text();
      throw new Error(`${errorPrefix}: ${response.status} ${text || response.statusText}`);
    }
    return response.json() as Promise<T>;
  }

  private async fetchGitHubPaged<T>(path: string, token: string): Promise<T[]> {
    const all: T[] = [];
    let page = 1;

    while (true) {
      const url = `https://api.github.com${path}${path.includes('?') ? '&' : '?'}per_page=100&page=${page}`;
      const data = await this.fetchJson<T[]>(
        url,
        {
          headers: {
            Accept: 'application/vnd.github+json',
            Authorization: `Bearer ${token}`,
            'X-GitHub-Api-Version': '2022-11-28',
            'User-Agent': 'muse-mail',
          },
        },
        'GitHub API request failed'
      );

      all.push(...data);
      if (data.length < 100) break;
      page += 1;
      if (page > 10) break;
    }

    return all;
  }

  private async fetchCloudflarePaged<T>(path: string, token: string): Promise<T[]> {
    const all: T[] = [];
    let page = 1;

    while (true) {
      const url = `https://api.cloudflare.com/client/v4${path}${path.includes('?') ? '&' : '?'}page=${page}&per_page=100`;
      const data = await this.fetchJson<{ success: boolean; result: T[]; result_info?: { total_pages?: number } }>(
        url,
        {
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        },
        'Cloudflare API request failed'
      );

      if (!data.success) {
        throw new Error('Cloudflare API returned unsuccessful response');
      }

      all.push(...data.result);
      const totalPages = data.result_info?.total_pages ?? 1;
      if (page >= totalPages || data.result.length < 100) break;
      page += 1;
      if (page > 10) break;
    }

    return all;
  }

  private async safeRequest<T>(fn: () => Promise<T>, fallback: T): Promise<T> {
    try {
      return await fn();
    } catch {
      return fallback;
    }
  }

  private cacheKey(kind: string, token: string, suffix = '') {
    return `${kind}:${this.maskToken(token)}:${suffix}`;
  }

  private getCached<T>(key: string): T | null {
    const entry = this.cache.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      return null;
    }
    return entry.value as T;
  }

  private setCached<T>(key: string, value: T, ttlMs: number) {
    this.cache.set(key, { value, expiresAt: Date.now() + ttlMs });
    return value;
  }

  private async withCache<T>(key: string, ttlMs: number, force: boolean, loader: () => Promise<T>) {
    if (!force) {
      const cached = this.getCached<T>(key);
      if (cached) return cached;

      const snapshot = getSnapshot<T>(key);
      if (snapshot) return this.setCached(key, snapshot, ttlMs);

      const inflight = this.inflight.get(key) as Promise<T> | undefined;
      if (inflight) return inflight;
    }

    const promise = loader()
      .then((value) => {
        setSnapshot(key, value);
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

  private async mapWithConcurrency<T, R>(items: T[], concurrency: number, worker: (item: T, index: number) => Promise<R>): Promise<R[]> {
    const results: R[] = new Array(items.length);
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

  private notionHeaders(token: string) {
    return {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      'Notion-Version': '2022-06-28',
    };
  }

  private extractRichText(parts?: Array<{ plain_text?: string }>): string {
    return (parts || []).map((part) => part.plain_text || '').join('').trim();
  }

  private summarizeNotionPage(item: any): NotionPageSummary {
    const properties = item?.properties || {};
    const titleProperty = Object.values(properties).find((value: any) => value?.type === 'title') as
      | { title?: Array<{ plain_text?: string }> }
      | undefined;

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
      propertiesPreview: Object.fromEntries(
        Object.entries(properties)
          .slice(0, 4)
          .map(([key, value]: [string, any]) => [key, this.summarizeNotionPropertyValue(value)])
          .filter(([, value]) => value)
      ),
    };
  }

  private summarizeNotionDatabase(item: any): NotionDatabaseSummary {
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
      properties: Object.fromEntries(
        Object.entries(properties).map(([name, value]: [string, any]) => [
          name,
          { id: value?.id, name, type: value?.type },
        ])
      ),
    };
  }

  private async fetchGitHubRepoExtras(token: string, repos: GitHubRepository[]) {
    const targets = repos.filter((repo) => !repo.archived).slice(0, 25);
    const loadForTargets = <T>(loader: (repo: GitHubRepository) => Promise<T[]>) =>
      this.mapWithConcurrency(
        targets,
        this.externalRequestConcurrency,
        (repo) => this.safeRequest(() => loader(repo), [])
      );

    const [issueGroups, pullGroups, releaseGroups, branchGroups] = await Promise.all([
      loadForTargets(async (repo) => {
        const items = await this.fetchGitHubPaged<any>(`/repos/${repo.full_name}/issues?state=open&sort=updated`, token);
        return items
          .filter((item) => !item.pull_request)
          .map((item) => ({ ...item, repo_full_name: repo.full_name })) as GitHubIssue[];
      }),
      loadForTargets(async (repo) => {
        const items = await this.fetchGitHubPaged<GitHubPullRequest>(`/repos/${repo.full_name}/pulls?state=open&sort=updated`, token);
        return items.map((item) => ({ ...item, repo_full_name: repo.full_name }));
      }),
      loadForTargets(async (repo) => {
        const items = await this.fetchGitHubPaged<GitHubRelease>(`/repos/${repo.full_name}/releases`, token);
        return items.map((item) => ({ ...item, repo_full_name: repo.full_name }));
      }),
      loadForTargets(async (repo) => {
        const items = await this.fetchGitHubPaged<GitHubBranch>(`/repos/${repo.full_name}/branches`, token);
        return items.map((item) => ({ ...item, repo_full_name: repo.full_name })).slice(0, 20);
      }),
    ]);

    return {
      issues: issueGroups.flat().slice(0, 200),
      pulls: pullGroups.flat().slice(0, 200),
      releases: releaseGroups.flat().slice(0, 200),
      branches: branchGroups.flat().slice(0, 400),
    };
  }

  private summarizeNotionBlock(item: any, parentPageId: string): NotionBlockSummary {
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

  private async searchNotionAll(token: string): Promise<any[]> {
    const results: any[] = [];
    let cursor: string | undefined;
    let guard = 0;

    do {
      const body: Record<string, any> = {
        page_size: 100,
        sort: {
          direction: 'descending',
          timestamp: 'last_edited_time',
        },
      };
      if (cursor) body.start_cursor = cursor;

      const response = await this.fetchJson<{ results: any[]; has_more: boolean; next_cursor: string | null }>(
        'https://api.notion.com/v1/search',
        {
          method: 'POST',
          headers: this.notionHeaders(token),
          body: JSON.stringify(body),
        },
        'Notion search request failed'
      );

      results.push(...response.results);
      cursor = response.has_more ? response.next_cursor || undefined : undefined;
      guard += 1;
    } while (cursor && guard < this.notionSearchPageLimit);

    return results;
  }

  private async fetchNotionBlockChildrenAll(token: string, blockId: string): Promise<any[]> {
    const results: any[] = [];
    let cursor: string | undefined;
    let guard = 0;

    do {
      const url = new URL(`https://api.notion.com/v1/blocks/${blockId}/children`);
      url.searchParams.set('page_size', '100');
      if (cursor) url.searchParams.set('start_cursor', cursor);

      const response = await this.fetchJson<{ results: any[]; has_more: boolean; next_cursor: string | null }>(
        url.toString(),
        { headers: this.notionHeaders(token) },
        'Notion page blocks request failed'
      );

      results.push(...response.results);
      cursor = response.has_more ? response.next_cursor || undefined : undefined;
      guard += 1;
    } while (cursor && guard < this.notionContentPageLimit);

    return results;
  }

  private extractNotionBlockText(item: any): string {
    const value = item?.[item?.type] || {};
    const richText = value.rich_text || value.text || value.caption || value.title;
    if (Array.isArray(richText)) return this.extractRichText(richText);
    if (typeof value.url === 'string') return value.url;
    if (typeof value.expression === 'string') return value.expression;
    return '';
  }

  private summarizeNotionPropertyValue(property: any): string {
    if (!property?.type) return '';
    switch (property.type) {
      case 'title':
      case 'rich_text':
        return this.extractRichText(property[property.type]);
      case 'select':
        return property.select?.name || '';
      case 'multi_select':
        return (property.multi_select || []).map((item: any) => item.name).join(', ');
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
        return (property.people || []).map((item: any) => item.name).join(', ');
      case 'relation':
        return `${(property.relation || []).length} relations`;
      default:
        return '';
    }
  }

  private summarizeReadableNotionBlock(item: any, children: NotionReadableBlock[] = []): NotionReadableBlock {
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

  private notionEditableBlockTypes = new Set([
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

  private buildNotionBlockUpdatePayload(type: string, text: string) {
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

  private async fetchReadableNotionBlocks(token: string, blockId: string, depth = 0): Promise<NotionReadableBlock[]> {
    const rawBlocks = await this.fetchNotionBlockChildrenAll(token, blockId);
    const blocks = await this.mapWithConcurrency(
      rawBlocks,
      this.externalRequestConcurrency,
      async (item) => {
        const children =
          item.has_children && depth < 2
            ? await this.safeRequest(() => this.fetchReadableNotionBlocks(token, item.id, depth + 1), [])
            : [];
        return this.summarizeReadableNotionBlock(item, children);
      }
    );

    return blocks;
  }

  private async fetchNotionPageBlocks(token: string, pages: NotionPageSummary[]): Promise<NotionBlockSummary[]> {
    const groups = await this.mapWithConcurrency(
      pages,
      4,
      async (page) =>
        this.safeRequest(
          async () => {
            const blocks = await this.fetchNotionBlockChildrenAll(token, page.id);
            return blocks.map((item) => this.summarizeNotionBlock(item, page.id));
          },
          []
        )
    );

    return groups.flat();
  }

  private summarizeNotionDatabaseRow(item: any): NotionDatabaseRow {
    const properties = item?.properties || {};
    const titleProperty = Object.values(properties).find((value: any) => value?.type === 'title') as
      | { title?: Array<{ plain_text?: string }> }
      | undefined;

    return {
      id: item.id,
      url: item.url,
      created_time: item.created_time,
      last_edited_time: item.last_edited_time,
      archived: !!item.archived,
      title: this.extractRichText(titleProperty?.title) || 'Untitled row',
      properties: Object.fromEntries(
        Object.entries(properties)
          .map(([key, value]: [string, any]) => [key, this.summarizeNotionPropertyValue(value)])
          .filter(([, value]) => value)
      ),
    };
  }

  private async queryNotionDatabaseAll(token: string, databaseId: string): Promise<any[]> {
    const results: any[] = [];
    let cursor: string | undefined;
    let guard = 0;

    do {
      const body: Record<string, any> = {
        page_size: 100,
      };
      if (cursor) body.start_cursor = cursor;

      const response = await this.fetchJson<{ results: any[]; has_more: boolean; next_cursor: string | null }>(
        `https://api.notion.com/v1/databases/${databaseId}/query`,
        {
          method: 'POST',
          headers: this.notionHeaders(token),
          body: JSON.stringify(body),
        },
        'Notion database query failed'
      );

      results.push(...response.results);
      cursor = response.has_more ? response.next_cursor || undefined : undefined;
      guard += 1;
    } while (cursor && guard < this.notionContentPageLimit);

    return results;
  }

  private async fetchCloudflareZoneDetails(token: string, zones: CloudflareZone[]): Promise<CloudflareZoneDetail[]> {
    const targets = zones.slice(0, 50);
    const results = await this.mapWithConcurrency(
      targets,
      this.externalRequestConcurrency,
      async (zone) => {
        const records = await this.safeRequest(
          () => this.fetchCloudflarePaged<CloudflareDnsRecord>(`/zones/${zone.id}/dns_records`, token),
          []
        );

        return {
          zoneId: zone.id,
          dnsRecordCount: records.length,
          proxiedRecordCount: records.filter((record) => !!record.proxied).length,
          records,
        };
      }
    );

    return results;
  }

  private async fetchCloudflarePagesProjects(token: string, accounts: CloudflareAccountInfo[]): Promise<CloudflarePagesProject[]> {
    const results = await this.mapWithConcurrency(
      accounts.slice(0, 20),
      this.externalRequestConcurrency,
      (account) =>
        this.safeRequest(
          () => this.fetchCloudflarePaged<CloudflarePagesProject>(`/accounts/${account.id}/pages/projects`, token),
          []
        )
    );

    return results.flat();
  }

  private async fetchCloudflareWorkerScripts(token: string, accounts: CloudflareAccountInfo[]): Promise<CloudflareWorkerScript[]> {
    const results = await this.mapWithConcurrency(
      accounts.slice(0, 20),
      this.externalRequestConcurrency,
      (account) =>
        this.safeRequest(
          () => this.fetchCloudflarePaged<CloudflareWorkerScript>(`/accounts/${account.id}/workers/scripts`, token),
          []
        )
    );

    return results.flat();
  }

  private async fetchCloudflareRulesets(token: string, accounts: CloudflareAccountInfo[], zones: CloudflareZone[]): Promise<CloudflareRuleset[]> {
    const accountRulesets = await this.mapWithConcurrency(
      accounts.slice(0, 20),
      this.externalRequestConcurrency,
      (account) =>
        this.safeRequest(
          () => this.fetchCloudflarePaged<CloudflareRuleset>(`/accounts/${account.id}/rulesets`, token),
          []
        )
    );

    const zoneRulesets = await this.mapWithConcurrency(
      zones.slice(0, 50),
      this.externalRequestConcurrency,
      (zone) =>
        this.safeRequest(
          () => this.fetchCloudflarePaged<CloudflareRuleset>(`/zones/${zone.id}/rulesets`, token),
          []
        )
    );

    return [...accountRulesets.flat(), ...zoneRulesets.flat()];
  }

  async fetchGitHubData(record: IntegrationTokenRecord, options?: { force?: boolean }): Promise<GitHubIntegrationData> {
    const token = record.token;
    return this.withCache(this.cacheKey('github-summary', token), 5 * 60 * 1000, !!options?.force, async () => {
      const profile = await this.fetchJson<GitHubProfile>(
        'https://api.github.com/user',
        {
          headers: {
            Accept: 'application/vnd.github+json',
            Authorization: `Bearer ${token}`,
            'X-GitHub-Api-Version': '2022-11-28',
            'User-Agent': 'muse-mail',
          },
        },
        'GitHub profile request failed'
      );

      const [repos, starred, orgs, gists, events] = await Promise.all([
        this.fetchGitHubPaged<GitHubRepository>('/user/repos?sort=updated&affiliation=owner,collaborator,organization_member', token),
        this.fetchGitHubPaged<GitHubRepository>('/user/starred?sort=updated', token),
        this.safeRequest(
          () => this.fetchGitHubPaged<GitHubOrganization>('/user/orgs', token),
          []
        ),
        this.safeRequest(
          () => this.fetchGitHubPaged<GitHubGist>('/gists', token),
          []
        ),
        this.safeRequest(
          () => this.fetchGitHubPaged<GitHubEvent>(`/users/${profile.login}/events/public`, token),
          []
        ),
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

  async fetchCloudflareData(record: IntegrationTokenRecord, options?: { force?: boolean }): Promise<CloudflareIntegrationData> {
    const token = record.token;
    return this.withCache(this.cacheKey('cloudflare-summary', token), 3 * 60 * 1000, !!options?.force, async () => {
      const [userResponse, accounts, zones] = await Promise.all([
        this.fetchJson<{ success: boolean; result: CloudflareUser }>(
          'https://api.cloudflare.com/client/v4/user',
          {
            headers: {
              Authorization: `Bearer ${token}`,
              'Content-Type': 'application/json',
            },
          },
          'Cloudflare user request failed'
        ),
        this.fetchCloudflarePaged<CloudflareAccountInfo>('/accounts', token),
        this.fetchCloudflarePaged<CloudflareZone>('/zones', token),
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

  async fetchNotionData(record: IntegrationTokenRecord, options?: { force?: boolean }): Promise<NotionIntegrationData> {
    const token = record.token;

    return this.withCache(this.cacheKey('notion-summary', token), 5 * 60 * 1000, !!options?.force, async () => {
      const [bot, usersResponse, searchResults] = await Promise.all([
        this.fetchJson<NotionBot>(
          'https://api.notion.com/v1/users/me',
          { headers: this.notionHeaders(token) },
          'Notion bot request failed'
        ),
        this.safeRequest(
          () =>
            this.fetchJson<{ results: NotionUser[] }>(
              'https://api.notion.com/v1/users?page_size=100',
              { headers: this.notionHeaders(token) },
              'Notion users request failed'
            ),
          { results: [] }
        ),
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

  async fetchLinuxDoData(record: IntegrationTokenRecord, options?: { force?: boolean }): Promise<LinuxDoIntegrationData> {
    const session = this.linuxDoConnectService.parseSessionRecord(record.token);
    if (!session?.accessToken) {
      throw new Error('Linux.do 会话数据无效，请重新授权');
    }

    return this.withCache(this.cacheKey('linuxdo-summary', session.accessToken), 3 * 60 * 1000, !!options?.force, async () => {
      let activeSession = session;
      let user: LinuxDoUser | null = session.user || null;

      if (session.expiresAt && new Date(session.expiresAt).getTime() <= Date.now() && session.refreshToken) {
        const refreshed = await this.linuxDoConnectService.refreshToken(session.refreshToken);
        user = await this.linuxDoConnectService.fetchCurrentUser(refreshed.access_token);
        activeSession = this.linuxDoConnectService.buildSessionRecord(refreshed, user);
      } else if (!user || !!options?.force) {
        user = await this.linuxDoConnectService.fetchCurrentUser(session.accessToken);
        activeSession = { ...session, user };
      }

      return {
        connected: true,
        clientConfigured: this.linuxDoConnectService.isConfigured(),
        tokenMasked: this.maskToken(activeSession.accessToken),
        lastSyncAt: record.updated_at,
        expiresAt: activeSession.expiresAt,
        scopes: activeSession.scope,
        user,
      };
    });
  }

  async fetchNotionInsights(record: IntegrationTokenRecord, options?: { force?: boolean }): Promise<NotionInsights> {
    const token = record.token;

    return this.withCache(
      this.cacheKey('notion-insights', token, `sample-${this.notionInsightsSampleLimit}`),
      3 * 60 * 1000,
      !!options?.force,
      async () => {
      const summary = await this.fetchNotionData(record, options);
      const recentEditedPages = [...summary.pages]
        .sort((a, b) => new Date(b.last_edited_time).getTime() - new Date(a.last_edited_time).getTime());
      const sampledPages = recentEditedPages.slice(0, this.notionInsightsSampleLimit);
      const blocks = await this.fetchNotionPageBlocks(token, sampledPages);
      const pageTitleMap = new Map(sampledPages.map((item) => [item.id, item.title]));
      const countByType = new Map<string, number>();
      const countByPage = new Map<string, number>();

      for (const block of blocks) {
        countByType.set(block.type, (countByType.get(block.type) || 0) + 1);
        countByPage.set(block.parentPageId, (countByPage.get(block.parentPageId) || 0) + 1);
      }

      const result = {
        totalBlocks: blocks.length,
        sampledPages: sampledPages.length,
        blockTypeCounts: [...countByType.entries()]
          .map(([type, count]) => ({ type, count }))
          .sort((a, b) => b.count - a.count),
        pageBlockCounts: [...countByPage.entries()]
          .map(([pageId, count]) => ({
            pageId,
            count,
            title: pageTitleMap.get(pageId) || 'Untitled page',
          }))
          .sort((a, b) => b.count - a.count)
          .slice(0, 20),
        recentEditedPages: recentEditedPages
          .slice(0, 20)
          .map((item) => ({
            pageId: item.id,
            title: item.title,
            lastEditedTime: item.last_edited_time,
          })),
      };
      logger.info(`Notion insights sampled ${sampledPages.length}/${summary.pages.length} pages and ${blocks.length} blocks`);
      return result;
    });
  }

  async fetchNotionPageContent(record: IntegrationTokenRecord, pageId: string): Promise<NotionPageContent> {
    const token = record.token;
    return this.withCache(this.cacheKey('notion-page', token, pageId), 5 * 60 * 1000, false, async () => {
      const [page, blocks] = await Promise.all([
        this.fetchJson<any>(
          `https://api.notion.com/v1/pages/${pageId}`,
          { headers: this.notionHeaders(token) },
          'Notion page request failed'
        ),
        this.fetchReadableNotionBlocks(token, pageId),
      ]);

      return {
        page: this.summarizeNotionPage(page),
        blocks,
      };
    });
  }

  async fetchNotionDatabaseContent(record: IntegrationTokenRecord, databaseId: string): Promise<NotionDatabaseContent> {
    const token = record.token;
    return this.withCache(this.cacheKey('notion-database', token, databaseId), 5 * 60 * 1000, false, async () => {
      const [database, rows] = await Promise.all([
        this.fetchJson<any>(
          `https://api.notion.com/v1/databases/${databaseId}`,
          { headers: this.notionHeaders(token) },
          'Notion database request failed'
        ),
        this.queryNotionDatabaseAll(token, databaseId),
      ]);

      return {
        database: this.summarizeNotionDatabase(database),
        rows: rows.map((item) => this.summarizeNotionDatabaseRow(item)),
      };
    });
  }

  async updateNotionBlock(record: IntegrationTokenRecord, blockId: string, type: string, text: string): Promise<NotionReadableBlock> {
    const token = record.token;
    const payload = this.buildNotionBlockUpdatePayload(type, text);
    const block = await this.fetchJson<any>(
      `https://api.notion.com/v1/blocks/${blockId}`,
      {
        method: 'PATCH',
        headers: this.notionHeaders(token),
        body: JSON.stringify(payload),
      },
      'Notion block update request failed'
    );

    this.cache.delete(this.cacheKey('notion-page', token, block.parent?.page_id || ''));
    this.cache.delete(this.cacheKey('notion-insights', token));

    return this.summarizeReadableNotionBlock(block);
  }

  private normalizeMiSubBaseUrl(url: string): string {
    const value = (url || '').trim();
    if (!value) throw new Error('MiSub 地址不能为空');
    const normalized = /^https?:\/\//i.test(value) ? value : `https://${value}`;
    return normalized.replace(/\/+$/, '');
  }

  private parseMiSubRecord(record: IntegrationTokenRecord): { baseUrl: string; password: string } {
    try {
      const parsed = JSON.parse(record.token || '{}') as { baseUrl?: string; password?: string };
      if (!parsed.baseUrl || !parsed.password) throw new Error('invalid misub payload');
      return {
        baseUrl: this.normalizeMiSubBaseUrl(parsed.baseUrl),
        password: parsed.password,
      };
    } catch {
      return {
        baseUrl: 'https://misub.y130.icu',
        password: record.token,
      };
    }
  }

  private serializeMiSubRecord(baseUrl: string, password: string): string {
    return JSON.stringify({
      baseUrl: this.normalizeMiSubBaseUrl(baseUrl),
      password,
    });
  }

  private maskPassword(password: string): string {
    if (!password) return '';
    if (password.length <= 2) return '*'.repeat(password.length);
    return `${password[0]}${'*'.repeat(Math.max(password.length - 2, 1))}${password[password.length - 1]}`;
  }

  private async loginMiSub(baseUrl: string, password: string): Promise<string> {
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

  private async fetchMiSubJson<T>(baseUrl: string, cookie: string, path: string, init?: RequestInit): Promise<T> {
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

    return text ? JSON.parse(text) as T : ({} as T);
  }

  async validateMiSubCredentials(baseUrl: string, password: string): Promise<MiSubIntegrationData> {
    const normalizedBaseUrl = this.normalizeMiSubBaseUrl(baseUrl);
    const cookie = await this.loginMiSub(normalizedBaseUrl, password);
    const [data, settings] = await Promise.all([
      this.fetchMiSubJson<{ misubs?: MiSubSubscription[]; profiles?: MiSubProfile[] }>(normalizedBaseUrl, cookie, '/api/data'),
      this.fetchMiSubJson<MiSubSettings>(normalizedBaseUrl, cookie, '/api/settings'),
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

  async fetchMiSubData(record: IntegrationTokenRecord, options?: { force?: boolean }): Promise<MiSubIntegrationData> {
    const { baseUrl, password } = this.parseMiSubRecord(record);
    return this.withCache(this.cacheKey('misub-summary', `${baseUrl}:${password}`), 60 * 1000, !!options?.force, async () => {
      const cookie = await this.loginMiSub(baseUrl, password);
      const [data, settings] = await Promise.all([
        this.fetchMiSubJson<{ misubs?: MiSubSubscription[]; profiles?: MiSubProfile[] }>(baseUrl, cookie, '/api/data'),
        this.fetchMiSubJson<MiSubSettings>(baseUrl, cookie, '/api/settings'),
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

  async saveMiSubData(record: IntegrationTokenRecord, misubs: MiSubSubscription[], profiles: MiSubProfile[]): Promise<MiSubIntegrationData> {
    const { baseUrl, password } = this.parseMiSubRecord(record);
    const cookie = await this.loginMiSub(baseUrl, password);
    await this.fetchMiSubJson<{ success?: boolean; message?: string }>(baseUrl, cookie, '/api/misubs', {
      method: 'POST',
      body: JSON.stringify({ misubs, profiles }),
    });
    return this.fetchMiSubData(record, { force: true });
  }

  async saveMiSubSettings(record: IntegrationTokenRecord, settings: MiSubSettings): Promise<MiSubIntegrationData> {
    const { baseUrl, password } = this.parseMiSubRecord(record);
    const cookie = await this.loginMiSub(baseUrl, password);
    await this.fetchMiSubJson<{ success?: boolean; message?: string }>(baseUrl, cookie, '/api/settings', {
      method: 'POST',
      body: JSON.stringify(settings),
    });
    return this.fetchMiSubData(record, { force: true });
  }

  async updateMiSubNodeCount(
    record: IntegrationTokenRecord,
    url: string,
    fetchProxy?: string,
    plusAsSpace?: boolean
  ): Promise<{ count: number; userInfo: MiSubSubscription['userInfo'] }> {
    const { baseUrl, password } = this.parseMiSubRecord(record);
    const cookie = await this.loginMiSub(baseUrl, password);
    return this.fetchMiSubJson<{ count: number; userInfo: MiSubSubscription['userInfo'] }>(baseUrl, cookie, '/api/node_count', {
      method: 'POST',
      body: JSON.stringify({
        url,
        ...(fetchProxy ? { fetchProxy } : {}),
        ...(plusAsSpace ? { plusAsSpace: true } : {}),
      }),
    });
  }

  async batchUpdateMiSubNodes(record: IntegrationTokenRecord, subscriptionIds: string[]): Promise<MiSubBatchUpdateResult[]> {
    const { baseUrl, password } = this.parseMiSubRecord(record);
    const cookie = await this.loginMiSub(baseUrl, password);
    const result = await this.fetchMiSubJson<{ success?: boolean; results?: MiSubBatchUpdateResult[] }>(baseUrl, cookie, '/api/batch_update_nodes', {
      method: 'POST',
      body: JSON.stringify({ subscriptionIds }),
    });
    return result.results || [];
  }

  buildMiSubRecordPayload(baseUrl: string, password: string): string {
    return this.serializeMiSubRecord(baseUrl, password);
  }
}
