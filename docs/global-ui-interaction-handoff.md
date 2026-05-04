# Muse 全局 UI / 交互优化交付

基线文件：
- `Muse/docs/ui-review-checklist.md`
- `.openteams/context/39d486bb-a24b-43c3-99e5-0b9f87dbe10c/tokens_ux_targeted_review.md`

本轮目标：把 `/tokens` 已验证的 primitives 规则推广到 `Today / Codex / Header / Sidebar`，优先解决状态语义、首屏主任务锚点、导航框架层权重三类问题。

## 视觉方向

### 方向 A：任务优先型控制台（推荐）
- 页面第一屏只保留一个主任务锚点。
- Header / Sidebar 降为框架层，不与页面主任务抢强调。
- `primary` 用于信息与主操作，`success` 只表达已完成、健康、可继续。
- 适合当前 Muse：它是工作系统，不是营销页，也不是数据展示墙。

### 方向 B：状态监控型控制台
- 首屏以健康度和异常状态为核心。
- 优点是风险明显，缺点是 Today 和 Codex 容易重新变成状态墙。
- 适合后续做独立「系统监控」页，不建议作为全局基线。

### 方向 C：模块入口型控制台
- 首屏强调各模块入口。
- 优点是上手快，缺点是会削弱“现在先做什么”的任务判断。
- 不建议继续采用。

推荐采用方向 A。

## 全局组件规则

### 状态语义
- `primary`：当前信息、主操作、当前页识别色。建议继续使用 teal。
- `success`：健康、已完成、可继续。建议使用 green，不再复用 primary。
- `warning`：需要确认、额度偏低、退避保护、账号歧义。
- `danger`：失败、阻断、不可继续。
- `neutral`：历史、说明、次级信息。

建议 tokens：
- light success: `#16A34A`
- light success surface: `rgba(22, 163, 74, 0.10)`
- light success border: `rgba(22, 163, 74, 0.28)`
- dark success: `#4ADE80`
- dark success surface: `rgba(74, 222, 128, 0.12)`
- dark success border: `rgba(74, 222, 128, 0.28)`

### 页面首屏
- Today：hero 高度控制在 `280px - 340px`，主按钮只保留一个，辅助 chip 不超过 3 个。
- Codex：首屏只回答“当前账号是否需要切换”，账号池与趋势后置。
- Header：搜索、AI、主题都保持工具入口权重，不出现实心主按钮。
- Sidebar：当前页高亮使用浅底 + 左边界或浅底 + 文本色，不使用重阴影。

### 交互规则
- 同一容器最多一个主按钮。
- 切换类操作必须明确区分“仅激活”和“激活并打开”。
- 歧义态必须停止自动绑定或轮换，提供手动确认。
- 退避态禁用重复请求，显示下次可重试时间。
- 所有 hover 只改变边框、底色、轻位移中的一种，不叠加过多效果。

## 可直接给 fullstack 的落点

1. `web/src/components/ui/primitives.tsx`
   - 将 `toneClasses.success` 从 `primary` 分离。
   - 保持 `StatusTag / Surface / toneTextClass / toneSurfaceClass` 统一消费。

2. `web/src/index.css`
   - 增加 success CSS token 或 Tailwind 可消费的 success 语义变量。
   - 将 `control-metric-success` 改为使用 success token，不使用临时绿色。

3. `web/src/pages/Today.tsx`
   - 保留一个主 CTA。
   - 将统计卡作为二级摘要，不与主任务标题争夺首屏权重。

4. `web/src/pages/CodexManager.tsx`
   - 新增自动切换行为配置时，使用 segmented control：
     - `仅激活`
     - `激活并打开`
   - `当前稳定` 使用 success；`当前可操作` 或 `需要开启自动切换` 使用 primary。

5. `web/src/components/layout/Header.tsx`
   - 搜索入口保持 secondary/quiet。
   - 区块 AI 保持工具态，不使用 primary。

6. `web/src/components/layout/AppSidebar.tsx`
   - 当前页高亮保持导航态，不做页面级主强调。

## 预览文件

预览代码：`Muse/docs/global-ui-interaction-preview.html`

该文件包含：
- 状态色语义对比
- Today 首屏压缩布局
- Codex 主任务卡与自动切换模式 segmented control
- Header / Sidebar 框架层权重示例

