# Muse DESIGN.md

面向 Stitch 生成 Muse 新前端页面的设计系统说明。Muse 是一个个人操作系统式工作台，不是官网、落地页或传统后台。

## 产品定位

Muse 是一个给单个高频使用者的个人 Command Center，用来把邮件、账号、AI、记忆、规则、实体、代理、Token、Codex、订阅、报纸和外部集成放进同一个可操作界面。

核心体验目标：

- 进入页面 3 秒内知道“现在最该处理什么”。
- 所有模块都能从 Today / Command Center 下钻，而不是孤立工具堆叠。
- 强交互、强动态、强个人风格：页面要像活着的操作台，有实时状态、队列流动、展开/折叠、拖拽排序、运行日志、动效反馈。
- 保留 Material 3 的动态色彩、状态层、形状体系、清晰组件层级和可触达控件，但整体气质更像私人工作室里的任务中枢。

## 信息架构

固定左侧导航分为三组：

- Command Deck：Today、Entity View、Memory、Rules、AI。
- Runtime：邮箱管理、统一收件箱、Ymail 临时邮箱、统计仪表盘、Token 管理、Codex、OpenTeams、代理设置、订阅管理。
- Integrations：报纸、Cloudflare、GitHub、Linux.do、Notion。

全局框架：

- 左侧固定导航 rail，可折叠为图标模式。
- 顶部 sticky utility bar，包含全局命令搜索、AI Dock、同步状态、主题切换、当前运行时状态。
- 主工作区是可滚动操作台，首屏必须显示当前焦点、风险、队列和实时健康信号。
- 右侧可出现 contextual drawer，用于 AI 建议、当前实体详情、日志、运行计划或邮件预览。

## 必须覆盖的功能

Stitch 生成时，首个页面要能暗示 Muse 的完整能力，而不是只画一个 Dashboard。

必须在同一套设计里体现：

- Today：今日主任务、异常阻塞、下一步队列、记忆信号、快捷入口。
- Dashboard：邮箱总览、代理在线、缓存邮件、异常账户、最近邮件、分布图、Top 账户。
- Inbox：统一邮件列表、邮箱/文件夹元数据、邮件预览、刷新、批处理、展开阅读。
- Accounts：邮箱账号表格、导入、粘贴导入、编辑、备份恢复、最近邮件面板、发信/查看邮件。
- Rules：自动化规则列表、规则编辑器、运行结果、触发条件、启停状态。
- Memory：长期记忆卡片、置顶、标签、来源、AI 记忆沉淀。
- Entity View：项目/邮箱/域名/仓库/账号实体图谱，支持搜索、健康筛选、关联动作下钻。
- AI Studio：模型账号管理、诊断、测试、聊天线程、运行时工具结果、失败切换。
- Token 管理：OpenAI/Codex token 账号、用量、额度、同步、代码审查视图、Raw JSON。
- Codex：Codex Desktop 账号池、当前账号、额度、自动切换、候选替补、本机状态、低额度阈值、运行日志。
- Proxy：代理列表、默认代理、启停、连通性测试、mihomo 内核状态、OpenAI 测试。
- Subscriptions：订阅源、流量、到期、配置、刷新、复制链接、配置文件。
- Newspaper：新闻分区、双语导读、关键词搜索、刷新、阅读器、原站跳转。
- Integrations：Cloudflare、GitHub、Linux.do、Notion、Ymail、OpenTeams 的连接状态、同步、列表、诊断与历史事件。
- Auth / Backup / Runtime：登录、Google OAuth、数据备份、错误边界、运行事件。

## 视觉方向

关键词：私人控制台、材料感、实时、精密、温暖、克制、带一点个人收藏家的偏执。

默认 light mode，但不是普通白后台：

- 背景是温暖浅色纸面，不要纯灰后台。
- 工作面板是 Material 3 风格的 tonal surfaces。
- 允许局部深色区域：终端日志、AI 工具执行、Raw JSON、运行时预览。
- 页面有“动态色彩仪表盘”感：不同模块有独立色温，但整体由中性色收束。

