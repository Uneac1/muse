# Muse 共享组件样板清单

本清单用于全局 UI/交互优化验收，配合 `ui-review-checklist.md` 与 `.openteams/context/39d486bb-a24b-43c3-99e5-0b9f87dbe10c/tokens_ux_targeted_review.md` 使用。

## 语义色

- `primary`：信息态、当前选择、主操作入口，不表达完成或健康。
- `success`：完成、可用、健康、额度充足等正向结果。必须使用 `--success` 和 `SemanticTone: success`，不得回落到 `primary`。
- `warning`：需要注意、退避、待处理。
- `danger`：失败、错误、破坏性动作。
- `neutral`：普通元信息、默认标签。

## 共享入口

- 状态标签统一用 `StatusTag`。
- 面板/列表行/选中态容器统一用 `Surface`。
- 文本色统一通过 `toneTextClass` 或语义 token。
- 配额条、健康条等成功态进度条使用 `var(--success)`。

## 按钮与反馈

- 同一容器最多一个 `Button variant="primary"`。
- 次操作使用 `secondary` 或 `quiet`。
- disabled 必须保持可见但不可点击，不新增页面私有 opacity 规则。
- Toast 成功、警告、错误文案必须和页面状态一致，不能把失败降级成成功态。

## QA 抽查点

- `/tokens`：余额卡、账号卡、OAuth 成功提示中 `success` 与 `primary` 可区分。
- `/codex`：当前激活、额度健康、退避保护、歧义候选语义色不混淆。
- `Today / Header / Sidebar`：信息态继续使用 `primary`，不要把普通导航高亮误用成 `success`。
- 亮色、暗色、窄屏下语义差异仍可辨识。
