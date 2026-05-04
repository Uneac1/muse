import { lazy, type ComponentType, type LazyExoticComponent } from 'react';

type PageModule = { default: ComponentType<any> };
type PageLoader = () => Promise<PageModule>;
type RoutePath = `/${string}`;

export type PreloadablePage = LazyExoticComponent<ComponentType<any>> & {
  preload: PageLoader;
};

function lazyWithPreload(loader: PageLoader): PreloadablePage {
  let preloadPromise: Promise<PageModule> | undefined;
  const Component = lazy(loader) as PreloadablePage;
  Component.preload = () => {
    preloadPromise ??= loader();
    return preloadPromise;
  };
  return Component;
}

export const DashboardPage = lazyWithPreload(() => import('../pages/Dashboard'));
export const TodayPage = lazyWithPreload(() => import('../pages/Today'));
export const InboxPage = lazyWithPreload(() => import('../pages/Inbox'));
export const MemoryPage = lazyWithPreload(() => import('../pages/Memory'));
export const AccountsPage = lazyWithPreload(() => import('../pages/Accounts'));
export const ProxySettingsPage = lazyWithPreload(() => import('../pages/ProxySettings'));
export const CloudflareManagerPage = lazyWithPreload(() => import('../pages/CloudflareManager'));
export const GitHubManagerPage = lazyWithPreload(() => import('../pages/GitHubManager'));
export const LinuxDoManagerPage = lazyWithPreload(() => import('../pages/LinuxDoManager'));
export const NotionManagerPage = lazyWithPreload(() => import('../pages/NotionManager'));
export const YmailManagerPage = lazyWithPreload(() => import('../pages/YmailManager'));
export const SubscriptionManagerPage = lazyWithPreload(() => import('../pages/SubscriptionManager'));
export const AiStudioPage = lazyWithPreload(() => import('../pages/AiStudio'));
export const NewspaperPage = lazyWithPreload(() => import('../pages/Newspaper'));
export const NewspaperReaderPage = lazyWithPreload(() => import('../pages/NewspaperReader'));
export const CodexManagerPage = lazyWithPreload(() => import('../pages/CodexManager'));
export const OpenTeamsPage = lazyWithPreload(() => import('../pages/OpenTeams'));
export const ComponentShowcasePage = lazyWithPreload(() => import('../pages/ComponentShowcase'));

const routeAliases = new Map<RoutePath, RoutePath>([
  ['/', '/today'],
  ['/entities', '/today'],
  ['/rules', '/memory'],
  ['/tokens', '/codex'],
  ['/components/material', '/components'],
  ['/components/google-design', '/components'],
  ['/openteam', '/openteams'],
  ['/opteam', '/openteams'],
  ['/agent-workspace', '/openteams'],
  ['/open-agents', '/openteams'],
]);

const routePreloaders = new Map<RoutePath, PageLoader>([
  ['/today', TodayPage.preload],
  ['/inbox', InboxPage.preload],
  ['/memory', MemoryPage.preload],
  ['/dashboard', DashboardPage.preload],
  ['/accounts', AccountsPage.preload],
  ['/ai', AiStudioPage.preload],
  ['/codex', CodexManagerPage.preload],
  ['/openteams', OpenTeamsPage.preload],
  ['/components', ComponentShowcasePage.preload],
  ['/proxy', ProxySettingsPage.preload],
  ['/subscriptions', SubscriptionManagerPage.preload],
  ['/newspaper', NewspaperPage.preload],
  ['/newspaper/read', NewspaperReaderPage.preload],
  ['/cloudflare', CloudflareManagerPage.preload],
  ['/github', GitHubManagerPage.preload],
  ['/linuxdo', LinuxDoManagerPage.preload],
  ['/notion', NotionManagerPage.preload],
  ['/ymail', YmailManagerPage.preload],
]);

export function preloadRoute(path: string) {
  const routePath = path.split(/[?#]/, 1)[0] as RoutePath;
  const targetPath = routeAliases.get(routePath) ?? routePath;
  return routePreloaders.get(targetPath)?.();
}
