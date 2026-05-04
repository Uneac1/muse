import { create } from 'zustand';

type Theme = 'light' | 'dark' | 'system';
export type DynamicSeed = 'apple' | 'claude' | 'spotify' | 'linear';

interface ThemeStore {
  theme: Theme;
  seed: DynamicSeed;
  setTheme: (theme: Theme) => void;
  setSeed: (seed: DynamicSeed) => void;
}

function normalizeSeed(seed: string | null): DynamicSeed {
  if (seed === 'apple' || seed === 'claude' || seed === 'spotify' || seed === 'linear') return seed;
  if (seed === 'ember' || seed === 'muse') return 'claude';
  if (seed === 'ocean') return 'apple';
  if (seed === 'violet') return 'linear';
  return 'claude';
}

function applyTheme(theme: Theme, seed: DynamicSeed = 'claude') {
  const root = document.documentElement;
  const isDark = theme === 'dark' || (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  root.classList.toggle('dark', isDark);
  root.dataset.seed = seed;
  root.classList.remove('theme-morphing');
  void root.offsetWidth;
  root.classList.add('theme-morphing');
  window.setTimeout(() => root.classList.remove('theme-morphing'), 720);
}

const stored = (typeof localStorage !== 'undefined' ? localStorage.getItem('theme') : null) as Theme | null;
const storedSeed = normalizeSeed(typeof localStorage !== 'undefined' ? localStorage.getItem('muse.dynamic.seed') : null);

export const useThemeStore = create<ThemeStore>((set) => ({
  theme: stored || 'light',
  seed: storedSeed,
  setTheme: (theme) => {
    localStorage.setItem('theme', theme);
    const seed = normalizeSeed(localStorage.getItem('muse.dynamic.seed'));
    applyTheme(theme, seed);
    set({ theme, seed });
  },
  setSeed: (seed) => {
    localStorage.setItem('muse.dynamic.seed', seed);
    const theme = (localStorage.getItem('theme') as Theme | null) || 'light';
    applyTheme(theme, seed);
    set({ seed });
  },
}));

// 初始化主题
applyTheme(stored || 'light', storedSeed);
