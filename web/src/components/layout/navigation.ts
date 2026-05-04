import {
  Bot,
  Cloud,
  Github,
  Globe,
  Inbox,
  LayoutDashboard,
  Newspaper,
  NotebookPen,
  Shield,
  Wallet,
  BookOpenText,
  Users,
  TerminalSquare,
  Blocks,
  Shapes,
  type LucideIcon,
} from 'lucide-react';

export interface NavItem {
  to: string;
  icon: LucideIcon;
  label: string;
  shortLabel?: string;
  eyebrow: string;
  description: string;
}

export interface NavSection {
  id: string;
  label: string;
  items: NavItem[];
}

export const navSections: NavSection[] = [
  {
    id: 'command',
    label: '',
    items: [
      {
        to: '/today',
        icon: LayoutDashboard,
        label: 'Today',
        shortLabel: 'Today',
        eyebrow: 'Daily Focus',
        description: '今天最该推进的动作、异常与信号汇聚面板。',
      },
      {
        to: '/memory',
        icon: BookOpenText,
        label: 'Memory & Rules',
        shortLabel: 'Memory',
        eyebrow: 'Memory + Automation',
        description: '沉淀长期上下文，并管理自动化规则。',
      },
      {
        to: '/ai',
        icon: Bot,
        label: 'AI',
        eyebrow: 'Model Console',
        description: '原生模型对话、账号池与后台能力的统一入口。',
      },
    ],
  },
  {
    id: 'runtime',
    label: '',
    items: [
      {
        to: '/accounts',
        icon: Users,
        label: '邮箱管理',
        shortLabel: 'Mail',
        eyebrow: 'Accounts',
        description: '邮箱账号、拉取链路和最近邮件视图。',
      },
      {
        to: '/inbox',
        icon: Inbox,
        label: '统一收件箱',
        shortLabel: 'Inbox',
        eyebrow: 'Action Queue',
        description: '把跨模块待处理动作压缩到同一个处理队列里。',
      },
      {
        to: '/ymail',
        icon: Inbox,
        label: 'Ymail 临时邮箱',
        shortLabel: 'Ymail',
        eyebrow: 'Temp Mail',
        description: '临时邮箱生成、查看与关联处理。',
      },
      {
        to: '/dashboard',
        icon: LayoutDashboard,
        label: '统计仪表盘',
        shortLabel: 'Dashboard',
        eyebrow: 'System Overview',
        description: '运行状态、分布情况和关键变化的一览窗口。',
      },
      {
        to: '/codex',
        icon: TerminalSquare,
        label: 'Codex',
        eyebrow: 'CRS Relay',
        description: '管理 Codex CRS 转发、账号来源和自动切换策略。',
      },
      {
        to: '/openteams',
        icon: Blocks,
        label: 'OpenTeams',
        shortLabel: 'Teams',
        eyebrow: 'Integrated Source',
        description: '完整 OpenTeams 源码模块：团队协作、成员、预设、技能、CLI、后端和桌面壳。',
      },
      {
        to: '/components',
        icon: Shapes,
        label: '组件展示台',
        shortLabel: 'Components',
        eyebrow: 'Design System',
        description: '集中展示可用、待校验与不可用的 UI 元素、字体、色块和页面组件。',
      },
      {
        to: '/proxy',
        icon: Globe,
        label: '代理设置',
        shortLabel: 'Proxy',
        eyebrow: 'Connectivity',
        description: '管理代理链路、连通性和恢复路径。',
      },
      {
        to: '/subscriptions',
        icon: Wallet,
        label: '订阅管理',
        shortLabel: 'Subs',
        eyebrow: 'Billing',
        description: '集中订阅、账期与提醒规则。',
      },
    ],
  },
  {
    id: 'integrations',
    label: '',
    items: [
      {
        to: '/newspaper',
        icon: Newspaper,
        label: '报纸',
        eyebrow: 'Signal Reader',
        description: '新闻聚合、导读、报纸阅读器与 AI 洞察。',
      },
      {
        to: '/cloudflare',
        icon: Cloud,
        label: 'Cloudflare',
        eyebrow: 'Infra',
        description: '域名、DNS、Pages 与边缘资产。',
      },
      {
        to: '/github',
        icon: Github,
        label: 'GitHub',
        eyebrow: 'Repo Ops',
        description: '仓库、PR、发布与协作资产。',
      },
      {
        to: '/linuxdo',
        icon: Shield,
        label: 'Linux.do',
        eyebrow: 'Community',
        description: '社区授权、身份状态与最近同步。',
      },
      {
        to: '/notion',
        icon: NotebookPen,
        label: 'Notion',
        eyebrow: 'Knowledge Base',
        description: '知识库检索、页面处理与导读执行。',
      },
    ],
  },
];

export const navItems = navSections.flatMap((section) => section.items);

export function getRouteMeta(pathname: string) {
  if (pathname.startsWith('/newspaper/read')) {
    return {
      label: '报纸阅读器',
      eyebrow: 'Reader Mode',
      description: '双语阅读、导读和上下文操作的沉浸式视图。',
    };
  }

  if (pathname === '/rules') {
    return {
      label: 'Memory',
      eyebrow: 'Memory + Automation',
      description: '沉淀长期上下文，并管理自动化规则。',
    };
  }

  const matched = navItems.find((item) => item.to === pathname);
  if (matched) {
    return {
      label: matched.shortLabel || matched.label,
      eyebrow: matched.eyebrow,
      description: matched.description,
    };
  }

  return {
    label: 'AI',
    eyebrow: 'Personal Operating System',
    description: '统一信息、异常、实体和下一步的个人操作系统。',
  };
}
