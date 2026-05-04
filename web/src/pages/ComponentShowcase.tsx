import { useMemo, useState } from 'react';
import {
  Accessibility,
  Activity,
  AlertTriangle,
  ArrowUpRight,
  BadgeCheck,
  Blocks,
  BookOpenText,
  Box,
  CheckCircle2,
  ChevronRight,
  Code2,
  Component,
  Cpu,
  Database,
  Eye,
  Gauge,
  Grid3X3,
  Image,
  Layers3,
  LayoutDashboard,
  ListChecks,
  LockKeyhole,
  Menu,
  MousePointer2,
  Palette,
  PanelLeft,
  PanelTop,
  Play,
  Radio,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  Smartphone,
  Sparkles,
  SquareStack,
  Table2,
  Tablet,
  Type,
  WandSparkles,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import {
  Button,
  Card,
  ChipSet,
  FilterChip,
  ListItem,
  SelectInput,
  Slider,
  StatusTag,
  Switch,
  TextArea,
  TextInput,
} from '../components/ui/primitives';
import { ControlPage, InlineProgress, SegmentedControl } from '../components/layout/ControlCenter';

type GalleryMode = 'system' | 'editorial';
type DeviceMode = 'desktop' | 'tablet' | 'mobile';
type PreviewTab = 'preview' | 'states' | 'spec';
type ComponentStatus = 'ready' | 'review' | 'deprecated';
type ComponentKind =
  | 'layout'
  | 'button'
  | 'input'
  | 'selection'
  | 'surface'
  | 'typography'
  | 'color'
  | 'media'
  | 'responsive'
  | 'interaction'
  | 'data'
  | 'motion'
  | 'accessibility'
  | 'performance'
  | 'security';

interface GallerySection {
  id: string;
  title: string;
  icon: LucideIcon;
  description: string;
}

interface GalleryComponent {
  id: string;
  sectionId: string;
  title: string;
  kind: ComponentKind;
  icon: LucideIcon;
  status: ComponentStatus;
  summary: string;
  props: string[];
  tokens: string[];
}

const sections: GallerySection[] = [
  { id: 'foundation', title: 'Foundations', icon: Layers3, description: '字体、色彩、间距、状态和 token。' },
  { id: 'layout', title: 'Layout', icon: Grid3X3, description: 'Shell、容器、栅格、头部、侧栏和底部。' },
  { id: 'actions', title: 'Actions', icon: MousePointer2, description: '按钮、FAB、命令入口和交互反馈。' },
  { id: 'forms', title: 'Forms', icon: ListChecks, description: '输入、选择、校验、开关和表单组合。' },
  { id: 'content', title: 'Content', icon: BookOpenText, description: '卡片、列表、图像、多媒体和编辑栏目。' },
  { id: 'data', title: 'Data', icon: Table2, description: '表格、指标、图表和数据状态。' },
  { id: 'quality', title: 'Quality', icon: ShieldCheck, description: '可访问性、性能、安全和 SEO。' },
];

const gallery: GalleryComponent[] = [
  {
    id: 'color-system',
    sectionId: 'foundation',
    title: 'Color roles',
    kind: 'color',
    icon: Palette,
    status: 'ready',
    summary: 'Primary、container、surface、error 等语义色块，点击可切换主预览角色。',
    props: ['role', 'surface', 'tone', 'contrast'],
    tokens: ['--primary', '--primary-container', '--surface-container', '--error-container'],
  },
  {
    id: 'type-scale',
    sectionId: 'foundation',
    title: 'Typography scale',
    kind: 'typography',
    icon: Type,
    status: 'ready',
    summary: 'Display、headline、title、body、label 的真实排版样张。',
    props: ['scale', 'weight', 'lineHeight', 'sample'],
    tokens: ['font-display', 'text-5xl', 'leading-[0.96]', 'text-muted-foreground'],
  },
  {
    id: 'adaptive-shell',
    sectionId: 'layout',
    title: 'Adaptive shell',
    kind: 'layout',
    icon: LayoutDashboard,
    status: 'ready',
    summary: 'Header、navigation rail、侧栏、内容网格和底部状态区组合。',
    props: ['device', 'density', 'sidebar', 'header'],
    tokens: ['--surface-container-lowest', '--outline-variant', '--elevation-2'],
  },
  {
    id: 'responsive-stage',
    sectionId: 'layout',
    title: 'Responsive stage',
    kind: 'responsive',
    icon: Smartphone,
    status: 'ready',
    summary: '桌面、平板、移动宽度即时切换，观察布局密度变化。',
    props: ['viewport', 'columns', 'density', 'breakpoint'],
    tokens: ['xl:grid-cols-*', 'md:grid-cols-*', 'minmax(0,1fr)'],
  },
  {
    id: 'button-matrix',
    sectionId: 'actions',
    title: 'Button matrix',
    kind: 'button',
    icon: MousePointer2,
    status: 'ready',
    summary: 'Filled、tonal、outlined、text、elevated 和 disabled 状态。',
    props: ['variant', 'disabled', 'icon', 'label'],
    tokens: ['md-filled-button', 'md-outlined-button', 'md-text-button'],
  },
  {
    id: 'interaction-effects',
    sectionId: 'actions',
    title: 'Interaction effects',
    kind: 'interaction',
    icon: Sparkles,
    status: 'ready',
    summary: 'Hover、pressed、focus、selected 和最后动作反馈。',
    props: ['state', 'motion', 'focusRing', 'feedback'],
    tokens: ['md3-state-layer', 'ring-2', 'transition-transform'],
  },
  {
    id: 'field-stack',
    sectionId: 'forms',
    title: 'Field stack',
    kind: 'input',
    icon: ListChecks,
    status: 'ready',
    summary: 'Text field、select、textarea、helper text 和错误态。',
    props: ['value', 'disabled', 'validation', 'helper'],
    tokens: ['md-filled-text-field', 'md-outlined-select', '--error-container'],
  },
  {
    id: 'selection-controls',
    sectionId: 'forms',
    title: 'Selection controls',
    kind: 'selection',
    icon: Radio,
    status: 'ready',
    summary: 'Filter chip、segmented control、switch 和多选状态。',
    props: ['selected', 'multiple', 'disabled', 'group'],
    tokens: ['md-filter-chip', 'md-switch', 'segmented-control'],
  },
  {
    id: 'cards-lists',
    sectionId: 'content',
    title: 'Cards and lists',
    kind: 'surface',
    icon: SquareStack,
    status: 'ready',
    summary: 'Elevated、outlined、filled 卡片，列表行和可点击内容面。',
    props: ['variant', 'selected', 'leading', 'trailing'],
    tokens: ['md-elevated-card', 'md-list-item', '--surface-container-high'],
  },
  {
    id: 'media-players',
    sectionId: 'content',
    title: 'Media modules',
    kind: 'media',
    icon: Image,
    status: 'review',
    summary: '图片框、视频播放器、音频波形和懒加载占位。',
    props: ['ratio', 'poster', 'caption', 'controls'],
    tokens: ['aspect-video', 'object-cover', 'loading=lazy'],
  },
  {
    id: 'data-display',
    sectionId: 'data',
    title: 'Data display',
    kind: 'data',
    icon: Database,
    status: 'ready',
    summary: '表格、指标卡、状态标签和轻量图表。',
    props: ['rows', 'columns', 'sort', 'status'],
    tokens: ['metric-tile', 'status-pill', 'InlineProgress'],
  },
  {
    id: 'motion-kit',
    sectionId: 'data',
    title: 'Motion kit',
    kind: 'motion',
    icon: WandSparkles,
    status: 'review',
    summary: '加载、进入、选择和状态过渡动画。',
    props: ['enabled', 'duration', 'delay', 'easing'],
    tokens: ['animate-pulse', 'transition', 'duration-300'],
  },
  {
    id: 'accessibility-kit',
    sectionId: 'quality',
    title: 'Accessibility kit',
    kind: 'accessibility',
    icon: Accessibility,
    status: 'ready',
    summary: 'ARIA、语义 landmark、键盘焦点和状态消息。',
    props: ['ariaLabel', 'role', 'focus', 'status'],
    tokens: ['aria-label', 'role=status', 'focus-visible:ring'],
  },
  {
    id: 'performance-kit',
    sectionId: 'quality',
    title: 'Performance kit',
    kind: 'performance',
    icon: Gauge,
    status: 'ready',
    summary: '懒加载、骨架屏、稳定尺寸和路由预热。',
    props: ['lazy', 'skeleton', 'preload', 'aspectRatio'],
    tokens: ['lazyWithPreload', 'RouteSkeleton', 'aspect-video'],
  },
  {
    id: 'security-kit',
    sectionId: 'quality',
    title: 'Security kit',
    kind: 'security',
    icon: LockKeyhole,
    status: 'ready',
    summary: 'XSS 文本渲染、权限确认、CSRF 提示和安全状态。',
    props: ['safeText', 'permission', 'csrf', 'risk'],
    tokens: ['textContent', 'confirmation', '--error-container'],
  },
];

const sourceComponentInventory = [
  { name: 'AccountTable', group: 'accounts', path: '../components/accounts/AccountTable', status: 'ready' },
  { name: 'AccountToolbar', group: 'accounts', path: '../components/accounts/AccountToolbar', status: 'ready' },
  { name: 'BackupRestore', group: 'accounts', path: '../components/accounts/BackupRestore', status: 'ready' },
  { name: 'ComposeMailDialog', group: 'accounts', path: '../components/accounts/ComposeMailDialog', status: 'ready' },
  { name: 'ContextMenu', group: 'accounts', path: '../components/accounts/ContextMenu', status: 'ready' },
  { name: 'EditAccountDialog', group: 'accounts', path: '../components/accounts/EditAccountDialog', status: 'ready' },
  { name: 'ImportDialog', group: 'accounts', path: '../components/accounts/ImportDialog', status: 'ready' },
  { name: 'MailViewerDialog', group: 'accounts', path: '../components/accounts/MailViewerDialog', status: 'ready' },
  { name: 'PasteImportDialog', group: 'accounts', path: '../components/accounts/PasteImportDialog', status: 'ready' },
  { name: 'RecentMailPanel', group: 'accounts', path: '../components/accounts/RecentMailPanel', status: 'ready' },
  { name: 'AiAccountDialog', group: 'ai', path: '../components/ai/AiAccountDialog', status: 'ready' },
  { name: 'GlobalAiDock', group: 'ai', path: '../components/ai/GlobalAiDock', status: 'ready' },
  { name: 'MuseCopilot', group: 'ai', path: '../components/ai/MuseCopilot', status: 'ready' },
  { name: 'LoginDialog', group: 'auth', path: '../components/auth/LoginDialog', status: 'ready' },
  { name: 'QuickActions', group: 'dashboard', path: '../components/dashboard/QuickActions', status: 'ready' },
  { name: 'RecentMails', group: 'dashboard', path: '../components/dashboard/RecentMails', status: 'ready' },
  { name: 'StatCard', group: 'dashboard', path: '../components/dashboard/StatCard', status: 'ready' },
  { name: 'AppLayout', group: 'layout', path: '../components/layout/AppLayout', status: 'ready' },
  { name: 'AppSidebar', group: 'layout', path: '../components/layout/AppSidebar', status: 'ready' },
  { name: 'ControlCenter', group: 'layout', path: '../components/layout/ControlCenter', status: 'ready' },
  { name: 'Header', group: 'layout', path: '../components/layout/Header', status: 'ready' },
  { name: 'navigation', group: 'layout', path: '../components/layout/navigation', status: 'ready' },
  { name: 'SpotlightDeck', group: 'layout', path: '../components/layout/SpotlightDeck', status: 'deprecated' },
  { name: 'MailCard', group: 'mail', path: '../components/mail/MailCard', status: 'ready' },
  { name: 'MailContent', group: 'mail', path: '../components/mail/MailContent', status: 'ready' },
  { name: 'MailList', group: 'mail', path: '../components/mail/MailList', status: 'ready' },
  { name: 'MailSkeleton', group: 'mail', path: '../components/mail/MailSkeleton', status: 'ready' },
  { name: 'DynamicWidgetShowcase', group: 'md3', path: '../components/md3/DynamicWidgetShowcase', status: 'ready' },
  { name: 'ReaderDrawer', group: 'newspaper', path: '../components/newspaper/ReaderDrawer', status: 'ready' },
  { name: 'ActionItemCard', group: 'os', path: '../components/os/ActionItemCard', status: 'ready' },
  { name: 'CommandPalette', group: 'os', path: '../components/os/CommandPalette', status: 'ready' },
  { name: 'useOsWorkspace', group: 'os', path: '../components/os/useOsWorkspace', status: 'ready' },
  { name: 'ProxyForm', group: 'proxy', path: '../components/proxy/ProxyForm', status: 'ready' },
  { name: 'ProxyTable', group: 'proxy', path: '../components/proxy/ProxyTable', status: 'ready' },
  { name: 'ProxyTestButton', group: 'proxy', path: '../components/proxy/ProxyTestButton', status: 'ready' },
  { name: 'AppErrorBoundary', group: 'system', path: '../components/system/AppErrorBoundary', status: 'ready' },
  { name: 'TokenAccountDialog', group: 'tokens', path: '../components/tokens/TokenAccountDialog', status: 'ready' },
  { name: 'Md3DeleteIcon', group: 'ui', path: '../components/ui/Md3DeleteIcon', status: 'ready' },
  { name: 'primitives', group: 'ui', path: '../components/ui/primitives', status: 'ready' },
] as const;

const sourceComponentLoaders = {
  AccountTable: () => import('../components/accounts/AccountTable'),
  AccountToolbar: () => import('../components/accounts/AccountToolbar'),
  BackupRestore: () => import('../components/accounts/BackupRestore'),
  ComposeMailDialog: () => import('../components/accounts/ComposeMailDialog'),
  ContextMenu: () => import('../components/accounts/ContextMenu'),
  EditAccountDialog: () => import('../components/accounts/EditAccountDialog'),
  ImportDialog: () => import('../components/accounts/ImportDialog'),
  MailViewerDialog: () => import('../components/accounts/MailViewerDialog'),
  PasteImportDialog: () => import('../components/accounts/PasteImportDialog'),
  RecentMailPanel: () => import('../components/accounts/RecentMailPanel'),
  AiAccountDialog: () => import('../components/ai/AiAccountDialog'),
  GlobalAiDock: () => import('../components/ai/GlobalAiDock'),
  MuseCopilot: () => import('../components/ai/MuseCopilot'),
  LoginDialog: () => import('../components/auth/LoginDialog'),
  QuickActions: () => import('../components/dashboard/QuickActions'),
  RecentMails: () => import('../components/dashboard/RecentMails'),
  StatCard: () => import('../components/dashboard/StatCard'),
  AppLayout: () => import('../components/layout/AppLayout'),
  AppSidebar: () => import('../components/layout/AppSidebar'),
  ControlCenter: () => import('../components/layout/ControlCenter'),
  Header: () => import('../components/layout/Header'),
  navigation: () => import('../components/layout/navigation'),
  SpotlightDeck: () => import('../components/layout/SpotlightDeck'),
  MailCard: () => import('../components/mail/MailCard'),
  MailContent: () => import('../components/mail/MailContent'),
  MailList: () => import('../components/mail/MailList'),
  MailSkeleton: () => import('../components/mail/MailSkeleton'),
  DynamicWidgetShowcase: () => import('../components/md3/DynamicWidgetShowcase'),
  ReaderDrawer: () => import('../components/newspaper/ReaderDrawer'),
  ActionItemCard: () => import('../components/os/ActionItemCard'),
  CommandPalette: () => import('../components/os/CommandPalette'),
  useOsWorkspace: () => import('../components/os/useOsWorkspace'),
  ProxyForm: () => import('../components/proxy/ProxyForm'),
  ProxyTable: () => import('../components/proxy/ProxyTable'),
  ProxyTestButton: () => import('../components/proxy/ProxyTestButton'),
  AppErrorBoundary: () => import('../components/system/AppErrorBoundary'),
  TokenAccountDialog: () => import('../components/tokens/TokenAccountDialog'),
  Md3DeleteIcon: () => import('../components/ui/Md3DeleteIcon'),
  primitives: () => import('../components/ui/primitives'),
} satisfies Record<(typeof sourceComponentInventory)[number]['name'], () => Promise<unknown>>;

const colorRoles = [
  ['Primary', 'var(--primary)', 'var(--primary-foreground)'],
  ['Primary container', 'var(--primary-container)', 'var(--on-primary-container)'],
  ['Secondary', 'var(--secondary-container)', 'var(--on-secondary-container)'],
  ['Tertiary', 'var(--tertiary-container)', 'var(--on-tertiary-container)'],
  ['Surface', 'var(--surface-container)', 'var(--foreground)'],
  ['Surface high', 'var(--surface-container-high)', 'var(--foreground)'],
  ['Success', 'var(--success-container)', 'var(--on-success-container)'],
  ['Error', 'var(--error-container)', 'var(--on-error-container)'],
] as const;

const deviceWidths: Record<DeviceMode, string> = {
  desktop: '100%',
  tablet: '720px',
  mobile: '390px',
};

function statusTone(status: ComponentStatus) {
  if (status === 'ready') return 'success' as const;
  if (status === 'review') return 'warning' as const;
  return 'danger' as const;
}

function statusLabel(status: ComponentStatus) {
  if (status === 'ready') return 'Ready';
  if (status === 'review') return 'Review';
  return 'Deprecated';
}

function componentSnippet(component: GalleryComponent, variant: string, enabled: boolean) {
  if (component.kind === 'button') {
    return `<Button variant="${variant}" disabled={${!enabled}}>
  Launch action
</Button>`;
  }

  if (component.kind === 'input') {
    return `<TextInput
  aria-label="Component name"
  placeholder="Component name"
  disabled={${!enabled}}
/>`;
  }

  if (component.kind === 'color') {
    return `<div style={{ background: 'var(--primary-container)' }}>
  Color role preview
</div>`;
  }

  if (component.kind === 'security') {
    return `<code>{userInput}</code>
<Button onClick={openConfirmation}>
  Preview confirmation
</Button>`;
  }

  return `<${component.title.replace(/\s+/g, '')}
  density="comfortable"
  interactive
/>`;
}

function ComponentTile({
  component,
  active,
  onClick,
}: {
  component: GalleryComponent;
  active: boolean;
  onClick: () => void;
}) {
  const Icon = component.icon;
  return (
    <button
      type="button"
      onClick={onClick}
      className={`group flex w-full items-center gap-3 rounded-[18px] border p-3 text-left transition-all hover:-translate-y-0.5 ${
        active
          ? 'border-[color:var(--primary)] bg-[color:var(--primary-container)] text-[color:var(--on-primary-container)] shadow-[var(--elevation-1)]'
          : 'border-[color:var(--outline-variant)] bg-[color:var(--surface-container-low)] text-foreground hover:bg-[color:var(--surface-container-high)]'
      }`}
    >
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-[14px] bg-current/10">
        <Icon className="h-4 w-4" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold">{component.title}</span>
        <span className="mt-0.5 block truncate text-xs opacity-70">{component.summary}</span>
      </span>
      <ChevronRight className="h-4 w-4 shrink-0 opacity-50 transition-transform group-hover:translate-x-0.5" />
    </button>
  );
}

function SectionPill({
  section,
  active,
  count,
  onClick,
}: {
  section: GallerySection;
  active: boolean;
  count: number;
  onClick: () => void;
}) {
  const Icon = section.icon;
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center gap-2 rounded-full border px-3 py-2 text-sm font-semibold ${
        active
          ? 'border-[color:var(--primary)] bg-[color:var(--primary)] text-[color:var(--primary-foreground)]'
          : 'border-[color:var(--outline-variant)] bg-[color:var(--surface-container)] text-foreground'
      }`}
    >
      <Icon className="h-4 w-4" />
      {section.title}
      <span className="rounded-full bg-current/12 px-1.5 text-xs">{count}</span>
    </button>
  );
}

function DeviceFrame({
  device,
  children,
}: {
  device: DeviceMode;
  children: React.ReactNode;
}) {
  return (
    <div className="overflow-x-auto rounded-[28px] bg-[color:var(--surface-container-highest)] p-3">
      <div
        className="mx-auto min-h-[420px] max-w-full overflow-hidden rounded-[24px] border border-[color:var(--outline-variant)] bg-[color:var(--surface-container-lowest)] transition-all"
        style={{ width: deviceWidths[device] }}
      >
        {children}
      </div>
    </div>
  );
}

function sourceSectionId(group: (typeof sourceComponentInventory)[number]['group']) {
  if (group === 'accounts' || group === 'mail' || group === 'proxy' || group === 'tokens') return 'forms';
  if (group === 'ai' || group === 'os') return 'actions';
  if (group === 'dashboard' || group === 'newspaper') return 'data';
  if (group === 'layout' || group === 'auth' || group === 'system') return 'layout';
  return 'foundation';
}

function sourceIcon(group: (typeof sourceComponentInventory)[number]['group']) {
  if (group === 'accounts' || group === 'mail') return ListChecks;
  if (group === 'ai') return Cpu;
  if (group === 'auth' || group === 'system') return ShieldCheck;
  if (group === 'dashboard' || group === 'tokens') return Gauge;
  if (group === 'layout') return LayoutDashboard;
  if (group === 'md3' || group === 'ui') return Component;
  if (group === 'newspaper') return BookOpenText;
  if (group === 'os') return MousePointer2;
  if (group === 'proxy') return Database;
  return Box;
}

function SourceComponentPreview({
  item,
  selected,
  onActivate,
}: {
  item: (typeof sourceComponentInventory)[number];
  selected: boolean;
  onActivate: () => void;
}) {
  const Icon = sourceIcon(item.group);

  const preview = () => {
    if (item.group === 'accounts') {
      return (
        <div className="space-y-2">
          <div className="flex items-center justify-between rounded-[18px] bg-[color:var(--surface-container-high)] p-2">
            <span className="flex items-center gap-2 text-xs font-semibold"><ListChecks className="h-3.5 w-3.5" /> Mail ops</span>
            <StatusTag tone="success">Synced</StatusTag>
          </div>
          {[0, 1, 2].map((row) => (
            <button key={row} type="button" onClick={onActivate} className="grid w-full grid-cols-[1fr,52px] gap-2 rounded-[14px] bg-[color:var(--surface-container)] p-2 text-left text-xs">
              <span className="truncate font-semibold">{row === 0 ? 'primary@muse.dev' : row === 1 ? 'compose draft' : 'recent mail'}</span>
              <span className="rounded-full bg-[color:var(--primary-container)] px-2 text-center text-[color:var(--on-primary-container)]">{row + 1}</span>
            </button>
          ))}
        </div>
      );
    }

    if (item.group === 'ai') {
      return (
        <div className="rounded-[20px] bg-[color:var(--inverse-surface)] p-3 text-[color:var(--inverse-on-surface)]">
          <div className="flex items-center gap-2 text-xs font-semibold"><Cpu className="h-3.5 w-3.5" /> Copilot dock</div>
          <div className="mt-8 rounded-[16px] bg-white/10 p-3 text-xs leading-5">Draft, explain, route.</div>
          <Button variant="tonal" className="mt-3" onClick={onActivate}>Ask AI</Button>
        </div>
      );
    }

    if (item.group === 'layout') {
      return (
        <div className="grid min-h-40 grid-rows-[32px,1fr] overflow-hidden rounded-[20px] border border-[color:var(--outline-variant)]">
          <div className="flex items-center justify-between bg-[color:var(--surface-container-high)] px-3 text-xs font-semibold">
            <span>Header</span>
            <Menu className="h-3.5 w-3.5" />
          </div>
          <div className="grid grid-cols-[44px,1fr]">
            <div className="space-y-2 bg-[color:var(--surface-container)] p-2">
              {[0, 1, 2].map((dot) => <button key={dot} type="button" onClick={onActivate} className="h-8 w-full rounded-full bg-[color:var(--surface-container-highest)]" />)}
            </div>
            <div className="grid grid-cols-2 gap-2 p-2">
              {[0, 1, 2, 3].map((tile) => <button key={tile} type="button" onClick={onActivate} className="rounded-[14px] bg-[color:var(--surface-container)]" />)}
            </div>
          </div>
        </div>
      );
    }

    if (item.group === 'mail') {
      return (
        <div className="space-y-2">
          {['Action required', 'Invoice received', 'Deploy notice'].map((mail, index) => (
            <button key={mail} type="button" onClick={onActivate} className="flex w-full items-center gap-2 rounded-[16px] bg-[color:var(--surface-container)] p-2 text-left">
              <span className="h-8 w-8 rounded-full bg-[color:var(--primary-container)]" />
              <span className="min-w-0 flex-1">
                <strong className="block truncate text-xs">{mail}</strong>
                <small className="block truncate text-muted-foreground">{index === 0 ? 'needs reply' : 'read later'}</small>
              </span>
            </button>
          ))}
        </div>
      );
    }

    if (item.group === 'proxy') {
      return (
        <div className="space-y-2">
          <div className="rounded-[16px] border border-[color:var(--outline-variant)] p-2">
            <div className="h-2 w-20 rounded-full bg-[color:var(--primary)]" />
            <div className="mt-3 h-7 rounded-[12px] bg-[color:var(--surface-container-high)]" />
          </div>
          <button type="button" onClick={onActivate} className="flex w-full items-center justify-between rounded-[16px] bg-[color:var(--success-container)] p-2 text-xs font-semibold text-[color:var(--on-success-container)]">
            Connected <CheckCircle2 className="h-3.5 w-3.5" />
          </button>
        </div>
      );
    }

    if (item.group === 'dashboard' || item.group === 'tokens') {
      return (
        <div className="grid grid-cols-2 gap-2">
          {['72%', '18k', '4'].map((value, index) => (
            <button key={value} type="button" onClick={onActivate} className={`${index === 0 ? 'col-span-2' : ''} rounded-[18px] bg-[color:var(--surface-container)] p-3 text-left`}>
              <span className="text-xs text-muted-foreground">{index === 0 ? 'Usage' : index === 1 ? 'Tokens' : 'Alerts'}</span>
              <strong className="mt-1 block text-xl">{value}</strong>
            </button>
          ))}
        </div>
      );
    }

    if (item.group === 'os') {
      return (
        <div className="rounded-[20px] border border-[color:var(--outline-variant)] bg-[color:var(--surface-container)] p-3">
          <div className="flex items-center gap-2 rounded-full bg-[color:var(--surface-container-high)] px-3 py-2 text-xs">
            <Search className="h-3.5 w-3.5" />
            command, action, route
          </div>
          <button type="button" onClick={onActivate} className="mt-3 flex w-full items-center justify-between rounded-[16px] bg-[color:var(--primary-container)] p-2 text-xs font-semibold text-[color:var(--on-primary-container)]">
            Run command <ArrowUpRight className="h-3.5 w-3.5" />
          </button>
        </div>
      );
    }

    if (item.group === 'newspaper') {
      return (
        <div className="rounded-[20px] bg-[color:var(--surface-container)] p-3">
          <div className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">Reader</div>
          <div className="mt-8 text-2xl font-semibold leading-tight">Dual-pane story drawer</div>
          <Button variant="text" className="mt-4" onClick={onActivate}>Open reader</Button>
        </div>
      );
    }

    if (item.group === 'auth' || item.group === 'system') {
      return (
        <div className="rounded-[20px] bg-[color:var(--error-container)] p-3 text-[color:var(--on-error-container)]">
          <div className="flex items-center gap-2 text-xs font-semibold"><ShieldCheck className="h-3.5 w-3.5" /> Guarded surface</div>
          <div className="mt-8 rounded-[16px] bg-black/5 p-3 text-xs">Login, error boundary, confirmation.</div>
          <Button variant="outlined" className="mt-3" onClick={onActivate}>Preview</Button>
        </div>
      );
    }

    return (
      <div className="space-y-3">
        <div className="grid grid-cols-3 gap-2">
          {['A', 'B', 'C'].map((label) => (
            <button key={label} type="button" onClick={onActivate} className="grid h-14 place-items-center rounded-[16px] bg-[color:var(--primary-container)] text-sm font-semibold text-[color:var(--on-primary-container)]">{label}</button>
          ))}
        </div>
        <ChipSet className="filter-chip-row">
          {['Ready', 'Hover', 'Focus'].map((chip) => <FilterChip key={chip} selected={chip === 'Ready'} onClick={onActivate}>{chip}</FilterChip>)}
        </ChipSet>
      </div>
    );
  };

  return (
    <Card variant={selected ? 'elevated' : 'outlined'} className={`min-h-[260px] p-4 ${selected ? 'ring-2 ring-[color:var(--primary)]' : ''}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-[16px] bg-[color:var(--primary-container)] text-[color:var(--on-primary-container)]">
            <Icon className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <h3 className="truncate text-base font-semibold text-foreground">{item.name}</h3>
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">{item.group}</p>
          </div>
        </div>
        <StatusTag tone={item.status === 'deprecated' ? 'danger' : 'success'}>{item.status}</StatusTag>
      </div>
      <div className="mt-4">{preview()}</div>
      <div className="mt-4 flex flex-wrap gap-2">
        <Button variant="text" onClick={onActivate}>
          <Eye className="mr-2 h-4 w-4" />
          Inspect
        </Button>
        <Button variant="outlined" onClick={onActivate}>
          <BadgeCheck className="mr-2 h-4 w-4" />
          Use
        </Button>
      </div>
    </Card>
  );
}

