import { useState } from 'react';
import { NavLink } from 'react-router-dom';
import { motion } from 'framer-motion';
import { X, PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import { cn } from '../../lib/utils';
import { preloadRoute } from '../../lib/pageRegistry';
import { navSections } from './navigation';

interface Props {
  open: boolean;
  onClose: () => void;
}

export function AppSidebar({ open, onClose }: Props) {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <>
      {open && (
        <div className="fixed inset-0 z-40 bg-black/50 md:hidden" onClick={onClose} />
      )}
      <aside className={cn(
        "muse-sidebar fixed inset-y-0 left-0 z-50 flex-col border-r border-[color:var(--outline-variant)] bg-[color:var(--surface-container-lowest)] transition-[width,transform] duration-200 max-md:w-[min(236px,92vw)] md:static md:translate-x-0 md:flex",
        collapsed ? 'w-[72px]' : 'w-[236px]',
        open ? "flex translate-x-0" : "hidden -translate-x-full md:flex md:translate-x-0"
      )}>
        <div className={cn(
          "flex h-[72px] items-center justify-between border-b border-[color:var(--outline-variant)] px-5",
          collapsed && "justify-center px-2"
        )}>
          <div className="muse-brand-lockup">
            {collapsed ? (
              <span className="muse-brand-mark">M</span>
            ) : (
              <>
                <span className="muse-brand-word">Muse</span>
                <span className="muse-brand-subtitle text-sm font-semibold tracking-[0.08em]">Command Center</span>
              </>
            )}
          </div>
          <button onClick={() => setCollapsed(!collapsed)} className="md3-state-layer hidden shrink-0 rounded-[10px] p-2 text-muted-foreground md:inline-flex" title={collapsed ? '展开导航' : '折叠导航'}>
            {collapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
          </button>
          <button onClick={onClose} className="md:hidden rounded-[10px] p-2 transition-colors hover:bg-secondary">
            <X className="h-4 w-4 text-muted-foreground" />
          </button>
        </div>
        <nav className="muse-sidebar-nav flex-1 space-y-5 overflow-y-auto px-3 py-5 md:px-4 md:py-6">
          {navSections.map((group) => (
            <div key={group.id} className="space-y-1.5">
              {group.label && (
                <div className={cn("muse-nav-section-label px-1 pb-2 text-[10px] font-medium uppercase tracking-[0.22em] text-muted-foreground", collapsed && "sr-only")}>
                  {group.label}
                </div>
              )}
              {group.items.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  title={`${item.label} · ${item.description}`}
                  onClick={onClose}
                  onMouseEnter={() => void preloadRoute(item.to)}
                  onFocus={() => void preloadRoute(item.to)}
                  className={({ isActive }) =>
                    cn(
                      'muse-nav-link md3-state-layer group relative flex min-h-10 items-center gap-3 rounded-[10px] px-2.5 py-2 text-sm transition-colors',
                      isActive
                        ? 'muse-nav-link-active bg-[color:var(--primary-container)] text-[color:var(--on-primary-container)]'
                        : 'text-[color:var(--on-surface-variant)] hover:text-foreground',
                      collapsed && 'justify-center px-2'
                    )
                  }
                >
                  {({ isActive }) => (
                    <>
                      {isActive && (
                        <motion.span
                          layoutId="muse-sidebar-active"
                          className="muse-nav-active-rail"
                          transition={{ duration: 0.22, ease: [0.2, 0, 0, 1] }}
                        />
                      )}
                      <item.icon className="h-4 w-4 shrink-0 transition-transform duration-200 group-hover:-translate-y-0.5" />
                      <span className={cn("min-w-0", collapsed && "hidden")}>
                        <span className="block truncate font-medium">{item.shortLabel || item.label}</span>
                      </span>
                    </>
                  )}
                </NavLink>
              ))}
            </div>
          ))}
        </nav>
      </aside>
    </>
  );
}