避免：

- 落地页 hero。
- 大幅营销标题。
- 装饰性渐变球、玻璃拟态泛滥、纯紫蓝渐变。
- 卡片套卡片。
- 全站深色默认。
- 只有统计卡，没有任务动作。

## 色彩 Tokens

主色：

- canvas：`#FAF8F3`
- surface：`#FFFFFF`
- surface-low：`#F4F0EA`
- surface-high：`#FFFBF5`
- outline：`#DDD6CC`
- ink：`#1F1E1B`
- ink-muted：`#69635B`
- primary：`#0B6FDE`
- primary-container：`#D7E8FF`
- on-primary-container：`#073B75`

个人风格辅助色：

- teal-connect：`#008B8B` 用于连接、同步、网络、代理。
- amber-risk：`#C78100` 用于阻塞、到期、注意。
- green-good：`#1D7F4E` 用于健康、成功、完成。
- red-error：`#BA1A1A` 用于失败、断开、危险。
- coral-memory：`#C95F4A` 用于记忆、AI 建议、人工判断。
- violet-ai：`#6750A4` 只少量用于 AI/模型，不要主导页面。

颜色规则：

- Blue 是主行动和选中状态。
- Teal 是运行连接感。
- Coral 是个人记忆和判断痕迹。
- Amber/Red/Green 只用于语义状态。
- 状态必须有文字，不允许只靠颜色。

## Typography

- 主字体：Inter / system sans。
- 中文保持清晰紧凑，不用书法或装饰字体。
- 代码和日志：JetBrains Mono / ui-monospace。

字号：

- App header title：24-30px。
- Page focus title：30-36px。
- Panel title：16-20px。
- Body：14-15px。
- Metadata：12-13px。
- Micro label：11px uppercase，letter spacing 最多 `0.06em`。

排版规则：

- 不要在工作台面板里使用 hero 级超大字。
- 数字可大，但必须服务于判断。
- 中文标签要短，技术 metadata 可以英文。

## Shape / Elevation

参考 Material 3 的 shape family，但要更锋利一点：

- 小控件 radius：8px。
- 面板 radius：12px。
- Floating drawer / command palette：16px。
- Pill chip 只用于筛选、状态、分段控件。
- 阴影很轻，主要靠 tonal surface 和边线分层。

## Layout

桌面端：

- 1440px 以上：左 nav 256px，主内容 12 栏，右侧 contextual drawer 320-380px 可开合。
- 首屏结构：顶部 utility bar，下方 command focus band，然后三列操作区。
- 左主列：今日焦点 + 队列。
- 中列：邮件/规则/实体动态。
- 右列：AI runtime、健康信号、日志。

移动端：

- 左导航变 bottom nav 或 drawer。
- 首屏保留“当前焦点”和“待处理队列”，其他模块折叠为横向 chips。
- 所有按钮可触达，列表密度降低但不变成营销页。

## 核心组件

需要在 Stitch 里明确画出来：

- Navigation rail：分组、active state、折叠图标。
- Utility header：command search、AI Dock、sync state、theme switch。
- Focus card：当前最重要动作、原因、主按钮、证据 chips。
- Queue list：可完成、延期、忽略、拖拽排序。
- Health strip：邮箱、代理、Token、AI、集成状态。
- Mail row：来源、账号、文件夹、摘要、风险标签、快速动作。
- Entity graph card：节点、连接、健康状态、关联动作数。
- Rule editor：左列表、中编辑、右运行历史。
- Runtime log：深色 mono surface，支持展开和筛选。
- AI suggestion drawer：显示建议、可应用计划、工具执行结果。
- Token / quota meter：环形或条形额度，显示同步时间。
- Integration card：连接状态、最近同步、诊断动作。
- Command palette：模糊搜索、快捷动作、最近使用。

## 动效与交互

交互必须强，但不能花哨：