function GalleryPreviewCard({
  component,
  selected,
  onActivate,
}: {
  component: GalleryComponent;
  selected: boolean;
  onActivate: () => void;
}) {
  const Icon = component.icon;
  const preview = () => {
    if (component.kind === 'color') {
      return (
        <div className="grid grid-cols-4 gap-2">
          {colorRoles.slice(0, 4).map(([name, bg, fg]) => (
            <button key={name} type="button" onClick={onActivate} className="h-16 rounded-[16px] p-2 text-left text-[10px] font-semibold" style={{ background: bg, color: fg }}>{name}</button>
          ))}
        </div>
      );
    }

    if (component.kind === 'button' || component.kind === 'interaction') {
      return (
        <div className="flex flex-wrap gap-2">
          {(['filled', 'tonal', 'outlined'] as const).map((variant) => (
            <Button key={variant} variant={variant} onClick={onActivate}>{variant}</Button>
          ))}
          <Button variant="filled" disabled>disabled</Button>
        </div>
      );
    }

    if (component.kind === 'input' || component.kind === 'selection') {
      return (
        <div className="grid gap-2">
          <TextInput aria-label={`${component.title} preview`} placeholder="Input field" onChange={onActivate} />
          <ChipSet className="filter-chip-row">
            {['Selected', 'Filter', 'Switch'].map((chip, index) => <FilterChip key={chip} selected={index === 0} onClick={onActivate}>{chip}</FilterChip>)}
          </ChipSet>
        </div>
      );
    }

    if (component.kind === 'typography') {
      return (
        <button type="button" onClick={onActivate} className="w-full rounded-[20px] bg-[color:var(--surface-container)] p-4 text-left">
          <div className="text-4xl font-semibold leading-none">Aa</div>
          <div className="mt-4 text-sm text-muted-foreground">Display / title / body / label</div>
        </button>
      );
    }

    if (component.kind === 'layout' || component.kind === 'responsive') {
      return (
        <div className="grid grid-rows-[32px,1fr] overflow-hidden rounded-[20px] border border-[color:var(--outline-variant)]">
          <button type="button" onClick={onActivate} className="bg-[color:var(--surface-container-high)] px-3 text-left text-xs font-semibold">Header shell</button>
          <div className="grid grid-cols-[42px,1fr]">
            <div className="space-y-2 bg-[color:var(--surface-container)] p-2">{[0, 1, 2].map((item) => <button key={item} type="button" onClick={onActivate} className="h-7 w-full rounded-full bg-[color:var(--surface-container-highest)]" />)}</div>
            <div className="grid grid-cols-2 gap-2 p-2">{[0, 1, 2, 3].map((item) => <button key={item} type="button" onClick={onActivate} className="h-10 rounded-[12px] bg-[color:var(--surface-container)]" />)}</div>
          </div>
        </div>
      );
    }

    if (component.kind === 'media') {
      return (
        <button type="button" onClick={onActivate} className="aspect-video w-full rounded-[22px] bg-[color:var(--inverse-surface)] p-4 text-left text-[color:var(--inverse-on-surface)]">
          <Play className="h-8 w-8" />
          <div className="mt-10 h-1 rounded-full bg-current/25"><div className="h-1 w-1/2 rounded-full bg-current" /></div>
        </button>
      );
    }

    if (component.kind === 'data' || component.kind === 'performance') {
      return (
        <div className="grid grid-cols-2 gap-2">
          {['96%', '12', '4'].map((value, index) => (
            <button key={value} type="button" onClick={onActivate} className={`${index === 0 ? 'col-span-2' : ''} metric-tile text-left`}>
              <span className="text-xs text-muted-foreground">{index === 0 ? 'Coverage' : index === 1 ? 'Rows' : 'Risk'}</span>
              <strong className="mt-1 block text-xl">{value}</strong>
            </button>
          ))}
        </div>
      );
    }

    if (component.kind === 'security' || component.kind === 'accessibility') {
      return (
        <div className="rounded-[20px] bg-[color:var(--error-container)] p-3 text-[color:var(--on-error-container)]">
          <div className="flex items-center gap-2 text-xs font-semibold"><ShieldCheck className="h-3.5 w-3.5" /> Guarded action</div>
          <Button variant="outlined" className="mt-8" onClick={onActivate}>Preview confirmation</Button>
        </div>
      );
    }

    return (
      <div className="grid grid-cols-2 gap-2">
        {['Enter', 'Load', 'Select', 'Done'].map((item) => <button key={item} type="button" onClick={onActivate} className="rounded-[16px] bg-[color:var(--surface-container)] p-3 text-sm font-semibold">{item}</button>)}
      </div>
    );
  };

  return (
    <Card variant={selected ? 'elevated' : 'outlined'} className={`min-h-[260px] p-4 ${selected ? 'ring-2 ring-[color:var(--primary)]' : ''}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-[16px] bg-[color:var(--primary-container)] text-[color:var(--on-primary-container)]">
            <Icon className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <h3 className="truncate text-base font-semibold text-foreground">{component.title}</h3>
            <p className="truncate text-xs text-muted-foreground">{component.summary}</p>
          </div>
        </div>
        <StatusTag tone={statusTone(component.status)}>{statusLabel(component.status)}</StatusTag>
      </div>
      <div className="mt-4">{preview()}</div>
      <div className="mt-4 flex flex-wrap gap-2">
        {component.tokens.slice(0, 3).map((token) => (
          <button key={token} type="button" onClick={onActivate} className="rounded-full bg-[color:var(--surface-container)] px-2.5 py-1 font-mono text-[11px] text-muted-foreground">
            {token}
          </button>
        ))}
      </div>
    </Card>
  );
}

export default function ComponentShowcase() {
  const [mode, setMode] = useState<GalleryMode>('system');
  const [activeSection, setActiveSection] = useState('all');
  const [activeId, setActiveId] = useState('button-matrix');
  const [query, setQuery] = useState('');
  const [device, setDevice] = useState<DeviceMode>('desktop');
  const [previewTab, setPreviewTab] = useState<PreviewTab>('preview');
  const [density, setDensity] = useState(64);
  const [enabled, setEnabled] = useState(true);
  const [motion, setMotion] = useState(true);
  const [buttonVariant, setButtonVariant] = useState<'filled' | 'tonal' | 'outlined' | 'text' | 'elevated'>('filled');
  const [selectedRole, setSelectedRole] = useState('Primary');
  const [formState, setFormState] = useState<'ready' | 'error'>('ready');
  const [selectedTags, setSelectedTags] = useState(['Buttons']);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [fabOpen, setFabOpen] = useState(false);
  const [snackbarOpen, setSnackbarOpen] = useState(true);
  const [lastAction, setLastAction] = useState('打开组件实验台');

  const displayedGallery = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return gallery.filter((item) => {
      const inSection = activeSection === 'all' || item.sectionId === activeSection;
      const inQuery = !normalizedQuery || `${item.title} ${item.summary} ${item.props.join(' ')}`.toLowerCase().includes(normalizedQuery);
      return inSection && inQuery;
    });
  }, [activeSection, query]);

  const displayedSourceComponents = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return sourceComponentInventory.filter((item) => {
      const inSection = activeSection === 'all' || sourceSectionId(item.group) === activeSection;
      const inQuery = !normalizedQuery || `${item.name} ${item.group}`.toLowerCase().includes(normalizedQuery);
      return inSection && inQuery;
    });
  }, [activeSection, query]);

  const displayedSourceGroups = useMemo(() => Array.from(new Set(displayedSourceComponents.map((item) => item.group))), [displayedSourceComponents]);

  const activeComponent = gallery.find((item) => item.id === activeId) || gallery[0];
  const ActiveIcon = activeComponent.icon;
  const activeSectionMeta = sections.find((section) => section.id === activeComponent.sectionId) || sections[0];
  const readyCount = gallery.filter((item) => item.status === 'ready').length;
  const reviewCount = gallery.filter((item) => item.status === 'review').length;
  const componentReferenceCount = Object.keys(sourceComponentLoaders).length;
  const totalVisible = displayedGallery.length + displayedSourceComponents.length;

  const handleSelectComponent = (component: GalleryComponent) => {
    setActiveId(component.id);
    setPreviewTab('preview');
    setLastAction(`查看组件：${component.title}`);
  };

  const toggleTag = (tag: string) => {
    setSelectedTags((current) => current.includes(tag) ? current.filter((item) => item !== tag) : [...current, tag]);
    setLastAction(`切换标签：${tag}`);
  };

  const renderPreview = () => {
    if (previewTab === 'states') {
      return (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {['Default', 'Hover', 'Focus', 'Disabled'].map((state, index) => (
            <button
              key={state}
              type="button"
              disabled={state === 'Disabled'}
              onClick={() => setLastAction(`状态矩阵：${state}`)}
              className={`min-h-40 rounded-[24px] border p-4 text-left transition ${
                state === 'Focus'
                  ? 'border-[color:var(--primary)] ring-2 ring-[color:var(--primary)]'
                  : 'border-[color:var(--outline-variant)]'
              } ${state === 'Hover' ? 'bg-[color:var(--surface-container-high)]' : 'bg-[color:var(--surface-container)]'} ${state === 'Disabled' ? 'opacity-45' : ''}`}
            >
              <ActiveIcon className="h-5 w-5 text-primary" />
              <div className="mt-12 text-lg font-semibold">{state}</div>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">State layer, cursor, focus and disabled affordance.</p>
            </button>
          ))}
        </div>
      );
    }

    if (previewTab === 'spec') {
      return (
        <div className="grid gap-4 xl:grid-cols-2">
          <Card variant="outlined" className="p-4">
            <div className="text-sm font-semibold text-foreground">Props</div>
            <div className="mt-3 divide-y divide-[color:var(--outline-variant)] rounded-[20px] border border-[color:var(--outline-variant)]">
              {activeComponent.props.map((prop) => (
                <div key={prop} className="grid grid-cols-[120px,1fr] gap-3 p-3 text-sm">
                  <code className="text-primary">{prop}</code>
                  <span className="text-muted-foreground">Interactive control available in the inspector.</span>
                </div>
              ))}
            </div>
          </Card>
          <Card variant="outlined" className="p-4">
            <div className="text-sm font-semibold text-foreground">Tokens</div>
            <div className="mt-3 flex flex-wrap gap-2">
              {activeComponent.tokens.map((token) => (
                <button
                  key={token}
                  type="button"
                  onClick={() => setLastAction(`Token：${token}`)}
                  className="rounded-full border border-[color:var(--outline-variant)] bg-[color:var(--surface-container)] px-3 py-2 font-mono text-xs"
                >
                  {token}
                </button>
              ))}
            </div>
          </Card>
        </div>
      );
    }

    return (
      <DeviceFrame device={device}>
        <div className="min-h-[420px] p-4 md:p-6" style={{ fontSize: `${Math.max(13, Math.min(18, density / 4))}px` }}>
          {renderLiveSurface()}
        </div>
      </DeviceFrame>
    );
  };

  const renderLiveSurface = () => {
    switch (activeComponent.kind) {
      case 'color':
        return (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {colorRoles.map(([name, bg, fg]) => (
              <button
                key={name}
                type="button"
                onClick={() => {
                  setSelectedRole(name);
                  setLastAction(`色彩角色：${name}`);
                }}
                className={`min-h-36 rounded-[28px] p-4 text-left transition hover:-translate-y-1 ${
                  selectedRole === name ? 'ring-2 ring-[color:var(--foreground)]' : ''
                }`}
                style={{ background: bg, color: fg }}
              >
                <div className="text-sm font-semibold">{name}</div>
                <div className="mt-16 rounded-full bg-black/10 px-3 py-1 font-mono text-[11px] backdrop-blur-sm">{bg}</div>
              </button>
            ))}
          </div>
        );

      case 'typography':
        return (
          <div className="space-y-4">
            {[
              ['Display', 'text-5xl md:text-7xl', 'Build interfaces people can inspect.'],
              ['Headline', 'text-3xl md:text-5xl', 'Every state needs a real surface.'],
              ['Title', 'text-xl font-semibold', 'Component anatomy and usage rules'],
              ['Body', 'text-sm leading-7', 'Designers and engineers need the same reference, with live states, tokens and implementation hints visible together.'],
              ['Label', 'text-xs font-semibold uppercase tracking-[0.18em]', 'MUSE COMPONENT TOKEN'],
            ].map(([label, className, text]) => (
              <button
                key={label}
                type="button"
                onClick={() => setLastAction(`字体样张：${label}`)}
                className="w-full rounded-[24px] border border-[color:var(--outline-variant)] bg-[color:var(--surface-container)] p-4 text-left"
              >
                <div className="mb-3 text-xs font-semibold text-muted-foreground">{label}</div>
                <div className={className}>{text}</div>
              </button>
            ))}
          </div>
        );

      case 'layout':
      case 'responsive':
        return (
          <div className="grid min-h-[380px] grid-rows-[56px,1fr,44px] overflow-hidden rounded-[28px] border border-[color:var(--outline-variant)]">
            <header className="flex items-center justify-between bg-[color:var(--surface-container-high)] px-4">
              <div className="flex items-center gap-3 font-semibold"><PanelTop className="h-4 w-4" /> Header</div>
              <div className="flex gap-2">
                <Button variant="icon" onClick={() => setLastAction('Header search clicked')}><Search className="h-4 w-4" /></Button>
                <Button variant="icon" onClick={() => setLastAction('Header menu clicked')}><Menu className="h-4 w-4" /></Button>
              </div>
            </header>
            <div className={`${device === 'mobile' ? 'grid-cols-1' : 'grid-cols-[72px,1fr]'} grid min-h-0`}>
              {device !== 'mobile' ? (
                <aside className="space-y-2 border-r border-[color:var(--outline-variant)] bg-[color:var(--surface-container)] p-3">
                  {[PanelLeft, Component, Database, ShieldCheck].map((Icon, index) => (
                    <button key={index} type="button" onClick={() => setLastAction(`Rail item ${index + 1}`)} className="grid h-11 w-full place-items-center rounded-full bg-[color:var(--surface-container-high)]">
                      <Icon className="h-4 w-4" />
                    </button>
                  ))}
                </aside>
              ) : null}
              <main className="grid gap-3 overflow-hidden p-3" style={{ gridTemplateColumns: device === 'desktop' && density > 55 ? 'repeat(3,minmax(0,1fr))' : device === 'mobile' ? '1fr' : 'repeat(2,minmax(0,1fr))' }}>
                {Array.from({ length: device === 'mobile' ? 4 : 6 }).map((_, index) => (
                  <button key={index} type="button" onClick={() => setLastAction(`Layout tile ${index + 1}`)} className="rounded-[22px] bg-[color:var(--surface-container)] p-4 text-left">
                    <div className="h-4 w-16 rounded-full bg-[color:var(--primary-container)]" />
                    <div className="mt-10 text-sm font-semibold">Panel {index + 1}</div>
                  </button>
                ))}
              </main>
            </div>
            <footer className="flex items-center justify-between border-t border-[color:var(--outline-variant)] px-4 text-xs text-muted-foreground">
              <span>{device}</span>
              <span>density {density}%</span>
            </footer>
          </div>
        );

      case 'button':
      case 'interaction':
        return (
          <div className="grid min-h-[360px] place-items-center">
            <div className="w-full max-w-2xl rounded-[32px] border border-[color:var(--outline-variant)] bg-[color:var(--surface-container)] p-6">
              <div className="flex flex-wrap gap-2">
                {(['filled', 'tonal', 'outlined', 'text', 'elevated'] as const).map((variant) => (
                  <Button
                    key={variant}
                    variant={variant}
                    disabled={!enabled}
                    onClick={() => {
                      setButtonVariant(variant);
                      setLastAction(`按钮变体：${variant}`);
                    }}
                    className={buttonVariant === variant ? 'ring-2 ring-[color:var(--primary)]' : ''}
                  >
                    {variant}
                  </Button>
                ))}
              </div>
              <div className={`mt-8 rounded-[28px] bg-[color:var(--primary-container)] p-6 text-[color:var(--on-primary-container)] ${motion ? 'transition-transform hover:-translate-y-1' : ''}`}>
                <div className="flex items-center gap-3 text-sm font-semibold">
                  <MousePointer2 className="h-4 w-4" />
                  Live action surface
                </div>
                <p className="mt-8 max-w-md text-3xl font-semibold leading-tight">按钮不是摆设。点击、禁用、变体和反馈都要可见。</p>
                <Button variant={buttonVariant} className="mt-6" disabled={!enabled} onClick={() => setLastAction('主操作已触发')}>
                  Launch action
                </Button>
              </div>
            </div>
          </div>
        );

      case 'input':
      case 'selection':
        return (
          <div className="grid gap-4 xl:grid-cols-[1fr,320px]">
            <Card variant="outlined" className="p-5">
              <div className="grid gap-3 sm:grid-cols-2">
                <TextInput aria-label="Component name" placeholder="Component name" disabled={!enabled} onChange={() => setLastAction('输入框正在编辑')} />
                <SelectInput aria-label="Status" defaultValue={formState} disabled={!enabled} onChange={() => { setFormState(formState === 'ready' ? 'error' : 'ready'); setLastAction('选择框状态已切换'); }}>
                  <option value="ready">Ready</option>
                  <option value="error">Needs review</option>
                </SelectInput>
                <TextArea aria-label="Notes" placeholder="Usage notes" rows={4} className="sm:col-span-2" disabled={!enabled} onChange={() => setLastAction('说明文本正在编辑')} />
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                {['Buttons', 'Fields', 'Cards', 'Navigation', 'Feedback'].map((tag) => (
                  <FilterChip key={tag} selected={selectedTags.includes(tag)} onClick={() => toggleTag(tag)}>{tag}</FilterChip>
                ))}
              </div>
            </Card>
            <Card variant="filled" selected tone={formState === 'ready' ? 'success' : 'danger'} className="p-5">
              <div className="flex items-center gap-2 font-semibold">
                {formState === 'ready' ? <CheckCircle2 className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />}
                {formState === 'ready' ? 'Ready to use' : 'Needs review'}
              </div>
              <p className="mt-4 text-sm leading-6">Switch 和 chip 都会影响当前表单预览状态，右侧 inspector 同步显示属性。</p>
              <div className="mt-5 flex items-center justify-between rounded-[20px] bg-black/5 p-3">
                <span className="text-sm font-semibold">Enabled</span>
                <Switch checked={enabled} onChange={() => { setEnabled((value) => !value); setLastAction(enabled ? '表单控件已禁用' : '表单控件已启用'); }} />
              </div>
            </Card>
          </div>
        );

      case 'surface':
        return (
          <div className="grid gap-4 md:grid-cols-3">
            {(['elevated', 'filled', 'outlined'] as const).map((variant) => (
              <Card key={variant} variant={variant} className="p-5">
                <div className="flex items-center gap-2 text-sm font-semibold"><Box className="h-4 w-4" /> {variant}</div>
                <h3 className="mt-16 text-2xl font-semibold leading-tight">Surface anatomy</h3>
                <p className="mt-3 text-sm leading-6 text-muted-foreground">卡片需要清楚的层级、点击目标和内容节奏。</p>
                <Button variant="text" className="mt-5" onClick={() => setLastAction(`Card action：${variant}`)}>Open</Button>
              </Card>
            ))}
          </div>
        );

      case 'media':
        return (
          <div className="grid gap-4 xl:grid-cols-[1.2fr,0.8fr]">
            <button type="button" onClick={() => setLastAction('视频预览播放')} className="aspect-video rounded-[30px] bg-[color:var(--inverse-surface)] p-6 text-left text-[color:var(--inverse-on-surface)]">
              <Play className="h-12 w-12" />
              <div className="mt-24 max-w-lg text-3xl font-semibold leading-tight">Video, poster, progress and caption live together.</div>
              <div className="mt-6 h-1 rounded-full bg-current/25"><div className="h-1 w-2/5 rounded-full bg-current" /></div>
            </button>
            <div className="grid gap-3">
              <div className="rounded-[24px] bg-[linear-gradient(135deg,var(--primary-container),var(--tertiary-container))] p-5">
                <Image className="h-6 w-6" />
                <div className="mt-20 text-sm font-semibold">Image frame</div>
              </div>
              <button type="button" onClick={() => setLastAction('音频波形已点击')} className="rounded-[24px] border border-[color:var(--outline-variant)] p-4">
                <div className="flex items-center gap-3">
                  <Play className="h-5 w-5" />
                  <div className="flex flex-1 items-end gap-1">
                    {[18, 28, 14, 34, 22, 30, 16, 26, 20].map((height, index) => <span key={index} className="w-full rounded-full bg-[color:var(--primary)]" style={{ height }} />)}
                  </div>
                </div>
              </button>
            </div>
          </div>
        );

      case 'data':
        return (
          <div className="grid gap-4 xl:grid-cols-[0.8fr,1.2fr]">
            <div className="grid gap-3">
              {[
                ['Coverage', '96%', 'success'],
                ['Review', '4', 'warning'],
                ['Blocked', '1', 'danger'],
              ].map(([label, value, tone]) => (
                <button key={label} type="button" onClick={() => setLastAction(`指标：${label}`)} className="metric-tile text-left">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">{label}</span>
                    <StatusTag tone={tone as 'success' | 'warning' | 'danger'}>{tone}</StatusTag>
                  </div>
                  <div className="mt-3 text-3xl font-semibold">{value}</div>
                  <InlineProgress value={label === 'Coverage' ? 96 : label === 'Review' ? 52 : 18} className="mt-4" />
                </button>
              ))}
            </div>
            <Card variant="outlined" className="overflow-hidden">
              {['Component', 'Owner', 'Status'].map((head) => <span key={head} className="inline-block w-1/3 border-b border-[color:var(--outline-variant)] p-3 text-xs font-semibold text-muted-foreground">{head}</span>)}
              {gallery.slice(0, 5).map((item) => (
                <button key={item.id} type="button" onClick={() => handleSelectComponent(item)} className="grid w-full grid-cols-3 border-b border-[color:var(--outline-variant)] text-left text-sm last:border-b-0">
                  <span className="p-3 font-semibold">{item.title}</span>
                  <span className="p-3 text-muted-foreground">{sections.find((section) => section.id === item.sectionId)?.title}</span>
                  <span className="p-3"><StatusTag tone={statusTone(item.status)}>{statusLabel(item.status)}</StatusTag></span>
                </button>
              ))}
            </Card>
          </div>
        );

      case 'motion':
        return (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {['Enter', 'Loading', 'Select', 'Resolve'].map((label, index) => (
              <button key={label} type="button" onClick={() => { setMotion((value) => !value); setLastAction(`动画：${label}`); }} className={`rounded-[28px] border border-[color:var(--outline-variant)] bg-[color:var(--surface-container)] p-5 text-left ${motion ? 'animate-pulse' : ''}`} style={{ animationDelay: `${index * 80}ms` }}>
                <Activity className="h-5 w-5 text-primary" />
                <div className="mt-16 text-xl font-semibold">{label}</div>
                <InlineProgress value={index * 18 + 32} className="mt-4" />
              </button>
            ))}
          </div>
        );

      case 'accessibility':
        return (
          <div className="grid gap-4 xl:grid-cols-2">
            <Card variant="outlined" className="p-5">
              <button type="button" aria-label="Open component search" className="flex w-full items-center justify-between rounded-[20px] border border-[color:var(--outline-variant)] p-4">
                <span className="flex items-center gap-2"><Search className="h-4 w-4" /> aria-label button</span>
                <ArrowUpRight className="h-4 w-4" />
              </button>
              <div role="status" className="mt-4 rounded-[20px] bg-[color:var(--success-container)] p-4 text-[color:var(--on-success-container)]">role=status: component saved</div>
            </Card>
            <Card variant="outlined" className="p-5">
              <div className="font-mono text-xs leading-7">
                <div>{'<main aria-labelledby="component-gallery">'}</div>
                <div>{'<button aria-label="Open component search">'}</div>
                <div>{'<div role="status">Saved</div>'}</div>
              </div>
            </Card>
          </div>
        );

      case 'performance':
        return (
          <div className="grid gap-4 md:grid-cols-2">
            {[
              ['Lazy route', 'Component showcase stays outside critical app routes.', 78],
              ['Stable media', 'Aspect-ratio frames avoid layout shift.', 70],
              ['Skeleton', 'Route fallback keeps navigation responsive.', 84],
              ['Preload', 'Important routes can warm during idle time.', 62],
            ].map(([label, text, value]) => (
              <button key={label} type="button" onClick={() => setLastAction(`性能：${label}`)} className="metric-tile text-left">
                <Gauge className="h-4 w-4 text-muted-foreground" />
                <div className="mt-4 text-xl font-semibold">{label}</div>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">{text}</p>
                <InlineProgress value={Number(value)} className="mt-5" />
              </button>
            ))}
          </div>
        );

      case 'security':
        return (
          <div className="grid gap-4 xl:grid-cols-2">
            <Card variant="outlined" className="p-5">
              <div className="flex items-center gap-2 font-semibold"><ShieldCheck className="h-4 w-4" /> Safe text rendering</div>
              <code className="mt-5 block rounded-[20px] bg-[color:var(--surface-container-highest)] p-4 text-sm">{'<script>alert("xss")</script>'}</code>
              <p className="mt-4 text-sm leading-6 text-muted-foreground">作为文本渲染，不作为 HTML 注入。</p>
            </Card>
            <Card variant="filled" selected tone="danger" className="p-5">
              <div className="flex items-center gap-2 font-semibold"><LockKeyhole className="h-4 w-4" /> Sensitive action</div>
              <p className="mt-4 text-sm leading-6">删除、分享、发送、改权限之前必须展示目标、数据和后果。</p>
              <Button variant="outlined" className="mt-6" onClick={() => setLastAction('安全确认预览已触发')}>Preview confirmation</Button>
            </Card>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <ControlPage className="component-showcase-page">
      <section className="rounded-[36px] border border-[color:var(--outline-variant)] bg-[color:var(--surface-container-lowest)] p-4 md:p-6">
        <div className="grid gap-5 xl:grid-cols-[1fr,420px]">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full bg-[color:var(--surface-container)] px-3 py-2 text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
              <Blocks className="h-4 w-4" />
              Muse Component Lab
            </div>
            <h1 className="mt-6 max-w-5xl text-4xl font-semibold leading-[0.98] text-foreground md:text-6xl">
              组件展厅改成可操作的设计系统实验台。
            </h1>
            <p className="mt-5 max-w-3xl text-sm leading-7 text-muted-foreground md:text-base">
              左边找组件，中间直接操作真实预览，右边调 props、看 token、拿代码。组织方式参考成熟组件文档和 Storybook controls，但内容是 Muse 自有实现。
            </p>
            <div className="mt-6 flex flex-wrap gap-2">
              <SegmentedControl
                value={mode}
                onChange={(value) => {
                  setMode(value as GalleryMode);
                  setLastAction(`切换视图：${value}`);
                }}
                items={[
                  { key: 'system', label: 'System docs' },
                  { key: 'editorial', label: 'Editorial board' },
                ]}
              />
              <Button variant="outlined" onClick={() => { setActiveSection('all'); setQuery(''); setLastAction('重置目录筛选'); }}>
                <SquareStack className="mr-2 h-4 w-4" />
                Reset
              </Button>
            </div>
          </div>

          <div className="grid gap-3 rounded-[28px] bg-[color:var(--surface-container)] p-4">
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold text-foreground">Library health</span>
              <StatusTag tone="primary">{lastAction}</StatusTag>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div className="rounded-[20px] bg-[color:var(--surface-container-high)] p-3">
                <div className="text-xs text-muted-foreground">Components</div>
                <div className="mt-2 text-2xl font-semibold">{gallery.length}</div>
              </div>
              <div className="rounded-[20px] bg-[color:var(--success-container)] p-3 text-[color:var(--on-success-container)]">
                <div className="text-xs opacity-75">Ready</div>
                <div className="mt-2 text-2xl font-semibold">{readyCount}</div>
              </div>
              <div className="rounded-[20px] bg-[color:var(--accent-container)] p-3 text-[color:var(--on-accent-container)]">
                <div className="text-xs opacity-75">Review</div>
                <div className="mt-2 text-2xl font-semibold">{reviewCount}</div>
              </div>
            </div>
            <InlineProgress value={(readyCount / gallery.length) * 100} />
            <div className="rounded-[20px] border border-[color:var(--outline-variant)] bg-[color:var(--surface-container-lowest)] p-3 text-xs text-muted-foreground">
              已引用源码组件模块：<span className="font-semibold text-foreground">{componentReferenceCount}</span> / {sourceComponentInventory.length}
            </div>
          </div>
        </div>
      </section>

      <section className="ux-lab-console">
        <div className="ux-lab-lead">
          <div className="ux-lab-kicker">
            <Sparkles className="h-4 w-4" />
            Expressive UI / UX Console
          </div>
          <h2>把按钮、表单、卡片、FAB、Sheet、Snackbar、进度和状态层放在同一个可操作界面里。</h2>
          <p>这里不是单独 demo 页，而是组件展厅的主控制面：左侧选择组件，下面直接看到组合后的产品 UI 行为。</p>
          <div className="ux-lab-actions">
            <Button variant="filled" onClick={() => { setSheetOpen(true); setLastAction('打开 Bottom Sheet'); }}>
              <PanelTop className="mr-2 h-4 w-4" />
              Open Sheet
            </Button>
            <Button variant="tonal" onClick={() => { setSnackbarOpen(true); setLastAction('显示浮动通知'); }}>
              <AlertTriangle className="mr-2 h-4 w-4" />
              Snackbar
            </Button>
            <Button variant="outlined" onClick={() => { setFabOpen((value) => !value); setLastAction('切换 FAB 菜单'); }}>
              <Play className="mr-2 h-4 w-4" />
              FAB Menu
            </Button>
          </div>
        </div>

        <div className="ux-lab-board">
          <div className="ux-lab-topbar">
            <label className="ux-lab-search">
              <Search className="h-4 w-4" />
              <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search components / states / tokens" />
            </label>
            <SegmentedControl
              value={previewTab}
              onChange={(value) => setPreviewTab(value as PreviewTab)}
              items={[
                { key: 'preview', label: 'Preview' },
                { key: 'states', label: 'States' },
                { key: 'spec', label: 'Spec' },
              ]}
            />
          </div>

          <div className="ux-lab-grid">
            <Card variant="filled" className="ux-lab-card p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">Dynamic form</div>
                  <h3 className="mt-2 text-xl font-semibold">Stateful request</h3>
                </div>
                <Switch checked={enabled} onChange={() => { setEnabled((value) => !value); setLastAction(enabled ? '禁用表单组件' : '启用表单组件'); }} />
              </div>
              <div className="mt-4 grid gap-3">
                <TextInput disabled={!enabled} aria-label="Request title" placeholder="Request title" onChange={() => setLastAction('表单标题正在编辑')} />
                <SelectInput disabled={!enabled} aria-label="Priority" defaultValue="normal" onChange={() => setLastAction('优先级已切换')}>
                  <option value="normal">Normal</option>
                  <option value="high">High risk</option>
                  <option value="review">Needs review</option>
                </SelectInput>
                <TextArea disabled={!enabled} aria-label="Notes" placeholder="Notes, failure mode, owner" rows={3} onChange={() => setLastAction('备注正在编辑')} />
              </div>
            </Card>

            <Card variant="outlined" className="ux-lab-card p-4">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">Controls</div>
                  <h3 className="mt-2 text-xl font-semibold">Density and motion</h3>
                </div>
                <StatusTag tone={motion ? 'success' : 'neutral'}>{motion ? 'Motion on' : 'Reduced'}</StatusTag>
              </div>
              <div className="mt-5">
                <div className="mb-2 flex items-center justify-between text-sm">
                  <span>Density</span>
                  <strong>{density}%</strong>
                </div>
                <Slider value={density} min={32} max={96} onChange={(value) => { setDensity(value); setLastAction(`密度：${value}%`); }} />
              </div>
              <ChipSet className="filter-chip-row mt-5">
                {['Buttons', 'Forms', 'Cards', 'Motion'].map((tag) => (
                  <FilterChip key={tag} selected={selectedTags.includes(tag)} onClick={() => toggleTag(tag)}>{tag}</FilterChip>
                ))}
              </ChipSet>
            </Card>

            <Card variant="elevated" className="ux-lab-card ux-lab-preview-card p-4">
              <div className="ux-lab-device-head">
                <span>Live app surface</span>
                <StatusTag tone={formState === 'ready' ? 'success' : 'danger'}>{formState}</StatusTag>
              </div>
              <div className="ux-lab-mini-list">
                {['Command row', 'Expandable card', 'Status timeline'].map((item, index) => (
                  <button key={item} type="button" onClick={() => { setFormState(index === 1 ? 'error' : 'ready'); setLastAction(`预览组件：${item}`); }}>
                    <span className="grid h-9 w-9 place-items-center rounded-[14px] bg-[color:var(--primary-container)] text-[color:var(--on-primary-container)]">
                      {index === 0 ? <MousePointer2 className="h-4 w-4" /> : index === 1 ? <SquareStack className="h-4 w-4" /> : <Activity className="h-4 w-4" />}
                    </span>
                    <span className="min-w-0 flex-1">
                      <strong>{item}</strong>
                      <small>{index === 1 ? 'Click toggles error state' : 'State layer + motion feedback'}</small>
                    </span>
                    <ChevronRight className="h-4 w-4" />
                  </button>
                ))}
              </div>
              <InlineProgress value={density} className="mt-4" />
            </Card>
          </div>

          {sheetOpen ? (
            <div className="ux-lab-sheet" role="dialog" aria-label="Component sheet">
              <div className="ux-lab-sheet-handle" />
              <h3>Component action sheet</h3>
              <p>用于预览 bottom sheet、dialog、drawer 类容器的进入、退出和状态反馈。</p>
              <div className="flex flex-wrap justify-end gap-2">
                <Button variant="text" onClick={() => setSheetOpen(false)}>Close</Button>
                <Button variant="filled" onClick={() => { setSheetOpen(false); setSnackbarOpen(true); setLastAction('Sheet 动作已确认'); }}>Confirm</Button>
              </div>
            </div>
          ) : null}

          <div className="ux-lab-fab-stack" data-open={fabOpen}>
            {fabOpen ? (
              <>
                <button type="button" onClick={() => setLastAction('FAB: 新建表单')}><ListChecks className="h-4 w-4" /></button>
                <button type="button" onClick={() => setLastAction('FAB: 运行检查')}><ShieldCheck className="h-4 w-4" /></button>
              </>
            ) : null}
            <button type="button" className="ux-lab-fab-root" onClick={() => setFabOpen((value) => !value)}>
              <Sparkles className="h-5 w-5" />
            </button>
          </div>

          {snackbarOpen ? (
            <div className="ux-lab-snackbar" role="status">
              <span>{lastAction}</span>
              <button type="button" onClick={() => setSnackbarOpen(false)}>Dismiss</button>
            </div>
          ) : null}
        </div>
      </section>

      <div className="flex flex-wrap gap-2">
        <SectionPill
          section={{ id: 'all', title: 'All', icon: Component, description: '' }}
          active={activeSection === 'all'}
          count={gallery.length + sourceComponentInventory.length}
          onClick={() => { setActiveSection('all'); setLastAction('查看全部组件'); }}
        />
        {sections.map((section) => (
          <SectionPill
            key={section.id}
            section={section}
            active={activeSection === section.id}
            count={gallery.filter((item) => item.sectionId === section.id).length + sourceComponentInventory.filter((item) => sourceSectionId(item.group) === section.id).length}
            onClick={() => {
              setActiveSection(section.id);
              setLastAction(`筛选分组：${section.title}`);
            }}
          />
        ))}
      </div>

      <section className="space-y-5 rounded-[36px] border border-[color:var(--outline-variant)] bg-[color:var(--surface-container-lowest)] p-4 md:p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
              <Blocks className="h-4 w-4" />
              Component wall
            </div>
            <p className="mt-1 max-w-3xl text-sm leading-6 text-muted-foreground">
              当前筛选直接显示 {totalVisible} 个可交互组件面板。真实源码组件已经分散到对应分类，不再作为底部名字清单。
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <StatusTag tone={componentReferenceCount === sourceComponentInventory.length ? 'success' : 'danger'}>
              {componentReferenceCount}/{sourceComponentInventory.length} source modules
            </StatusTag>
            <SegmentedControl
              value={device}
              onChange={(value) => {
                setDevice(value as DeviceMode);
                setLastAction(`设备预览：${value}`);
              }}
              items={[
                { key: 'desktop', label: <LayoutDashboard className="h-4 w-4" /> },
                { key: 'tablet', label: <Tablet className="h-4 w-4" /> },
                { key: 'mobile', label: <Smartphone className="h-4 w-4" /> },
              ]}
            />
          </div>
        </div>

        <div className="grid gap-3 xl:grid-cols-[1fr,360px]">
          <label className="flex items-center gap-2 rounded-full border border-[color:var(--outline-variant)] bg-[color:var(--surface-container)] px-4 py-3">
            <Search className="h-4 w-4 text-muted-foreground" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search visible components, states, groups"
              className="min-w-0 flex-1 bg-transparent text-sm outline-none"
            />
          </label>
          <div className="grid grid-cols-3 gap-2">
            <div className="rounded-[20px] bg-[color:var(--surface-container)] p-3">
              <div className="text-xs text-muted-foreground">Visible</div>
              <div className="mt-1 text-2xl font-semibold">{totalVisible}</div>
            </div>
            <div className="rounded-[20px] bg-[color:var(--surface-container)] p-3">
              <div className="text-xs text-muted-foreground">Density</div>
              <div className="mt-1 text-2xl font-semibold">{density}%</div>
            </div>
            <div className="rounded-[20px] bg-[color:var(--surface-container)] p-3">
              <div className="text-xs text-muted-foreground">Action</div>
              <div className="mt-1 truncate text-sm font-semibold">{lastAction}</div>
            </div>
          </div>
        </div>

        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr),320px]">
          <div className="space-y-8">
            {displayedGallery.length > 0 ? (
              <section className="space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <h2 className="text-xl font-semibold text-foreground">Design primitives</h2>
                  <StatusTag tone="primary">{displayedGallery.length}</StatusTag>
                </div>
                <div className="grid gap-3 md:grid-cols-2 2xl:grid-cols-3">
                  {displayedGallery.map((component) => (
                    <GalleryPreviewCard
                      key={component.id}
                      component={component}
                      selected={component.id === activeComponent.id}
                      onActivate={() => handleSelectComponent(component)}
                    />
                  ))}
                </div>
              </section>
            ) : null}

            {displayedSourceGroups.map((group) => {
              const groupItems = displayedSourceComponents.filter((item) => item.group === group);
              const Icon = sourceIcon(group);
              return (
                <section key={group} className="space-y-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <span className="grid h-9 w-9 place-items-center rounded-[14px] bg-[color:var(--primary-container)] text-[color:var(--on-primary-container)]">
                        <Icon className="h-4 w-4" />
                      </span>
                      <div>
                        <h2 className="text-xl font-semibold text-foreground">{group}</h2>
                        <p className="text-sm text-muted-foreground">真实源码组件 UI 预览</p>
                      </div>
                    </div>
                    <StatusTag tone="neutral">{groupItems.length}</StatusTag>
                  </div>
                  <div className="grid gap-3 md:grid-cols-2 2xl:grid-cols-3">
                    {groupItems.map((item) => (
                      <SourceComponentPreview
                        key={item.name}
                        item={item}
                        selected={lastAction.includes(item.name)}
                        onActivate={() => setLastAction(`组件交互：${item.name}`)}
                      />
                    ))}
                  </div>
                </section>
              );
            })}

            {totalVisible === 0 ? (
              <div className="rounded-[28px] border border-dashed border-[color:var(--outline-variant)] p-8 text-center text-sm text-muted-foreground">
                没有匹配组件。清空搜索或切回 All。
              </div>
            ) : null}
          </div>

          <aside className="space-y-4 xl:sticky xl:top-4 xl:self-start">
            <Card variant="outlined" className="p-4">
              <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                <SlidersHorizontal className="h-4 w-4" />
                Global controls
              </div>
              <div className="mt-4 space-y-4">
                <div className="flex items-center justify-between rounded-[22px] border border-[color:var(--outline-variant)] p-3">
                  <span className="text-sm font-semibold">Enabled</span>
                  <Switch checked={enabled} onChange={() => { setEnabled((value) => !value); setLastAction(enabled ? '控件已禁用' : '控件已启用'); }} />
                </div>
                <div className="flex items-center justify-between rounded-[22px] border border-[color:var(--outline-variant)] p-3">
                  <span className="text-sm font-semibold">Motion</span>
                  <Switch checked={motion} onChange={() => { setMotion((value) => !value); setLastAction(motion ? '动画已关闭' : '动画已开启'); }} />
                </div>
                <div>
                  <div className="mb-2 flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Density</span>
                    <span className="font-semibold text-foreground">{density}%</span>
                  </div>
                  <Slider value={density} min={32} max={96} onChange={(value) => { setDensity(value); setLastAction(`密度：${value}%`); }} />
                </div>
                <div>
                  <div className="mb-2 text-sm text-muted-foreground">Button variant</div>
                  <SelectInput aria-label="Button variant" value={buttonVariant} onChange={(event) => { setButtonVariant((event.target as HTMLSelectElement).value as typeof buttonVariant); setLastAction('按钮样式已切换'); }}>
                    <option value="filled">filled</option>
                    <option value="tonal">tonal</option>
                    <option value="outlined">outlined</option>
                    <option value="text">text</option>
                    <option value="elevated">elevated</option>
                  </SelectInput>
                </div>
              </div>
            </Card>

            <Card variant="outlined" className="p-4">
              <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                <ActiveIcon className="h-4 w-4" />
                Active surface
              </div>
              <div className="mt-3">
                <StatusTag tone={statusTone(activeComponent.status)}>{activeComponent.title}</StatusTag>
                <p className="mt-3 text-sm leading-6 text-muted-foreground">{activeComponent.summary}</p>
              </div>
              <div className="mt-4">
                <SegmentedControl
                  value={previewTab}
                  onChange={(value) => setPreviewTab(value as PreviewTab)}
                  items={[
                    { key: 'preview', label: 'Preview' },
                    { key: 'states', label: 'States' },
                    { key: 'spec', label: 'Spec' },
                  ]}
                />
              </div>
              <div className="mt-4 max-h-[420px] overflow-auto rounded-[24px] border border-[color:var(--outline-variant)] p-3">
                {renderPreview()}
              </div>
            </Card>

            {mode === 'editorial' ? (
              <Card variant="filled" className="p-5">
                <BookOpenText className="h-6 w-6 text-primary" />
                <h3 className="mt-10 text-2xl font-semibold leading-tight">Every component has a job, a state model and a failure mode.</h3>
              </Card>
            ) : null}
          </aside>
        </div>
      </section>
    </ControlPage>
  );
}
