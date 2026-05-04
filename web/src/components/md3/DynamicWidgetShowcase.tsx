import { useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Bell,
  Bot,
  Check,
  ChevronDown,
  Command,
  GripVertical,
  Inbox,
  Layers3,
  MailCheck,
  MessageSquareText,
  Play,
  Plus,
  Search,
  Settings2,
  Sparkles,
  TimerReset,
  X,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Button, ChipSet, FilterChip, Slider, Switch, TextInput } from '../ui/primitives';
import { MaterialFab } from '../ui/MaterialFab';

const filters = ['全部', '风险', '邮件', '运行时', 'AI', '规则'];
const navItems = [
  { label: 'Today', icon: Command },
  { label: 'Inbox', icon: Inbox },
  { label: 'AI', icon: Bot },
  { label: 'Rules', icon: Layers3 },
];

const aiDrawerItems: Array<{ label: string; text: string; icon: LucideIcon }> = [
  { label: '上下文', text: 'Today 页面检测到 3 个可立即处理动作。', icon: MessageSquareText },
  { label: '计划', text: '先处理授权异常，再同步代理，最后归档低风险邮件。', icon: TimerReset },
  { label: '工具结果', text: 'Inbox、Proxy、Rules 均已返回最新状态。', icon: MailCheck },
];

