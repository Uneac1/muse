import { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { toast } from 'sonner';
import {
  ExternalLink,
  GitBranch,
  GitFork,
  GitPullRequest,
  Github,
  Package,
  RefreshCw,
  Search,
  Star,
  Unplug,
  UserCircle2,
  FolderGit2,
  Activity,
  FileCode2,
  Building2,
  Lock,
} from 'lucide-react';
import { integrationApi } from '../lib/api';
import { isIntegrationCacheFresh, readIntegrationCache, shouldShowInitialLoading, writeIntegrationCache } from '../lib/integrationCache';
import { timeAgo } from '../lib/utils';
import type { GitHubEvent, GitHubGist, GitHubIntegrationData, GitHubIssue, GitHubOrganization, GitHubPullRequest, GitHubRelease, GitHubRepository } from '../types';

const emptyState: GitHubIntegrationData = {
  connected: false,
  tokenMasked: '',
  lastSyncAt: null,
  profile: null,
  repos: [],
  starred: [],
  orgs: [],
  gists: [],
  events: [],
  issues: [],
  pulls: [],
  releases: [],
  branches: [],
};
const GITHUB_CACHE_KEY = 'muse.integration.github';
const cachedGitHub = readIntegrationCache<GitHubIntegrationData>(GITHUB_CACHE_KEY);

function SectionCard({ title, sub, children }: { title: string; sub?: string; children: React.ReactNode }) {
  return (
    <div className="glass-card p-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-foreground">{title}</h2>
          {sub && <p className="text-sm text-muted-foreground">{sub}</p>}
        </div>
      </div>
      <div className="mt-4">{children}</div>
    </div>
  );
}

function RepoList({ title, items, emptyText }: { title: string; items: GitHubRepository[]; emptyText: string }) {
  const visibleItems = items.slice(0, 60);
  return (
    <SectionCard title={title} sub={items.length > visibleItems.length ? `${items.length} 条记录 · 先渲染最近 ${visibleItems.length} 条` : `${items.length} 条记录`}>
      <div className="space-y-3">
        {items.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border bg-background/40 px-5 py-12 text-center text-sm text-muted-foreground">
            {emptyText}
          </div>
        ) : (
          visibleItems.map((repo) => (
            <div key={repo.id} className="rounded-2xl border border-border bg-background/40 p-4">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <div className="space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-base font-semibold text-foreground">{repo.full_name}</h3>
                    <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${repo.private ? 'bg-rose-500/15 text-rose-600 dark:text-rose-300' : 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-300'}`}>
                      {repo.private ? '私有' : repo.visibility || '公开'}
                    </span>
                    {repo.archived && (
                      <span className="rounded-full bg-slate-500/15 px-2.5 py-1 text-xs font-medium text-slate-600 dark:text-slate-300">
                        archived
                      </span>
                    )}
                    {repo.language && (
                      <span className="rounded-full bg-secondary px-2.5 py-1 text-xs font-medium text-secondary-foreground">
                        {repo.language}
                      </span>
                    )}
                  </div>
                  {repo.description && <p className="text-sm text-muted-foreground">{repo.description}</p>}
                  <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
                    <span>★ {repo.stargazers_count}</span>
                    <span>Fork {repo.forks_count}</span>
                    <span>Issues {repo.open_issues_count ?? 0}</span>
                    <span>分支 {repo.default_branch || '-'}</span>
                    <span>更新于 {new Date(repo.updated_at).toLocaleString('zh-CN')}</span>
                  </div>
                </div>
                <button
                  onClick={() => window.open(repo.html_url, '_blank', 'noopener,noreferrer')}
                  className="inline-flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm font-medium text-foreground hover:bg-secondary transition-colors"
                >
                  打开仓库
                  <ExternalLink className="h-4 w-4" />
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </SectionCard>
  );
}

function SimpleGrid<T>({ items, emptyText, render }: { items: T[]; emptyText: string; render: (item: T) => React.ReactNode }) {
  if (items.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-border bg-background/40 px-5 py-12 text-center text-sm text-muted-foreground">
        {emptyText}
      </div>
    );
  }

  return <div className="grid grid-cols-1 gap-3 md:grid-cols-2">{items.map(render)}</div>;
}

export default function GitHubManager() {
  const [data, setData] = useState<GitHubIntegrationData>(cachedGitHub.value || emptyState);
  const [token, setToken] = useState('');
  const [loading, setLoading] = useState(shouldShowInitialLoading(cachedGitHub.value));
  const [submitting, setSubmitting] = useState(false);
  const [repoQuery, setRepoQuery] = useState('');
  const [workQuery, setWorkQuery] = useState('');

  const load = async () => {
    try {
      setLoading(shouldShowInitialLoading(cachedGitHub.value));
      const result = await integrationApi.getGitHub();
      writeIntegrationCache(GITHUB_CACHE_KEY, result);
      setData(result);
    } catch (err: any) {
      toast.error(err.message || '加载 GitHub 信息失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isIntegrationCacheFresh<GitHubIntegrationData>(GITHUB_CACHE_KEY)) return;
    load();
  }, []);

  const connect = async () => {
    if (!token.trim()) {
      toast.error('请先输入 GitHub Token');
      return;
    }
    try {
      setSubmitting(true);
      const result = await integrationApi.connectGitHub(token.trim());
      writeIntegrationCache(GITHUB_CACHE_KEY, result);
      setData(result);
      setToken('');
      toast.success('GitHub 已连接');
    } catch (err: any) {
      toast.error(err.message || '连接 GitHub 失败');
    } finally {
      setSubmitting(false);
    }
  };

  const sync = async () => {
    try {
      setSubmitting(true);
      const result = await integrationApi.syncGitHub();
      writeIntegrationCache(GITHUB_CACHE_KEY, result);
      setData(result);
      toast.success('GitHub 数据已同步');
    } catch (err: any) {
      toast.error(err.message || '同步 GitHub 失败');
    } finally {
      setSubmitting(false);
    }
  };

  const disconnect = async () => {
    if (!confirm('确定断开 GitHub 连接吗？')) return;
    try {
      setSubmitting(true);
      await integrationApi.disconnectGitHub();
      writeIntegrationCache(GITHUB_CACHE_KEY, emptyState);
      setData(emptyState);
      toast.success('GitHub 已断开');
    } catch (err: any) {
      toast.error(err.message || '断开 GitHub 失败');
    } finally {
      setSubmitting(false);
    }
  };

  const filteredRepos = useMemo(() => {
    const q = repoQuery.trim().toLowerCase();
    if (!q) return data.repos;
    return data.repos.filter((repo) =>
      [repo.full_name, repo.description || '', repo.language || '', repo.default_branch || '']
        .join(' ')
        .toLowerCase()
        .includes(q)
    );
  }, [data.repos, repoQuery]);

  const languageRanks = useMemo(() => {
    const map = new Map<string, number>();
    for (const repo of data.repos) {
      if (!repo.language) continue;
      map.set(repo.language, (map.get(repo.language) || 0) + 1);
    }
    return [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6);
  }, [data.repos]);

  const filteredIssues = useMemo(() => {
    const q = workQuery.trim().toLowerCase();
    if (!q) return data.issues;
    return data.issues.filter((item) =>
      [item.repo_full_name, item.title, item.state, item.user?.login || '', ...(item.labels || []).map((label) => label.name)]
        .join(' ')
        .toLowerCase()
        .includes(q)
    );
  }, [data.issues, workQuery]);

  const filteredPulls = useMemo(() => {
    const q = workQuery.trim().toLowerCase();
    if (!q) return data.pulls;
    return data.pulls.filter((item) =>
      [item.repo_full_name, item.title, item.state, item.user?.login || '', item.head?.ref || '', item.base?.ref || '']
        .join(' ')
        .toLowerCase()
        .includes(q)
    );
  }, [data.pulls, workQuery]);

  const statCards = [
    { icon: FolderGit2, label: '仓库数量', value: data.repos.length, tone: 'from-slate-500/25 to-zinc-500/10' },
    { icon: Star, label: 'Star 数量', value: data.starred.length, tone: 'from-amber-500/25 to-yellow-500/10' },
    { icon: Building2, label: '组织数量', value: data.orgs.length, tone: 'from-sky-500/25 to-indigo-500/10' },
    { icon: FileCode2, label: 'Gist 数量', value: data.gists.length, tone: 'from-emerald-500/25 to-lime-500/10' },
    { icon: Lock, label: '私有仓库', value: data.repos.filter((item) => item.private).length, tone: 'from-rose-500/25 to-orange-500/10' },
    { icon: Activity, label: '最近动态', value: data.events.length, tone: 'from-cyan-500/25 to-blue-500/10' },
    { icon: GitPullRequest, label: '开放 PR', value: data.pulls.length, tone: 'from-violet-500/25 to-fuchsia-500/10' },
    { icon: Package, label: 'Release', value: data.releases.length, tone: 'from-lime-500/25 to-green-500/10' },
  ];

  return (
    <div className="space-y-6 p-6">
      <motion.div initial={{ opacity: 0, y: -12 }} animate={{ opacity: 1, y: 0 }} className="glass-card overflow-hidden">
        <div className="relative p-6">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(148,163,184,0.22),transparent_35%),radial-gradient(circle_at_bottom_right,rgba(59,130,246,0.12),transparent_30%)]" />
          <div className="relative flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-2xl">
              <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-slate-500/20 bg-slate-500/10 px-3 py-1 text-xs font-medium text-slate-600 dark:text-slate-300">
                <Github className="h-3.5 w-3.5" />
                GitHub 管理页面
              </div>
              <h1 className="text-3xl font-bold tracking-tight text-foreground">把 GitHub 账号、组织、仓库、Gist 和近期动态统一收拢</h1>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                现在不仅会读取仓库和 Star，还会补充组织、公开动态、Gist 和更细的仓库统计，适合你拿来做一个更完整的项目驾驶舱。
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <button
                onClick={() => window.open('https://github.com/login', '_blank', 'noopener,noreferrer')}
                className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
              >
                登录 GitHub
                <ExternalLink className="h-4 w-4" />
              </button>
              <button
                onClick={() => window.open('https://github.com/settings/tokens', '_blank', 'noopener,noreferrer')}
                className="inline-flex items-center gap-2 rounded-md border border-border px-4 py-2 text-sm font-medium text-foreground hover:bg-secondary transition-colors"
              >
                创建 Token
                <ExternalLink className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      </motion.div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4 2xl:grid-cols-8">
        {statCards.map((card, index) => (
          <motion.div
            key={card.label}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.05 * index }}
            className="glass-card p-5"
          >
            <div className={`mb-4 inline-flex rounded-2xl bg-gradient-to-br p-3 ${card.tone}`}>
              <card.icon className="h-5 w-5 text-foreground" />
            </div>
            <div className="text-2xl font-bold text-foreground">{card.value}</div>
            <div className="mt-1 text-sm text-muted-foreground">{card.label}</div>
          </motion.div>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[0.9fr_1.6fr]">
        <SectionCard title="Token 管理" sub="新增、替换、同步或断开 GitHub Token。">
          <div className="space-y-4">
            <label className="block space-y-2">
              <span className="text-sm font-medium text-foreground">GitHub Personal Access Token</span>
              <textarea
                value={token}
                onChange={(e) => setToken(e.target.value)}
                placeholder="粘贴新的 GitHub Token。保存后会覆盖当前正在使用的 Token。"
                rows={4}
                className="w-full resize-none rounded-lg border border-border bg-background/70 px-3 py-2.5 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
              />
            </label>

            <div className="rounded-xl border border-border bg-background/40 p-4 text-sm text-muted-foreground">
              <p className="font-medium text-foreground">当前 Token 状态</p>
              <p className="mt-2">已保存状态：{data.connected ? `已连接，当前显示为 ${data.tokenMasked}` : '尚未保存 Token'}</p>
              <p className="mt-2">最后同步：{data.lastSyncAt ? timeAgo(data.lastSyncAt) : '暂无'}</p>
              <p className="mt-3">建议权限：`repo`、`read:user`，如需更多私有数据可追加更高权限。</p>
            </div>

            <div className="flex flex-wrap gap-3">
              <button onClick={connect} disabled={submitting} className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50">
                <Github className="h-4 w-4" />
                连接并获取信息
              </button>
              <button onClick={sync} disabled={!data.connected || submitting} className="inline-flex items-center gap-2 rounded-md border border-border px-4 py-2 text-sm font-medium text-foreground hover:bg-secondary transition-colors disabled:opacity-50">
                <RefreshCw className={`h-4 w-4 ${submitting ? 'animate-spin' : ''}`} />
                刷新同步
              </button>
              <button onClick={disconnect} disabled={!data.connected || submitting} className="inline-flex items-center gap-2 rounded-md border border-red-500/30 px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-500/10 transition-colors disabled:opacity-50">
                <Unplug className="h-4 w-4" />
                断开连接
              </button>
            </div>
          </div>
        </SectionCard>

        <div className="space-y-6">
          <SectionCard title="GitHub 账号信息" sub="当前连接到的软件账号与概览。">
            {data.profile ? (
              <div className="space-y-4">
                <div className="flex flex-col gap-4 md:flex-row md:items-center">
                  <img src={data.profile.avatar_url} alt={data.profile.login} className="h-16 w-16 rounded-2xl border border-border object-cover" />
                  <div className="flex-1">
                    <div className="text-lg font-semibold text-foreground">{data.profile.name || data.profile.login}</div>
                    <div className="text-sm text-muted-foreground">@{data.profile.login}</div>
                    {data.profile.bio && <div className="mt-2 text-sm text-muted-foreground">{data.profile.bio}</div>}
                  </div>
                  <button onClick={() => window.open(data.profile!.html_url, '_blank', 'noopener,noreferrer')} className="inline-flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm font-medium text-foreground hover:bg-secondary transition-colors">
                    打开主页
                    <ExternalLink className="h-4 w-4" />
                  </button>
                </div>
                <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                  <div className="rounded-xl border border-border bg-background/40 p-4 text-sm text-muted-foreground">关注者<br /><span className="mt-1 block text-xl font-semibold text-foreground">{data.profile.followers}</span></div>
                  <div className="rounded-xl border border-border bg-background/40 p-4 text-sm text-muted-foreground">正在关注<br /><span className="mt-1 block text-xl font-semibold text-foreground">{data.profile.following}</span></div>
                  <div className="rounded-xl border border-border bg-background/40 p-4 text-sm text-muted-foreground">公开 / 私有仓库<br /><span className="mt-1 block text-xl font-semibold text-foreground">{data.profile.public_repos} / {data.profile.total_private_repos ?? 0}</span></div>
                </div>
                <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
                  {data.profile.company && <span>公司：{data.profile.company}</span>}
                  {data.profile.location && <span>地点：{data.profile.location}</span>}
                  {data.profile.blog && <span>主页：{data.profile.blog}</span>}
                </div>
              </div>
            ) : (
              <div className="rounded-2xl border border-dashed border-border bg-background/40 px-5 py-12 text-center text-sm text-muted-foreground">
                连接 GitHub 后，这里会显示更完整的账号资料。
              </div>
            )}
          </SectionCard>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <SectionCard title="组织" sub={`${data.orgs.length} 个组织`}>
              <SimpleGrid<GitHubOrganization>
                items={data.orgs}
                emptyText={loading ? '正在加载组织...' : '暂无组织数据。'}
                render={(org) => (
                  <div key={org.id} className="rounded-2xl border border-border bg-background/40 p-4">
                    <div className="flex items-center gap-3">
                      <img src={org.avatar_url} alt={org.login} className="h-10 w-10 rounded-xl border border-border object-cover" />
                      <div className="min-w-0 flex-1">
                        <div className="truncate font-medium text-foreground">{org.login}</div>
                        {org.description && <div className="truncate text-xs text-muted-foreground">{org.description}</div>}
                      </div>
                    </div>
                  </div>
                )}
              />
            </SectionCard>

            <SectionCard title="Gist" sub={`${data.gists.length} 条记录`}>
              <SimpleGrid<GitHubGist>
                items={data.gists}
                emptyText={loading ? '正在加载 Gist...' : '暂无 Gist 数据。'}
                render={(gist) => (
                  <div key={gist.id} className="rounded-2xl border border-border bg-background/40 p-4">
                    <div className="font-medium text-foreground">{gist.description || gist.id}</div>
                    <div className="mt-1 text-xs text-muted-foreground">{gist.public ? 'public' : 'secret'} · {Object.keys(gist.files).length} files</div>
                    <div className="mt-2 text-xs text-muted-foreground">更新于 {new Date(gist.updated_at).toLocaleString('zh-CN')}</div>
                  </div>
                )}
              />
            </SectionCard>
          </div>

          <SectionCard title="仓库语言分布" sub="按主语言统计仓库数量。">
            {languageRanks.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-border bg-background/40 px-5 py-12 text-center text-sm text-muted-foreground">
                暂无语言统计。
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                {languageRanks.map(([language, count]) => (
                  <div key={language} className="rounded-2xl border border-border bg-background/40 p-4">
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-foreground">{language}</span>
                      <span className="text-sm text-muted-foreground">{count}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </SectionCard>

          <SectionCard title="仓库检索" sub="按仓库名、描述、语言、默认分支筛选。">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                value={repoQuery}
                onChange={(e) => setRepoQuery(e.target.value)}
                placeholder="搜索仓库"
                className="w-full rounded-lg border border-border bg-background/70 py-2.5 pl-9 pr-3 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
              />
            </div>
          </SectionCard>

          <RepoList title="我的仓库" items={filteredRepos} emptyText={loading ? '正在加载仓库列表...' : '连接并同步后，这里会显示你的 GitHub 仓库。'} />
          <RepoList title="我的 Star" items={data.starred} emptyText={loading ? '正在加载 Star 列表...' : '连接并同步后，这里会显示你的 Star 收藏。'} />

          <SectionCard title="Issues / Pull Requests 检索" sub="跨仓库搜索标题、作者、标签、分支。">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                value={workQuery}
                onChange={(e) => setWorkQuery(e.target.value)}
                placeholder="搜索 Issue / PR"
                className="w-full rounded-lg border border-border bg-background/70 py-2.5 pl-9 pr-3 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
              />
            </div>
          </SectionCard>

          <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
            <SectionCard title="开放 Issues" sub={`${filteredIssues.length} / ${data.issues.length} 条`}>
              <div className="space-y-3">
                {filteredIssues.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-border bg-background/40 px-5 py-12 text-center text-sm text-muted-foreground">
                    {loading ? '正在加载 Issues...' : '暂无开放 Issue 或权限不足。'}
                  </div>
                ) : (
                  filteredIssues.slice(0, 80).map((issue: GitHubIssue) => (
                    <div key={issue.id} className="rounded-2xl border border-border bg-background/40 p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="truncate font-medium text-foreground">#{issue.number} {issue.title}</div>
                          <div className="mt-1 text-xs text-muted-foreground">{issue.repo_full_name} · {issue.user?.login} · comments {issue.comments}</div>
                          <div className="mt-2 flex flex-wrap gap-1">
                            {(issue.labels || []).slice(0, 5).map((label) => (
                              <span key={label.id} className="rounded-full px-2 py-0.5 text-[11px] font-medium" style={{ backgroundColor: `#${label.color}22`, color: `#${label.color}` }}>
                                {label.name}
                              </span>
                            ))}
                          </div>
                        </div>
                        <button onClick={() => window.open(issue.html_url, '_blank', 'noopener,noreferrer')} className="rounded-md border border-border px-3 py-2 text-xs text-foreground hover:bg-secondary">
                          打开
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </SectionCard>

            <SectionCard title="开放 Pull Requests" sub={`${filteredPulls.length} / ${data.pulls.length} 条`}>
              <div className="space-y-3">
                {filteredPulls.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-border bg-background/40 px-5 py-12 text-center text-sm text-muted-foreground">
                    {loading ? '正在加载 Pull Requests...' : '暂无开放 PR 或权限不足。'}
                  </div>
                ) : (
                  filteredPulls.slice(0, 80).map((pr: GitHubPullRequest) => (
                    <div key={pr.id} className="rounded-2xl border border-border bg-background/40 p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="truncate font-medium text-foreground">#{pr.number} {pr.title}</div>
                          <div className="mt-1 text-xs text-muted-foreground">{pr.repo_full_name} · {pr.user?.login}</div>
                          <div className="mt-2 flex flex-wrap gap-2 text-xs text-muted-foreground">
                            <span>{pr.head?.ref} → {pr.base?.ref}</span>
                            {pr.draft && <span className="rounded-full bg-slate-500/15 px-2 py-0.5 text-slate-600 dark:text-slate-300">draft</span>}
                          </div>
                        </div>
                        <button onClick={() => window.open(pr.html_url, '_blank', 'noopener,noreferrer')} className="rounded-md border border-border px-3 py-2 text-xs text-foreground hover:bg-secondary">
                          打开
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </SectionCard>
          </div>

          <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
            <SectionCard title="Releases" sub={`${data.releases.length} 条发布记录`}>
              <SimpleGrid<GitHubRelease>
                items={data.releases.slice(0, 80)}
                emptyText={loading ? '正在加载 Releases...' : '暂无 Release 数据。'}
                render={(release) => (
                  <div key={release.id} className="rounded-2xl border border-border bg-background/40 p-4">
                    <div className="font-medium text-foreground">{release.name || release.tag_name}</div>
                    <div className="mt-1 text-xs text-muted-foreground">{release.repo_full_name} · {release.tag_name}</div>
                    <div className="mt-2 flex flex-wrap gap-2 text-xs text-muted-foreground">
                      {release.prerelease && <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-amber-600 dark:text-amber-300">prerelease</span>}
                      {release.draft && <span className="rounded-full bg-slate-500/15 px-2 py-0.5 text-slate-600 dark:text-slate-300">draft</span>}
                      <span>{release.published_at ? new Date(release.published_at).toLocaleString('zh-CN') : '-'}</span>
                    </div>
                  </div>
                )}
              />
            </SectionCard>

            <SectionCard title="Branches" sub={`${data.branches.length} 条分支记录`}>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                {data.branches.slice(0, 100).map((branch) => (
                  <div key={`${branch.repo_full_name}:${branch.name}`} className="rounded-2xl border border-border bg-background/40 p-4">
                    <div className="flex items-center gap-2">
                      <GitBranch className="h-4 w-4 text-muted-foreground" />
                      <span className="truncate font-medium text-foreground">{branch.name}</span>
                      {branch.protected && <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[11px] text-emerald-600 dark:text-emerald-300">protected</span>}
                    </div>
                    <div className="mt-1 truncate text-xs text-muted-foreground">{branch.repo_full_name}</div>
                  </div>
                ))}
                {data.branches.length === 0 && (
                  <div className="rounded-2xl border border-dashed border-border bg-background/40 px-5 py-12 text-center text-sm text-muted-foreground md:col-span-2">
                    {loading ? '正在加载分支...' : '暂无分支数据。'}
                  </div>
                )}
              </div>
            </SectionCard>
          </div>

          <SectionCard title="最近动态" sub={`${data.events.length} 条公开事件`}>
            <div className="space-y-3">
              {data.events.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-border bg-background/40 px-5 py-12 text-center text-sm text-muted-foreground">
                  {loading ? '正在加载动态...' : '暂无公开动态。'}
                </div>
              ) : (
                data.events.map((event: GitHubEvent) => (
                  <div key={event.id} className="rounded-2xl border border-border bg-background/40 p-4">
                    <div className="flex flex-wrap items-center gap-3 text-sm">
                      <span className="font-medium text-foreground">{event.type}</span>
                      <span className="text-muted-foreground">{event.repo.name}</span>
                      <span className="text-muted-foreground">{new Date(event.created_at).toLocaleString('zh-CN')}</span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </SectionCard>
        </div>
      </div>
    </div>
  );
}
