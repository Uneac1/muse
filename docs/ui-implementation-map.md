# Muse UI 实现映射

目的：
把当前 UI 基准规则直接映射到现有前端文件，方便 frontend 先改正确位置，再按 spec 收束。

## 1. Today

主文件：
- `web/src/pages/Today.tsx`

当前主要结构：
- 顶部 `ControlHero`
- 首屏左主区 `ControlPanel`
- 首屏右摘要 `ControlPanel`
- 下方 `下一步队列 / 异常阻塞`

### 需要重点调整

#### A. Hero 压缩
当前入口：
- `ControlHero` in `web/src/pages/Today.tsx`

对齐目标：
- 减少顶部 hero 的装饰存在感
- 把“真正主任务”继续收进下方首个主面板，避免 hero 和主焦点双核心
- 顶部 stats 由“显眼指标”改成“弱化摘要”

实施建议：
- 降低 `ControlHero` 的视觉重量
- stats 数量控制在 3 到 4 个以内，语气弱于主焦点卡
- 主操作只保留一个强按钮

#### B. 首屏主焦点卡
当前入口：
- `title={view.today.headline}` 的主 `ControlPanel`
- 内部 `Current Focus`
- `Most urgent move`

对齐目标：
- 它才是首屏真正第一层，不让上层 hero 抢走注意力
- 主焦点卡高度控制在基准区间内
- “Most urgent move”维持唯一主任务动作

实施建议：
- 统一成 `hero-card` 心智
- `Current Focus`、标题、摘要、主动作、3 条以内辅助信息
- 右侧问答列只保留 2 到 3 条，防止再次碎片化

#### C. 右侧摘要面板
当前入口：
- `今日状态摘要`

对齐目标：
- 退到第二层
- 不与左侧主焦点争第一层级

实施建议：
- 降低标题对比度
- 卡片内部保持 `summary-card` 结构
- 避免再出现大数字或过重标签

## 2. Codex

主文件：
- `web/src/pages/CodexManager.tsx`

当前主要结构：
- 顶部 `ControlHero`
- 各类状态与图表面板
- 账号轮换与设置动作

### 需要重点调整

#### A. 主任务锚点卡
当前入口：
- 顶部 `ControlHero`

对齐目标：
- 首屏必须明确“现在先处理什么”
- `刷新 / 切到下一个 / 切到最佳额度` 不能同时抢第一层级

实施建议：
- 从 `view` 中抽出一个最重要风险或待处理对象
- 将 `ControlHero` 重构为“主任务锚点卡 + 次级动作”
- 主按钮只留一个，另两个按钮降级

#### B. 统计与图表面板
当前入口：
- `StatCard`
- `MiniLineChart`
- 后续图表 / 状态卡

对齐目标：
- 图表和统计服务于主任务，不并列争顶层
- 首屏不要先展示解释型图表

实施建议：
- 统计卡后移到锚点卡下方
- 图表进入第二屏或首屏下半区
- 数字字号不要超过主任务标题存在感

#### C. 账号与状态列表
当前入口：
- `state.accounts`
- `state.status`
- 各操作按钮区域

对齐目标：
- 按 `list-row-card` 统一结构
- 每行只保留必要状态、说明和动作

实施建议：
- 左：账号与状态
- 中：风险或额度
- 右：唯一主动作

## 3. Header

主文件：
- `web/src/components/layout/Header.tsx`

### 需要重点调整
- `ui-icon-btn` 和搜索按钮统一成同一按钮体系
- 顶栏同级强调元素减少
- `区块 AI`、搜索、主题切换之间建立明确主次

实施建议：
- `区块 AI` 与搜索入口不要同时都像主按钮
- `/` 搜索入口维持功能性，弱于页面主任务
- `Live` 状态标签仅做辅助识别

## 4. Sidebar

主文件：
- `web/src/components/layout/AppSidebar.tsx`

### 需要重点调整
- 导航项当前已较清爽，但还要继续统一激活态
- 分组标题可读性继续加强
- Global AI Dock 不能抢导航主结构

实施建议：
- 激活态只保留一套：底色 + 主色文字
- 组标题 tracking 再谨慎，避免过散
- 底部 Dock 视觉上从属于导航，不做第二个视觉中心

## 5. 基础样式层

主文件：
- `web/src/index.css`
- `web/src/components/ui/primitives`
- `web/src/components/layout/ControlCenter`

### 需要重点调整
- 收口圆角
- 收口阴影
- 收口卡片内边距
- 收口按钮主次规则

实施顺序：
1. 先改基础 token 与组件基类
2. 再改 `Today`
3. 再改 `Codex`
4. 最后清 `Header / Sidebar`

## 6. 本轮验收重点
- `Today` 是否已经只剩一个真正第一层焦点
- `Codex` 是否能在 3 秒内回答“先做什么”
- `Header / Sidebar` 是否不再制造额外竞争层级
- 按钮、卡片、标签是否已经回到统一组件态
