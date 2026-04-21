# Muse 优化路线图

## 1. 现状判断

当前首页 `web/src/pages/Dashboard.tsx` 还是典型的“统计仪表盘”：

- 入口中心是统计卡片，不是待处理事项。
- 数据只来自 `server/src/services/DashboardService.ts`，覆盖邮箱与代理，没拉通 GitHub、Cloudflare、Notion、报纸、AI。
- 异常没有统一模型，各模块只能各自显示“error / failed / inactive”。
- 模块之间几乎没有联动，用户必须自己记住上下文去切换页面。

这和 Muse 想做的事情有偏差。Muse 不应该是“看模块数据”，而应该是“围绕今天要处理的事，把系统主动组织起来”。

## 2. 首页重构原则

首页要从“总览统计页”改成“今日工作台”。

优先级顺序：

1. Today
2. Inbox
3. 异常
4. 高频跳转
5. 全局搜索 / 命令
6. 背景统计

换句话说，首页先回答四个问题：

1. 今天最该处理什么？
2. 新进来的东西是什么？
3. 哪些地方坏了或快坏了？
4. 我下一跳应该去哪？

## 3. 首页区块定义

### 3.1 应保留并前置

#### A. Today

首页第一屏核心区块，替代当前大部分统计卡。

建议内容：

- 今日待处理清单
- 今日新增异常
- 今日新增邮件 / GitHub 事项 / 报纸高优先内容
- Token 即将过期
- 需要人工处理的账户 / 代理 / 集成
- AI 生成的“今天建议先做什么”

数据来源：

- 邮箱缓存
- token 状态
- integration sync 结果
- newspaper 新内容
- AI 历史行为与优先级规则

#### B. Inbox

首页第二核心区块，不只是“最近邮件”。

建议拆成三层：

- 新到内容
- 待分类内容
- 待归档 / 待关联内容

Inbox 内容范围不要只限邮件，应该逐步扩成统一收件箱：

- 邮件
- GitHub issue / PR / release / event
- Cloudflare 变更
- Notion 最近编辑
- 报纸条目
- 订阅变更

#### C. 异常中心

首页第三核心区块，替代分散的“异常邮箱 / Token 待刷新 / 代理失败”等小卡片。

建议内容：

- 严重异常
- 即将变成异常的风险项
- 最近 24 小时变化
- 一键跳转到对应模块和对象

#### D. 高频一跳联动

首页中部或右侧放“下一步动作”区块。

建议内容：

- 从异常账户跳到邮箱详情
- 从 GitHub PR 跳到相关项目
- 从报纸文章跳到项目 / 实体
- 从 Cloudflare zone 跳到对应域名项目
- 从 AI 总结跳到证据源

这是“工作流抓手”，不是纯导航。

### 3.2 应保留但后移

以下内容仍然有价值，但不该占首页黄金位置：

- 邮箱 Provider 分布
- 邮箱状态分布
- 代理状态分布
- 邮件量 Top 账户
- 总账户数 / 总代理数 / 总缓存邮件数

处理方式：

- 后移到“运营 / 资源健康”折叠区
- 或单独做 `/overview` / `/analytics`
- 首页只保留必要摘要，比如“异常账户 4 个”

### 3.3 应删除或降级

首页不该继续以这类内容为主：

- 两排大面积统计卡作为视觉中心
- “Cloudflare管理 / GitHub仓库”这种没有上下文的快速操作按钮
- 纯分布图表但没有动作建议的区块

原因：

- 信息有展示价值，但没有决策价值。
- 用户看完不知道接下来做什么。

## 4. 第一阶段实施目标

目标：先把首页从“统计页”改成“行动页”。

### 4.1 新首页信息架构

建议布局：

#### 顶栏

- 全局搜索
- 命令面板入口
- 今日摘要状态
- 最近同步时间

#### 第一屏主区

- Today 列
- Inbox 列
- 异常列

#### 第二屏辅助区

- 高频联动
- 最近变化
- 资源健康摘要

#### 第三屏次要区

- 统计概览
- 分布图
- Top 账户

### 4.2 全局搜索和命令面板

第一阶段就要上，不然后面的“网络化”无法被消费。

全局搜索应支持：