- 页面进入：panel stagger 80-120ms，轻微 y 移动。
- 导航切换：active indicator 使用 Material 3 container morph。
- 队列操作：完成后列表项滑出，下一项上移，显示 undo。
- 刷新/同步：按钮 spinner + panel 内局部 shimmer，不整页闪烁。
- 状态变化：健康条有短暂 pulse，日志新增行轻微高亮。
- 邮件展开：row 内联展开，不跳转。
- AI Dock：右下或右侧浮层，打开时从右滑入，保留主页面上下文。
- Command palette：`Ctrl+K` 风格居中浮层，输入后实时过滤。
- 拖拽排序：队列项 hover 时出现 grip icon。
- 图表：微型 sparkline/进度条可 animate，但不要变成装饰。

## 首页生成要求

首个 Stitch 页面建议生成：`Muse Personal Command Center / Today`。

它要在一个页面里展示完整产品能力：

- 左侧 nav 显示所有模块。
- 顶部 header 显示 command search、Live、AI、Sync。
- 主焦点卡写出今天要做的一件事。
- 下方/旁边有队列、邮件、实体、记忆、Token、代理、Codex、集成健康、报纸信号。
- 右侧 AI runtime drawer 半展开，显示“建议执行计划”和工具运行日志。
- 页面中要有多处可交互暗示：tabs、chips、toggles、sliders、expand rows、drag handles、command palette trigger。

## 可直接用于 Stitch 的 Prompt

生成一个高保真的 Muse Personal Command Center 前端页面。Muse 是个人操作系统式工作台，不是 landing page。使用 Material 3 风格的动态色彩、tonal surfaces、状态层、清晰按钮层级和流畅动效，但整体更有个人风格：温暖浅纸面、精密操作台、实时运行感、AI 右侧抽屉、深色日志面板。

页面为已登录的桌面 Web App。左侧固定导航分三组：Command Deck 包含 Today、Entity View、Memory、Rules、AI；Runtime 包含 邮箱管理、统一收件箱、Ymail 临时邮箱、统计仪表盘、Token 管理、Codex、OpenTeams、代理设置、订阅管理；Integrations 包含 报纸、Cloudflare、GitHub、Linux.do、Notion。顶部 sticky header 包含 Command Search、Live 状态、AI Dock、Sync、Theme。

主屏内容：顶部不是营销 hero，而是 compact focus band，显示“今日主任务”、原因、主操作按钮、风险/证据 chips。主体使用 12 栏布局：左列是 Next Action Queue，可完成、延期、拖拽排序；中列是 Unified Inbox + Entity Signals，邮件行可展开，实体卡显示项目/邮箱/域名/仓库关联；右列是 AI Runtime + System Health，包含 Token 额度、代理连通性、Codex 当前账号、集成同步状态和深色运行日志。下方露出 Newspaper 双语信号和 Rules 自动化运行历史。

视觉要求：light mode，canvas `#FAF8F3`，white/tonal surfaces，primary blue `#0B6FDE`，teal 用于连接，amber 用于风险，coral 用于 memory/AI judgement，少量 violet 用于 AI。卡片 12px radius，控件 8px radius，细边线，轻阴影。不要装饰性渐变球，不要大营销标题，不要嵌套卡片，不要全深色。

交互要求必须在画面中可见：Command palette trigger、AI drawer、loading sync spinner、可展开邮件行、队列 drag handle、filter chips、toggle、slider、tabs、日志新增高亮、tooltip 风格 icon buttons。使用真实中文操作文案和少量英文 metadata。整体要像一个每天打开使用的个人运行中枢，信息密度高但层级清楚。

## 生成验收

- 首屏能回答：现在先做什么、为什么、从哪里处理。
- 能看出 Muse 不是单一邮箱工具，而是个人操作系统。
- 至少 12 个功能模块在导航或面板中出现。
- 至少 8 种交互状态可见。
- 颜色不是单一蓝/紫/灰。
- AI、记忆、日志、队列有个人风格，而不是普通 SaaS 后台。