export function DynamicWidgetShowcase() {
  const [activeFilter, setActiveFilter] = useState('全部');
  const [sliderValue, setSliderValue] = useState(64);
  const [automationOn, setAutomationOn] = useState(true);
  const [expanded, setExpanded] = useState('mail');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [toastOpen, setToastOpen] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(true);
  const [activeNav, setActiveNav] = useState('Today');
  const [syncing, setSyncing] = useState(false);

  const queue = useMemo(() => [
    {
      id: 'mail',
      title: '处理 3 封需要回复的邮件',
      meta: 'Inbox · 预计 8 分钟 · 高优先级',
      detail: '包含 1 个客户回复、1 个授权异常、1 个订阅续费提醒，可交给 AI 先生成摘要。',
    },
    {
      id: 'proxy',
      title: '修复代理连通性波动',
      meta: 'Runtime · 预计 4 分钟 · 阻塞同步',
      detail: '最近 10 分钟出现 2 次失败，建议先测试节点，再重试 GitHub 与 Cloudflare 同步。',
    },
    {
      id: 'rule',
      title: '确认新规则的自动归档范围',
      meta: 'Rules · 预计 2 分钟 · 需确认',
      detail: '规则命中 19 封邮件，其中 2 封包含付款关键词，建议人工确认后再批量执行。',
    },
  ], []);

  const runSync = () => {
    setSyncing(true);
    window.setTimeout(() => {
      setSyncing(false);
      setToastOpen(true);
      window.setTimeout(() => setToastOpen(false), 3200);
    }, 900);
  };

  return (
    <section className="page-enter grid gap-4 xl:grid-cols-[minmax(0,1.45fr),minmax(320px,0.75fr)]">
      <div className="space-y-4">
        <div className="md3-prominent rounded-[28px] p-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full bg-white/18 px-3 py-1 text-xs font-medium">
                <Sparkles className="h-3.5 w-3.5" />
                Google Design / Material 3 Component Deck
              </div>
              <h2 className="mt-4 text-2xl font-semibold tracking-tight">Muse 动态小组件交互层</h2>
              <p className="mt-2 max-w-2xl text-sm leading-6 opacity-85">
                统一展示动态按钮、卡片、筛选、滑杆、表单、对话框、抽屉、通知、FAB 和底部导航的状态反馈。
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="filled" onClick={runSync} disabled={syncing}>
                <Play className={`mr-2 h-4 w-4 ${syncing ? 'animate-spin' : ''}`} />
                {syncing ? '同步中' : '运行同步'}
              </Button>
              <Button variant="tonal" onClick={() => setDialogOpen(true)}>
                <Settings2 className="mr-2 h-4 w-4" />
                打开动作
              </Button>
            </div>
          </div>
        </div>

        <div className="md3-surface rounded-[28px] p-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex min-w-0 flex-1 items-center gap-3 rounded-full bg-[color:var(--surface-container-high)] px-4 py-2">
              <Search className="h-4 w-4 text-muted-foreground" />
              <input
                className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
                placeholder="搜索邮件、实体、规则或运行日志"
              />
              <kbd className="rounded-md bg-[color:var(--surface-container-highest)] px-2 py-1 text-[11px] text-muted-foreground">Ctrl K</kbd>
            </div>
            <ChipSet className="flex gap-2 overflow-x-auto">
              {filters.map((filter) => (
                <FilterChip
                  key={filter}
                  onClick={() => setActiveFilter(filter)}
                  className="whitespace-nowrap"
                  selected={activeFilter === filter}
                >
                  {filter}
                </FilterChip>
              ))}
            </ChipSet>
          </div>
        </div>

        <div className="grid gap-4 lg:grid-cols-[1fr,0.85fr]">
          <div className="md3-surface rounded-[28px] p-4">
            <div className="mb-3 flex items-center justify-between">
              <div>
                <h3 className="font-semibold text-foreground">可展开任务队列</h3>
                <p className="text-sm text-muted-foreground">状态层、拖拽手柄、展开动画和撤销反馈。</p>
              </div>
              <Button variant="text" onClick={() => setToastOpen(true)}>
                <Bell className="mr-2 h-4 w-4" />
                Toast
              </Button>
            </div>
            <div className="space-y-3">
              {queue.map((item) => (
                <motion.article layout key={item.id} className="md3-card overflow-hidden">
                  <button
                    className="md3-state-layer flex w-full items-center gap-3 p-4 text-left"
                    onClick={() => setExpanded(expanded === item.id ? '' : item.id)}
                  >
                    <GripVertical className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-semibold text-foreground">{item.title}</div>
                      <div className="mt-1 text-xs text-muted-foreground">{item.meta}</div>
                    </div>
                    <ChevronDown className={`h-4 w-4 transition-transform ${expanded === item.id ? 'rotate-180' : ''}`} />
                  </button>
                  <AnimatePresence initial={false}>
                    {expanded === item.id && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.24, ease: [0.2, 0, 0, 1] }}
                        className="overflow-hidden border-t border-[color:var(--outline-variant)]"
                      >
                        <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
                          <p className="text-sm leading-6 text-muted-foreground">{item.detail}</p>
                          <div className="flex shrink-0 gap-2">
                            <Button variant="outlined">延期</Button>
                            <Button variant="filled" onClick={() => setToastOpen(true)}>
                              完成
                            </Button>
                          </div>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </motion.article>
              ))}
            </div>
          </div>

          <div className="space-y-4">
            <div className="md3-surface-high rounded-[28px] p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h3 className="font-semibold text-foreground">动态表单组件</h3>
                  <p className="text-sm text-muted-foreground">输入、开关、滑杆联动更新执行强度。</p>
                </div>
                <Switch checked={automationOn} onChange={() => setAutomationOn(!automationOn)} />
              </div>
              <div className="mt-4 space-y-4">
                <TextInput aria-label="任务名称" placeholder="任务名称" className="w-full" />
                <div>
                  <div className="mb-2 flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">AI 自动化强度</span>
                    <span className="font-semibold text-foreground">{sliderValue}%</span>
                  </div>
                  <Slider value={sliderValue} min={0} max={100} onChange={setSliderValue} />
                </div>
                <div className="grid grid-cols-3 gap-2">
                  {['低风险', '需确认', '自动执行'].map((item, index) => (
                    <div key={item} className={`rounded-2xl p-3 text-center text-xs ${index === 2 && automationOn ? 'bg-[color:var(--primary-container)] text-[color:var(--on-primary-container)]' : 'bg-[color:var(--surface-container)] text-muted-foreground'}`}>
                      {item}
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="md3-surface rounded-[28px] p-4">
              <h3 className="font-semibold text-foreground">底部导航预览</h3>
              <div className="md3-bottom-nav mt-4 grid grid-cols-4 rounded-[24px] p-2">
                {navItems.map((item) => (
                  <button
                    key={item.label}
                    onClick={() => setActiveNav(item.label)}
                    className={`md3-state-layer rounded-[18px] px-2 py-3 text-xs ${
                      activeNav === item.label ? 'bg-[color:var(--secondary-container)] text-[color:var(--on-secondary-container)]' : 'text-muted-foreground'
                    }`}
                  >
                    <item.icon className="mx-auto mb-1 h-4 w-4" />
                    {item.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      <AnimatePresence>
        {drawerOpen && (
          <motion.aside
            initial={{ opacity: 0, x: 28 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 28 }}
            transition={{ duration: 0.28, ease: [0.2, 0, 0, 1] }}
            className="md3-surface-highest rounded-[28px] p-4"
          >
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-semibold text-foreground">AI 助手抽屉</h3>
                <p className="text-sm text-muted-foreground">当前页面上下文、计划和工具反馈。</p>
              </div>
              <button className="md3-state-layer rounded-full p-2 text-muted-foreground" onClick={() => setDrawerOpen(false)}>
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="mt-4 space-y-3">
              {aiDrawerItems.map(({ label, text, icon: Icon }) => (
                <div key={label} className="rounded-3xl bg-[color:var(--surface-container)] p-4">
                  <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                    <Icon className="h-4 w-4 text-primary" />
                    {label}
                  </div>
                  <p className="mt-2 text-sm leading-6 text-muted-foreground">{text}</p>
                </div>
              ))}
              <Button variant="filled" className="w-full">
                <Check className="mr-2 h-4 w-4" />
                应用计划
              </Button>
            </div>
          </motion.aside>
        )}
      </AnimatePresence>

      {!drawerOpen && (
        <MaterialFab className="md3-fab right-24" onClick={() => setDrawerOpen(true)} title="打开 AI 助手">
          <Bot slot="icon" className="h-6 w-6" />
        </MaterialFab>
      )}

      <AnimatePresence>
        {dialogOpen && (
          <motion.div
            className="fixed inset-0 z-50 grid place-items-center bg-black/45 p-4 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.92, y: 18 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: 10 }}
              transition={{ duration: 0.28, ease: [0.2, 0, 0, 1] }}
              className="w-full max-w-md rounded-[28px] bg-[color:var(--surface-container-high)] p-5 text-foreground"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="text-lg font-semibold">确认执行动态动作</h3>
                  <p className="mt-2 text-sm leading-6 text-muted-foreground">将按当前筛选和自动化强度执行一次安全同步，并保留撤销入口。</p>
                </div>
                <button className="md3-state-layer rounded-full p-2 text-muted-foreground" onClick={() => setDialogOpen(false)}>
                  <X className="h-4 w-4" />
                </button>
              </div>
              <div className="mt-5 flex justify-end gap-2">
                <Button variant="text" onClick={() => setDialogOpen(false)}>取消</Button>
                <Button variant="filled" onClick={() => { setDialogOpen(false); runSync(); }}>执行</Button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <MaterialFab className="md3-fab" onClick={() => setDialogOpen(true)} title="新建动作">
        <Plus slot="icon" className="h-6 w-6" />
      </MaterialFab>

      <AnimatePresence>
        {toastOpen && (
          <motion.div
            initial={{ opacity: 0, y: 24, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 16, scale: 0.98 }}
            className="md3-toast fixed bottom-24 left-1/2 z-50 flex w-[min(92vw,420px)] -translate-x-1/2 items-center justify-between gap-3 rounded-2xl px-4 py-3 shadow-xl"
          >
            <span className="text-sm">动作已完成，已保留撤销窗口。</span>
            <button className="rounded-full px-3 py-1 text-sm font-semibold text-[color:var(--primary)]" onClick={() => setToastOpen(false)}>
              撤销
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="fixed bottom-6 left-1/2 z-20 block w-[min(92vw,460px)] -translate-x-1/2 xl:hidden">
        <div className="md3-bottom-nav grid grid-cols-4 rounded-[24px] p-2 shadow-lg">
          {navItems.map((item) => (
            <button
              key={item.label}
              onClick={() => setActiveNav(item.label)}
              className={`md3-state-layer rounded-[18px] px-2 py-3 text-xs ${
                activeNav === item.label ? 'bg-[color:var(--secondary-container)] text-[color:var(--on-secondary-container)]' : 'text-muted-foreground'
              }`}
            >
              <item.icon className="mx-auto mb-1 h-4 w-4" />
              {item.label}
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}
