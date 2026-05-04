import { useState } from 'react';
import { Link, Outlet, useLocation } from 'react-router-dom';
import { Bot, Cloud, FilePlus2, Inbox, MailPlus, Newspaper, Plus, RefreshCw, Settings2, Sparkles } from 'lucide-react';
import { AppSidebar } from './AppSidebar';
import { Header } from './Header';
import { getRouteMeta } from './navigation';
import { MaterialFab } from '../ui/MaterialFab';

const routeActions: Array<{ match: string; label: string; to: string; icon: typeof Plus }> = [
  { match: '/today', label: 'Capture signal', to: '/inbox', icon: Sparkles },
  { match: '/inbox', label: 'Process queue', to: '/today', icon: Inbox },
  { match: '/accounts', label: 'Add mailbox', to: '/accounts', icon: MailPlus },
  { match: '/ai', label: 'New chat', to: '/ai', icon: Bot },
  { match: '/tokens', label: 'Sync tokens', to: '/tokens', icon: RefreshCw },
  { match: '/codex', label: 'Switch account', to: '/codex', icon: Settings2 },
  { match: '/proxy', label: 'Test route', to: '/proxy', icon: RefreshCw },
  { match: '/cloudflare', label: 'Add asset', to: '/cloudflare', icon: Cloud },
  { match: '/github', label: 'Track repo', to: '/github', icon: FilePlus2 },
  { match: '/newspaper', label: 'Read signals', to: '/newspaper', icon: Newspaper },
];

function GlobalActionFab() {
  const location = useLocation();
  const meta = getRouteMeta(location.pathname);
  const action = routeActions.find((item) => location.pathname.startsWith(item.match)) || {
    label: `Open ${meta.label}`,
    to: location.pathname,
    icon: Plus,
  };
  const Icon = action.icon;

  return (
    <Link to={action.to} className="muse-global-fab md3-state-layer" aria-label={action.label} title={action.label}>
      <MaterialFab className="muse-global-fab-control" variant="primary">
        <Icon slot="icon" className="h-5 w-5" />
        <span>{action.label}</span>
      </MaterialFab>
    </Link>
  );
}

export function AppLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  return (
    <div className="muse-app-shell flex h-screen overflow-hidden bg-background">
      <AppSidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <div className="muse-content flex min-w-0 flex-1 flex-col overflow-hidden">
        <Header onMenuClick={() => setSidebarOpen(true)} />
        <main className="muse-main flex-1 overflow-auto overscroll-contain p-2.5 sm:p-4 md:p-6">
          <div className="muse-page-stage">
            <Outlet />
          </div>
        </main>
        <GlobalActionFab />
      </div>
    </div>
  );
}