- 邮箱账号
- 邮件主题 / 发件人
- GitHub repo / issue / PR
- Cloudflare zone / record / project
- Notion page / database
- 报纸文章
- 订阅
- AI 会话

命令面板应支持：

- 跳转页面
- 搜索实体
- 执行快捷动作
- 新建项目 / 实体
- 触发同步
- 标记归档 / 标记异常已处理

建议实现：

- 前端增加统一 `search index`
- 后端增加聚合搜索接口 `/search`
- 命令面板动作统一抽象成 `command items`

### 4.3 统一异常状态模型

这是第一阶段最关键的底层改造之一。

当前状态分散在：

- account.status
- proxy.status
- token 同步时间
- integration connect/sync 结果
- AI account test status

需要统一成一套异常事件模型：

```ts
type IssueSeverity = 'critical' | 'high' | 'medium' | 'low';
type IssueStatus = 'open' | 'acknowledged' | 'resolved' | 'muted';

interface MuseIssue {
  id: string;
  sourceType: 'mail_account' | 'proxy' | 'token' | 'github' | 'cloudflare' | 'notion' | 'subscription' | 'newspaper' | 'ai';
  sourceId: string;
  category: 'auth' | 'sync' | 'network' | 'quota' | 'content' | 'risk' | 'staleness';
  severity: IssueSeverity;
  status: IssueStatus;
  title: string;
  summary: string;
  detectedAt: string;
  lastChangedAt: string;
  route: string;
  evidence: string[];
}
```

统一之后首页才能真正做异常中心，而不是拼凑计数器。

### 4.4 高频模块一跳联动

先做四条高频链路：

1. 首页异常 -> 对应模块详情
2. 邮件 -> 账户详情 -> Token / 代理状态
3. GitHub repo / PR -> 项目页
4. 报纸文章 -> 归档 / 标注 / 项目关联

第一阶段不要追求全图谱，先把“从提醒到处理”的链路打通。

## 5. 第二阶段：把模块做成网络

目标：模块之间开始互相解释。

核心不是多加模块，而是补一层共享语义层。

### 5.1 建立项目 / 实体维度

建议新增两类核心对象：

#### Project

代表一个持续关注主题。

例如：

- `Muse`
- `某客户站点`
- `某 GitHub 产品`
- `某 Cloudflare 域名体系`

#### Entity

代表项目下的具体对象。

例如：

- 域名
- 仓库
- 邮箱账号
- Notion 页面
- 报纸文章
- 订阅源
- AI 线程

建议关系模型：

```ts
interface Project {
  id: string;
  name: string;
  description?: string;
  status: 'active' | 'paused' | 'archived';
  priority: number;
  tags: string[];
}

interface Entity {
  id: string;
  type: 'email' | 'repo' | 'zone' | 'page' | 'article' | 'subscription' | 'thread' | 'person' | 'company';
  title: string;
  externalId?: string;
  source: string;
  projectId?: string;
  status?: string;
  metadata: Record<string, unknown>;
}

interface EntityRelation {
  id: string;
  fromEntityId: string;
  toEntityId: string;
  relationType: 'belongs_to' | 'mentions' | 'about' | 'affects' | 'duplicates' | 'derived_from';
  confidence: number;
}
```

### 5.2 模块互相关联

目标关系：

- 邮箱账号 <-> 项目
- GitHub repo / PR / issue <-> 项目
- Cloudflare zone / pages / worker <-> 项目
- Notion page / database <-> 项目
- 订阅 <-> 项目
- 报纸文章 <-> 项目 / 实体
- AI 线程 <-> 项目 / 实体

有了这层后，系统才能回答：

- 这个 GitHub PR 跟哪个域名 / 项目相关？
- 这篇报纸文章跟我哪个项目有关？
- 最近 Notion 和 GitHub 同时发生变化的是哪个项目？

### 5.3 报纸升级为可归档内容流

当前报纸模块更像“阅读器”，还不是知识资产入口。

第二阶段要支持：

- 归档文章
- 打标签
- 关联项目
- 关联实体
- 标记“仅读 / 待跟进 / 已转行动”
- AI 生成该文章与项目的关系说明

### 5.4 AI 从聊天升级为基于实体的总结

