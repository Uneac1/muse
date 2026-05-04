import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { Moon, Sun, Monitor, Menu, Command, Search, Palette, Bot, RefreshCw, Check, Sparkles } from 'lucide-react';
import { useThemeStore } from '../../stores/theme';
import type { DynamicSeed } from '../../stores/theme';
import { CommandPalette } from '../os/CommandPalette';
import { getRouteMeta } from './navigation';

interface Props {
  onMenuClick: () => void;
}

export function Header({ onMenuClick }: Props) {
  const location = useLocation();
  const { theme, seed, setTheme, setSeed } = useThemeStore();
  const [commandOpen, setCommandOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const meta = getRouteMeta(location.pathname);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setCommandOpen(true);
      }
      if (event.key === '/') {
        const target = event.target as HTMLElement | null;
        const tag = target?.tagName?.toLowerCase();
        if (tag === 'input' || tag === 'textarea' || target?.isContentEditable) return;
        event.preventDefault();
        setCommandOpen(true);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const cycleTheme = () => {
    const next = theme === 'dark' ? 'light' : theme === 'light' ? 'system' : 'dark';
    setTheme(next);
  };

  const ThemeIcon = theme === 'dark' ? Moon : theme === 'light' ? Sun : Monitor;
  const seedOptions: Array<{ value: DynamicSeed; label: string; mood: string; swatches: [string, string, string, string] }> = [
    { value: 'apple', label: 'Apple', mood: 'White gallery + action blue', swatches: ['#ffffff', '#f5f5f7', '#0066cc', '#1d1d1f'] },
    { value: 'claude', label: 'Claude', mood: 'Cream canvas + coral editorial', swatches: ['#faf9f5', '#efe9de', '#cc785c', '#141413'] },
    { value: 'spotify', label: 'Spotify', mood: 'Dark player + functional green', swatches: ['#121212', '#181818', '#1ed760', '#ffffff'] },
    { value: 'linear', label: 'Linear', mood: 'Precision black + indigo system', swatches: ['#08090a', '#191a1b', '#7170ff', '#f7f8f8'] },
  ];
  const activeSeed = seedOptions.find((option) => option.value === seed) || seedOptions[0];

  return (
    <header className="muse-header sticky top-0 z-30 flex min-h-16 items-center justify-between gap-2 border-b border-[color:var(--outline-variant)] bg-[color:var(--surface-container-low)]/90 px-3 backdrop-blur-xl md:gap-3 md:px-6">
      <button onClick={onMenuClick} className="md:hidden md3-state-layer flex h-10 w-10 items-center justify-center rounded-full border border-[color:var(--outline-variant)] transition-colors">
        <Menu className="h-4 w-4 text-muted-foreground" />
      </button>
      <div className="min-w-0 flex-1 md:hidden">
        <p className="truncate text-sm font-semibold text-foreground">{meta.label}</p>
        <p className="truncate text-[11px] text-muted-foreground">{meta.eyebrow}</p>
      </div>
      <div className="hidden md:block">
        <div className="flex items-center gap-2">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{meta.eyebrow}</p>
          <span className="h-1 w-1 rounded-full bg-[color:var(--primary)]" />
          <p className="text-sm font-semibold text-foreground">{meta.label}</p>
        </div>
        <p className="max-w-xl truncate text-xs text-muted-foreground">{meta.description}</p>
      </div>
      <div className="flex shrink-0 items-center gap-1 md:gap-2">
        <button onClick={() => setCommandOpen(true)} className="md3-state-layer inline-flex h-10 w-10 items-center justify-center rounded-full border border-[color:var(--outline-variant)] text-muted-foreground md:hidden" title="打开搜索 / 动作">
          <Search className="h-4 w-4" />
        </button>
        <button onClick={() => setCommandOpen(true)} className="md3-state-layer hidden items-center gap-2 rounded-full border border-[color:var(--outline-variant)] bg-[color:var(--surface-container)] px-3 py-2 text-sm text-muted-foreground md:inline-flex md:min-w-44 lg:min-w-56">
          <Command className="h-4 w-4" />
          搜索 / 动作
        </button>
        <button className="md3-state-layer hidden h-10 items-center gap-2 rounded-full border border-[color:var(--outline-variant)] px-3 text-sm text-muted-foreground xl:inline-flex" title="AI 助手">
          <Bot className="h-4 w-4" />
          AI
        </button>
        <button className="md3-state-layer hidden h-10 items-center gap-2 rounded-full border border-[color:var(--outline-variant)] px-3 text-sm text-muted-foreground xl:inline-flex" title="同步">
          <RefreshCw className="h-4 w-4" />
          Sync
        </button>
        <div className="relative hidden xl:block">
          <button
            type="button"
            onClick={() => setPaletteOpen((value) => !value)}
            className="md3-state-layer muse-palette-trigger flex h-10 items-center gap-2 rounded-full border border-[color:var(--outline-variant)] bg-[color:var(--surface-container)] px-2.5 text-sm text-muted-foreground"
            title="动态色彩"
          >
            <Palette className="h-4 w-4" />
            <span className="muse-palette-trigger-swatch" aria-hidden="true">
              {activeSeed.swatches.map((color) => <i key={color} style={{ background: color }} />)}
            </span>
            <span className="font-medium text-foreground">{activeSeed.label}</span>
          </button>
          <AnimatePresence>
            {paletteOpen && (
              <motion.div
                initial={{ opacity: 0, y: 8, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 6, scale: 0.98 }}
                transition={{ duration: 0.18, ease: [0.2, 0, 0, 1] }}
                className="muse-palette-popover"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="inline-flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                      <Sparkles className="h-3.5 w-3.5" />
                      Design mode palette
                    </div>
                    <div className="mt-1 text-sm font-semibold text-foreground">选择品牌设计模式</div>
                  </div>
                  <div className="grid grid-cols-4 overflow-hidden rounded-full border border-[color:var(--outline-variant)]">
                    {activeSeed.swatches.map((color) => <span key={color} className="h-7 w-7" style={{ background: color }} />)}
                  </div>
                </div>

                <div className="mt-4 grid gap-2">
                  {seedOptions.map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => setSeed(option.value)}
                      className="md3-state-layer muse-palette-option"
                      data-active={seed === option.value}
                    >
                      <span className="muse-palette-option-swatches" aria-hidden="true">
                        {option.swatches.map((color) => <i key={color} style={{ background: color }} />)}
                      </span>
                      <span className="min-w-0 flex-1 text-left">
                        <span className="block text-sm font-semibold">{option.label}</span>
                        <span className="block truncate text-xs opacity-75">{option.mood}</span>
                      </span>
                      {seed === option.value && <Check className="h-4 w-4" />}
                    </button>
                  ))}
                </div>

                <div className="mt-4 rounded-2xl border border-[color:var(--outline-variant)] bg-[color:var(--surface-container)] p-3">
                  <div className="mb-2 text-xs font-semibold text-foreground">状态层预览</div>
                  <div className="flex flex-wrap gap-2">
                    <span className="rounded-full bg-[color:var(--primary)] px-3 py-1.5 text-xs font-semibold text-[color:var(--primary-foreground)]">Primary</span>
                    <span className="rounded-full bg-[color:var(--secondary-container)] px-3 py-1.5 text-xs font-semibold text-[color:var(--on-secondary-container)]">Tonal</span>
                    <span className="rounded-full bg-[color:var(--tertiary-container)] px-3 py-1.5 text-xs font-semibold text-[color:var(--on-tertiary-container)]">Signal</span>
                    <span className="rounded-full border border-[color:var(--outline-variant)] bg-[color:var(--surface-container-highest)] px-3 py-1.5 text-xs font-semibold text-foreground">Surface</span>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
        <div className="hidden items-center gap-1 rounded-full border border-[color:var(--outline-variant)] bg-[color:var(--surface-container)] p-1 lg:flex xl:hidden" title="动态色彩">
          {seedOptions.map((option) => (
            <button
              key={option.value}
              onClick={() => setSeed(option.value)}
              className={`h-7 w-7 rounded-full border transition-transform ${seed === option.value ? 'scale-110 border-foreground' : 'border-transparent'}`}
              style={{ background: `linear-gradient(135deg, ${option.swatches[0]} 0 46%, ${option.swatches[1]} 46% 70%, ${option.swatches[2]} 70% 100%)` }}
              title={option.label}
            />
          ))}
        </div>
        <button
          onClick={cycleTheme}
          className="md3-state-layer flex h-10 w-10 items-center justify-center rounded-full border border-[color:var(--outline-variant)] transition-colors"
          title={`当前: ${theme === 'dark' ? '暗色' : theme === 'light' ? '亮色' : '跟随系统'}`}
        >
          <ThemeIcon className="h-4 w-4 text-muted-foreground" />
        </button>
      </div>
      <CommandPalette open={commandOpen} onClose={() => setCommandOpen(false)} />
    </header>
  );
}
