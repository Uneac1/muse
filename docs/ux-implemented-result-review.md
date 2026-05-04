# UX Implemented Result Review

Scope reviewed: `web/src/components/ui/primitives.tsx`, `web/src/index.css`, `web/src/components/layout/Header.tsx`, `web/src/components/layout/AppSidebar.tsx`, `web/src/pages/Today.tsx`, `web/src/pages/CodexManager.tsx`, `web/src/pages/TokenAnalytics.tsx`, and `web/src/lib/tokenViewModel.ts`.

## Verdict

Partial pass. The primitives-level `primary` / `success` split is now implemented and reusable, and `Today` / `Codex` both have a recognizable main-task area. The round is not fully closed because Header still uses primary-colored page badges/live indicators, Codex account-list actions create repeated primary CTAs, and Token still uses several primary selection controls in the same dense detail area.

## Review Against Anchors

### Main Task Anchor

- `Today`: mostly passes. The first content block establishes "今日主焦点" and keeps action queues below it.
- `Codex`: mostly passes. `view.primaryTask` drives the top panel and provides the first actionable focus.
- `Token`: partial. It has a page hero and "新增账号" as the dominant action, but the account management/detail controls below still compete heavily with the primary action.

### Primary / Success Semantic Split

- Shared implementation passes. `SemanticTone` includes `success`, `toneClasses.success` consumes `--success`, and CSS defines distinct `--primary` and `--success` tokens.
- Token quota mapping passes in principle. `quotaToneFromPercent` and `tokenCardTone` now map healthy quota to `success`.
- Remaining issue: some positive local-system states still render with `text-primary`, such as Codex `auth.json` exists and `sessions` retained. These should become `success` if they mean healthy/available.

### Header / Sidebar Demotion

- Sidebar mostly passes. Active navigation is shallow `bg-primary/10 text-primary`, no heavy shadow or primary button treatment.
- Header partial. Search and AI actions are quiet/secondary, but the route eyebrow and "Live" chip still use primary styling, which keeps Header visually closer to page-level emphasis than intended.

## Systemic Issues Still Present

1. `primary` is still overused as a selection and status language in dense controls: Codex segmented options, account rows, Token tabs/ranges/grouping, and selected cards all use primary. This is not a blocker for the primitives fix, but it weakens the "one main action per container" rule.
2. Several page-level surfaces still use custom rounded sizes and direct color classes instead of only consuming shared primitives. This means the shared layer is better than before but not yet the only visual source.
3. Header still participates in semantic emphasis through primary badges. It should use neutral frame styling unless indicating the active page structurally.

## Required Follow-Up

- Replace healthy local status text in Codex with `success` tone.
- Demote Header eyebrow / Live chip to neutral frame styling.
- Audit each major container so it has at most one `variant="primary"` action; convert segmented selected states to a quieter selected style where they are not the page's main action.
