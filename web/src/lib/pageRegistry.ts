import { lazy, type ComponentType, type LazyExoticComponent } from 'react';

type PageModule = { default: ComponentType<any> };
type PageLoader = () => Promise<PageModule>;

export type PreloadablePage = LazyExoticComponent<ComponentType<any>> & {
  preload: PageLoader;
};

function lazyWithPreload(loader: PageLoader): PreloadablePage {
  const Component = lazy(loader) as PreloadablePage;
  Component.preload = loader;
  return Component;
}

export const DashboardPage = lazyWithPreload(() => import('../pages/Dashboard'));
export const TodayPage = lazyWithPreload(() => import('../pages/Today'));
export const InboxPage = lazyWithPreload(() => import('../pages/Inbox'));
export const EntitiesPage = lazyWithPreload(() => import('../pages/Entities'));
export const RulesPage = lazyWithPreload(() => import('../pages/Rules'));
export const MemoryPage = lazyWithPreload(() => import('../pages/Memory'));
export const AccountsPage = lazyWithPreload(() => import('../pages/Accounts'));
export const ProxySettingsPage = lazyWithPreload(() => import('../pages/ProxySettings'));
export const CloudflareManagerPage = lazyWithPreload(() => import('../pages/CloudflareManager'));
export const GitHubManagerPage = lazyWithPreload(() => import('../pages/GitHubManager'));
export const NotionManagerPage = lazyWithPreload(() => import('../pages/NotionManager'));
export const YmailManagerPage = lazyWithPreload(() => import('../pages/YmailManager'));
export const SubscriptionManagerPage = lazyWithPreload(() => import('../pages/SubscriptionManager'));
export const AiStudioPage = lazyWithPreload(() => import('../pages/AiStudio'));
export const NewspaperPage = lazyWithPreload(() => import('../pages/Newspaper'));
export const NewspaperReaderPage = lazyWithPreload(() => import('../pages/NewspaperReader'));
export const TokenAnalyticsPage = lazyWithPreload(() => import('../pages/TokenAnalytics'));

const routePreloaders = new Map<string, PageLoader>([
  ['/today', TodayPage.preload],
  ['/inbox', InboxPage.preload],
  ['/entities', EntitiesPage.preload],
  ['/rules', RulesPage.preload],
  ['/memory', MemoryPage.preload],
  ['/dashboard', DashboardPage.preload],
  ['/accounts', AccountsPage.preload],
  ['/ai', AiStudioPage.preload],
  ['/tokens', TokenAnalyticsPage.preload],
  ['/proxy', ProxySettingsPage.preload],
  ['/subscriptions', SubscriptionManagerPage.preload],
  ['/newspaper', NewspaperPage.preload],
  ['/newspaper/read', NewspaperReaderPage.preload],
  ['/cloudflare', CloudflareManagerPage.preload],
  ['/github', GitHubManagerPage.preload],
  ['/notion', NotionManagerPage.preload],
  ['/ymail', YmailManagerPage.preload],
]);

export function preloadRoute(path: string) {
  return routePreloaders.get(path)?.();
}

export function warmCriticalRoutes() {
  return Promise.allSettled([
    TodayPage.preload(),
    InboxPage.preload(),
    DashboardPage.preload(),
    AccountsPage.preload(),
    AiStudioPage.preload(),
    ProxySettingsPage.preload(),
  ]);
}
