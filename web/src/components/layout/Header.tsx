import { useEffect, useState } from 'react';
import { Moon, Sun, Monitor, Menu, Command, Search } from 'lucide-react';
import { useThemeStore } from '../../stores/theme';
import { CommandPalette } from '../os/CommandPalette';

interface Props {
  onMenuClick: () => void;
}

export function Header({ onMenuClick }: Props) {
  const { theme, setTheme } = useThemeStore();
  const [commandOpen, setCommandOpen] = useState(false);

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

  return (
    <header className="flex h-14 items-center justify-between border-b border-border bg-card px-4 md:px-6">
      <button onClick={onMenuClick} className="md:hidden flex h-9 w-9 items-center justify-center rounded-md border border-border hover:bg-secondary transition-colors">
        <Menu className="h-4 w-4 text-muted-foreground" />
      </button>
      <div className="hidden md:block">
        <p className="text-sm font-semibold text-foreground">Muse</p>
        <p className="text-xs text-muted-foreground">统一信息、异常、实体和下一步的个人操作系统</p>
      </div>
      <div className="flex items-center gap-2">
        <button onClick={() => setCommandOpen(true)} className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-border text-muted-foreground transition-colors hover:bg-secondary md:hidden" title="打开搜索 / 动作">
          <Search className="h-4 w-4" />
        </button>
        <button onClick={() => setCommandOpen(true)} className="hidden items-center gap-2 rounded-md border border-border px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-secondary md:inline-flex">
          <Command className="h-4 w-4" />
          搜索 / 动作
        </button>
        <button
          onClick={cycleTheme}
          className="flex h-9 w-9 items-center justify-center rounded-md border border-border hover:bg-secondary transition-colors"
          title={`当前: ${theme === 'dark' ? '暗色' : theme === 'light' ? '亮色' : '跟随系统'}`}
        >
          <ThemeIcon className="h-4 w-4 text-muted-foreground" />
        </button>
      </div>
      <CommandPalette open={commandOpen} onClose={() => setCommandOpen(false)} />
    </header>
  );
}