AI 不该只围绕 thread 聊天。

第二阶段应新增：

- 项目总结
- 实体总结
- 风险摘要
- 多源证据归纳

例如：

- “总结过去 7 天与 `Muse` 项目相关的 GitHub / Notion / 报纸变化”
- “总结 `example.com` 这个实体相关的 Cloudflare、订阅和 GitHub 风险”

## 6. 第三阶段：把系统做成代理

目标：不是我盯系统，是系统帮我盯。

### 6.1 自动化规则

需要支持规则对象，而不是散落在代码里的 cron。

建议模型：

```ts
interface AutomationRule {
  id: string;
  name: string;
  enabled: boolean;
  scopeType: 'global' | 'project' | 'entity';
  scopeId?: string;
  triggerType: 'schedule' | 'change' | 'threshold' | 'issue';
  actionType: 'summarize' | 'alert' | 'track' | 'recommend';
  config: Record<string, unknown>;
}
```

### 6.2 定时摘要

至少支持：

- 每日摘要
- 每周项目摘要
- 指定项目 / 实体摘要
- 异常汇总摘要

### 6.3 风险预警

第一批可做：

- Token 即将失效
- 代理失败率升高
- GitHub repo 有新增 issue / PR 堵塞
- Cloudflare zone 状态变化
- Notion 最近长期无更新或异常高频更新
- 订阅额度 / 到期风险

### 6.4 变化追踪

目标是形成“变化流”。

建议记录：

- GitHub 新 issue / PR / release
- Cloudflare DNS / ruleset / deployment 变化
- Notion page / database 变化
- 报纸新增与高相关内容
- AI 总结结果变化

### 6.5 基于历史行为的优先级推荐

优先级不该只看严重程度，还要看用户习惯。

可以综合：

- 过去常处理的对象
- 总被推迟的对象
- 和当前项目相关度高的对象
- 多个模块同时命中的对象
- 异常持续时间

最终输出：

- 推荐优先级
- 推荐原因
- 建议动作

## 7. 对当前代码的落地建议

### 7.1 第一阶段应该改的文件

- `web/src/pages/Dashboard.tsx`
- `web/src/components/layout/Header.tsx`
- `web/src/components/layout/AppSidebar.tsx`
- `web/src/lib/api.ts`
- `web/src/types/index.ts`
- `server/src/services/DashboardService.ts`
- `server/src/routes` 下新增聚合搜索与 issue 接口

### 7.2 第一阶段新增接口建议

- `GET /dashboard/home`
  - 返回 Today / Inbox / Issues / QuickLinks 聚合数据
- `GET /issues`
  - 返回统一异常列表
- `GET /search?q=`
  - 返回全局搜索结果
- `POST /commands/resolve`
  - 返回命令面板动作结果

### 7.3 第一阶段新增前端组件建议

- `HomeTodayPanel`
- `HomeInboxPanel`
- `HomeIssuesPanel`
- `GlobalSearchDialog`
- `CommandPalette`
- `QuickJumpPanel`
- `HealthDigestPanel`

## 8. 执行顺序

### Sprint 1：首页重构

- 用 `Today + Inbox + 异常` 重写首页
- 统计卡降级到次级区域
- 顶栏接入全局搜索与命令面板入口

### Sprint 2：异常与搜索底层

- 建统一 issue 模型
- 建聚合搜索接口
- 补高频一跳联动

### Sprint 3：项目 / 实体层

- 新增 project / entity / relation 模型
- 打通 GitHub / Cloudflare / Notion / 订阅 / 报纸 的关联

### Sprint 4：AI 与代理化

- 做项目级总结
- 做定时摘要 / 风险预警 / 变化追踪
- 做基于历史行为的优先级推荐

## 9. 最后结论

Muse 的升级方向不是“把更多模块塞进侧边栏”，而是三步：

1. 首页从统计页变成行动页
2. 模块从孤岛变成网络
3. 系统从面板变成代理

如果只改首页样式，不补统一异常模型、搜索入口、项目 / 实体层，后面一定还会退回“模块堆叠型后台”。真正的抓手是：先把首页换成任务入口，再补共享语义层，最后再做自动化代理。
