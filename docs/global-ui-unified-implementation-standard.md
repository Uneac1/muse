# Global UI Unified Implementation Standard

Scope: `Header`, `Sidebar`, `AppLayout`, shared `primitives`, `/today`, `/codex`, `/tokens`.

This document is the implementation口径 for closing the current global UI Return for Fixes. It does not create a new acceptance baseline; it operationalizes the existing three blockers: Header抢权、primary/success语义外溢、页面样式未完全回收至 primitives.

## 1. Global Direction

Use "task-first console" as the single visual direction.

- Page content owns the main task focus.
- Header and Sidebar are frame-level tools only.
- Each page section should make the next best action obvious without turning every selection state into a primary action.
- `primary` means current/info/main operation.
- `success` means healthy/available/completed/can continue.

Rejected alternatives:

- Status-wall layout: makes Today/Codex compete with monitoring dashboards.
- Navigation-first layout: makes the app feel like a module directory instead of an operating console.
- Per-page color branches: keeps causing token drift and inconsistent QA results.

## 2. Shared Primitives Rules

Files:

- `web/src/components/ui/primitives.tsx`
- `web/src/index.css`

Rules:

- All status labels use `StatusTag`.
- All selectable cards, rows, and framed blocks use `Surface` or a shared `ControlPanel` primitive.
- Page components should not define new one-off success/primary/warning/danger colors.
- `toneTextClass` and `toneSurfaceClass` are the only allowed semantic tone helpers for text/surface state.
- `Button variant="primary"` is reserved for the current main action inside a container.
- Selected segmented controls should use a quiet selected style unless the selection itself is the main operation.

Semantic mapping:

- `primary`: current page, selected filter, main action, information focus.
- `success`: quota healthy, auth file exists, session retained, OAuth complete, sync available, task completed.
- `warning`: ambiguity, retry protection, low quota, pending confirmation.
- `danger`: blocked, failed, missing required local resource, destructive action.
- `neutral`: metadata, history, descriptions, inactive states.

## 3. Header

File: `web/src/components/layout/Header.tsx`

Goal: Header must not compete with the page main task.

Required changes:

- Route eyebrow should use neutral frame styling: `border-border bg-background text-muted-foreground`.
- Remove or demote the `Live` chip; if kept, it must be neutral and only visible as metadata.
- Search remains secondary/quiet.
- AI entry remains quiet tool action, not primary.
- Theme and menu remain icon-only utility actions.

Do not:

- Use `bg-primary/10 text-primary` in Header badges unless it is an actual current-page navigation marker with no stronger page CTA nearby.
- Add solid primary buttons to Header.

## 4. Sidebar

File: `web/src/components/layout/AppSidebar.tsx`

Goal: Sidebar acts as navigation frame, not a page hero.

Keep:

- Active link: shallow selected state only.
- No shadow-heavy active state.
- No success tone in navigation.

Required adjustment:

- If active link uses `primary`, keep it text/border level only; avoid large filled surfaces.
- Sidebar dock must remain visually below navigation priority.

## 5. AppLayout

Files:

- `web/src/App.tsx`
- `web/src/components/layout/AppLayout.tsx`
- `web/src/index.css`

Goal: layout should be stable at 1366 / 1024 / 390.

Rules:

- Main content must own scroll; body remains non-scrolling if current architecture requires it.
- Header sticky behavior must not cover page content.
- Sidebar mobile overlay must close on navigation and not trap the main CTA.
- Page content spacing should use shared `control-page` / `control-panel` rhythm.
- Avoid nested card-in-card layout except for repeated list items or modal-like bounded groups.

Responsive checks:

- 1366: Sidebar label mode visible, Header full search visible, page content has no horizontal scroll.
- 1024: Header search may remain compact or fluid, Sidebar should not compress content into unreadable rows.
- 390: Sidebar becomes overlay, Header keeps only icon utilities, page main action remains reachable without horizontal scroll.

## 6. Today

File: `web/src/pages/Today.tsx`

Goal: first screen answers "now what?"

Required structure:

- Keep one visible main task block.
- Keep one primary action in the hero/main focus area.
- Stats are secondary summary, not the main attraction.
- Empty states should use dashed/neutral surfaces and text links or secondary actions.
- Loading skeleton should mimic final layout rhythm.
- Error state should be visible and actionable where possible.

Tone rules:

- Alert/risk uses `warning`.
- Stable/healthy state uses `success` only if it explicitly means all clear.
- Navigation links and contextual details stay neutral or primary text only.

## 7. Codex

File: `web/src/pages/CodexManager.tsx`

Goal: first screen answers "does the active account need action?"

Required structure:

- Top panel uses `view.primaryTask` as the only page-level anchor.
- Account list is secondary; repeated account-row actions must not all appear as primary.
- `仅激活 / 激活并打开` should be segmented and selected, but not visually equal to the page main action unless inside a settings-confirm container.
- Ambiguous account state: warning surface, automatic rotate disabled, manual confirmation available.
- Retry-protection state: warning surface, disabled action, retry time visible.

Tone fixes:

- `auth.json exists` and `sessions retained` should use `success`, not `primary`.
- Active account can use `primary` only as "current selection"; healthy quota uses `success`.
- Warning and danger should not be softened into primary.

Responsive risk:

- Account row actions currently risk crowding on tablet/narrow widths. Prefer wrapping action cluster below account metadata earlier than `lg`.

## 8. Tokens

File: `web/src/pages/TokenAnalytics.tsx`

Goal: quota management should present one management focus, not a wall of primary selections.

Required structure:

- Page hero: only `新增账号` can be primary.
- `Codex 切换` should be secondary unless it is the user's current task.
- AI governance panel should not default to `Surface tone="primary"` if it is not the page's main task.
- Tabs/ranges/grouping should use quiet selected state, not repeated `primary` buttons.
- Account selected state should use selected surface, not primary CTA language.

State rules:

- Healthy quota and OAuth success use `success`.
- Reauth needed, sync retry, proxy recovery use `warning`.
- Failed auth / missing quota / deletion risk use `danger`.
- Empty account list, empty detail, empty balance cards, empty usage sections remain neutral dashed states.

## 9. Required Verification Before UX Recheck

Frontend/fullstack should provide:

- Changed files list.
- Pages checked: `/today`, `/codex`, `/tokens`.
- Frame checked: Header, Sidebar, AppLayout.
- Widths checked: 1366, 1024, 390.
- States checked: loading, empty, error, disabled, warning, success.
- Specific notes for the three blockers:
  - Header no longer uses page-level primary emphasis.
  - `primary` and `success` are visibly and semantically distinct across P0/P1 pages.
  - Page-specific one-off color/shape styles are either removed or justified as exceptions.

UX can only close Return for Fixes after these notes are provided with the implementation.
