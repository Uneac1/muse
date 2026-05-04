import { Suspense, useEffect, useMemo, useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'sonner';
import { AppLayout } from './components/layout/AppLayout';
import { LoginDialog } from './components/auth/LoginDialog';
import { AppErrorBoundary } from './components/system/AppErrorBoundary';
import { authApi, crsApi } from './lib/api';
import { readCacheState, removeCache, writeCache } from './lib/localCache';
import type { AuthCheckResult } from './types';
import {
  AccountsPage,
  AiStudioPage,
  CloudflareManagerPage,
  CodexManagerPage,
  ComponentShowcasePage,
  DashboardPage,
  GitHubManagerPage,
  InboxPage,
  LinuxDoManagerPage,
  MemoryPage,
  NewspaperPage,
  NewspaperReaderPage,
  OpenTeamsPage,
  NotionManagerPage,
  ProxySettingsPage,
  SubscriptionManagerPage,
  TodayPage,
  YmailManagerPage,
} from './lib/pageRegistry';

function scheduleIdleTask(task: () => void) {
  if (typeof window === 'undefined') return () => undefined;

  if ('requestIdleCallback' in window) {
    const id = window.requestIdleCallback(() => task(), { timeout: 1200 });
    return () => window.cancelIdleCallback(id);
  }

  const id = globalThis.setTimeout(task, 350);
  return () => globalThis.clearTimeout(id);
}

function RouteSkeleton() {
  return (
    <div className="space-y-4">
      <div className="h-8 w-56 animate-pulse rounded-xl bg-secondary" />
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <div className="h-40 animate-pulse rounded-3xl bg-secondary/80" />
        <div className="h-40 animate-pulse rounded-3xl bg-secondary/70 xl:col-span-2" />
      </div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="h-72 animate-pulse rounded-3xl bg-secondary/70" />
        <div className="h-72 animate-pulse rounded-3xl bg-secondary/60" />
      </div>
    </div>
  );
}

const AUTH_CACHE_KEY = 'muse.auth.check';
const AUTH_CACHE_MAX_AGE_MS = 5 * 60 * 1000;

export default function App() {
  const authCache = useMemo(() => readCacheState<AuthCheckResult>(AUTH_CACHE_KEY, AUTH_CACHE_MAX_AGE_MS), []);
  const [authRequired, setAuthRequired] = useState(() => !!authCache.value?.required);
  const [googleOAuthEnabled, setGoogleOAuthEnabled] = useState(() => !!authCache.value?.googleOAuthEnabled);
  const [showLogin, setShowLogin] = useState(false);
  const [checking, setChecking] = useState(() => !authCache.value && !localStorage.getItem('auth_token'));
  const routeFallback = useMemo(() => <RouteSkeleton />, []);

  useEffect(() => {
    const cancelAuthCheck = authCache.value && !authCache.isStale
      ? scheduleIdleTask(() => {
        void checkAuth();
      })
      : (() => {
        void checkAuth();
        return () => undefined;
      })();

    const handleAuthRequired = () => {
      removeCache(AUTH_CACHE_KEY);
      setAuthRequired(true);
      setShowLogin(true);
    };
    window.addEventListener('auth-required', handleAuthRequired);
    return () => {
      window.removeEventListener('auth-required', handleAuthRequired);
      cancelAuthCheck();
    };
  }, []);

  useEffect(() => {
    return scheduleIdleTask(() => {
      void crsApi.status().catch(() => undefined);
    });
  }, []);

  const checkAuth = async () => {
    try {
      const result = await authApi.check();
      writeCache(AUTH_CACHE_KEY, result);
      setAuthRequired(result.required);
      setGoogleOAuthEnabled(!!result.googleOAuthEnabled);
      if (result.required && !localStorage.getItem('auth_token')) {
        setShowLogin(true);
      }
    } catch {
      // 忽略错误
    } finally {
      setChecking(false);
    }
  };

  if (checking) {
    return <div className="flex items-center justify-center h-screen">加载中...</div>;
  }

  const renderLazyPage = (Page: React.ComponentType) => (
    <Suspense fallback={routeFallback}>
      <Page />
    </Suspense>
  );

  return (
    <AppErrorBoundary>
      <BrowserRouter>
        <Toaster position="top-right" richColors closeButton />
        {authRequired && <LoginDialog open={showLogin} googleOAuthEnabled={googleOAuthEnabled} onSuccess={() => setShowLogin(false)} />}
        <Routes>
          <Route element={<AppLayout />}>
            <Route path="/today" element={renderLazyPage(TodayPage)} />
            <Route path="/inbox" element={renderLazyPage(InboxPage)} />
            <Route path="/entities" element={<Navigate to="/today" replace />} />
            <Route path="/rules" element={<Navigate to="/memory" replace />} />
            <Route path="/memory" element={renderLazyPage(MemoryPage)} />
            <Route path="/dashboard" element={renderLazyPage(DashboardPage)} />
            <Route path="/accounts" element={renderLazyPage(AccountsPage)} />
            <Route path="/ai" element={renderLazyPage(AiStudioPage)} />
            <Route path="/tokens" element={<Navigate to="/codex" replace />} />
            <Route path="/codex" element={renderLazyPage(CodexManagerPage)} />
            <Route path="/openteams" element={renderLazyPage(OpenTeamsPage)} />
            <Route path="/components" element={renderLazyPage(ComponentShowcasePage)} />
            <Route path="/components/material" element={<Navigate to="/components" replace />} />
            <Route path="/components/google-design" element={<Navigate to="/components" replace />} />
            <Route path="/openteam" element={<Navigate to="/openteams" replace />} />
            <Route path="/opteam" element={<Navigate to="/openteams" replace />} />
            <Route path="/agent-workspace" element={<Navigate to="/openteams" replace />} />
            <Route path="/open-agents" element={<Navigate to="/openteams" replace />} />
            <Route path="/proxy" element={renderLazyPage(ProxySettingsPage)} />
            <Route path="/cloudflare" element={renderLazyPage(CloudflareManagerPage)} />
            <Route path="/github" element={renderLazyPage(GitHubManagerPage)} />
            <Route path="/linuxdo" element={renderLazyPage(LinuxDoManagerPage)} />
            <Route path="/notion" element={renderLazyPage(NotionManagerPage)} />
            <Route path="/ymail" element={renderLazyPage(YmailManagerPage)} />
            <Route path="/subscriptions" element={renderLazyPage(SubscriptionManagerPage)} />
            <Route path="/newspaper" element={renderLazyPage(NewspaperPage)} />
            <Route path="/newspaper/read" element={renderLazyPage(NewspaperReaderPage)} />
            <Route path="/" element={<Navigate to="/today" replace />} />
            <Route path="*" element={<Navigate to="/today" replace />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </AppErrorBoundary>
  );
}
