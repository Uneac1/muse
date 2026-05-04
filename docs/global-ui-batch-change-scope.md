# Global UI Batch Change Scope

Purpose: define a visible, global batch instead of isolated page tweaks.

This scope is for the next implementation pass. It should be delivered as one coherent batch with file changes, page entries, responsive checks, state checks, and known exceptions.

## Batch Goal

Close the current global UI Return for Fixes and make progress visible across the app shell and high-frequency pages.

Mandatory closure items:

- Header抢权关闭。
- `primary` / `success` 语义外溢关闭。
- 页面样式回收至 shared primitives。

## Required Global Write Scope

Frontend/fullstack should update these areas together:

1. Shell
   - `web/src/components/layout/Header.tsx`
   - `web/src/components/layout/AppSidebar.tsx`
   - `web/src/components/layout/AppLayout.tsx`
   - `web/src/index.css`

2. Shared primitives
   - `web/src/components/ui/primitives.tsx`
   - shared control panel/card/list/button/status variants

3. High-frequency pages
   - `web/src/pages/Today.tsx`
   - `web/src/pages/CodexManager.tsx`
   - `web/src/pages/TokenAnalytics.tsx`
   - `web/src/pages/OpenAgents.tsx`

4. Supporting view models when page logic currently drives visual state
   - `web/src/lib/todayViewModel.ts`
   - `web/src/lib/codexViewModel.ts`
   - `web/src/lib/tokenViewModel.ts`
   - any OpenAgents view model introduced or updated by implementation

## What Must Change

### Header

- Remove primary-colored route badge / live chip emphasis.
- Keep search, AI, theme, and menu as frame-level utilities.
- No solid primary action in Header.

### Sidebar

- Keep active state shallow.
- Do not introduce success/warning/danger navigation states.
- New agent integration entries must not expose reference project names.

### Primitives

- `StatusTag`, `Surface`, `Button`, inputs, selected states, and panels must cover imported interaction needs.
- Add missing variants globally instead of creating page-local color/shape rules.
- Define quiet selected segmented control style so filters do not become repeated primary buttons.

### Today

- Keep one main task anchor.
- Add/align entry to start or continue controlled agent team task only if it directly serves P0.
- Empty/loading/error states should use shared primitives.

### Codex

- Auto-switch status and repair states must clearly explain whether manual intervention is required.
- Healthy states use `success`; active/current selection uses `primary`.
- Account row actions should not create repeated primary CTAs.

### Tokens

- Quota healthy/OAuth success uses `success`.
- Filters/ranges/tabs use quiet selected styling.
- No page-local color branches for account cards or warnings.

### OpenAgents

- P0 only: controlled team collaboration skeleton, shared context, `@member` routing, session/task state, artifact records, runtime/model mapping, safety confirmation chain.
- Reuse existing Muse shell and primitives.
- No visible main navigation for P1 or rejected items.

## Required Evidence In Delivery

Implementation handoff must include:

- Changed files list.
- Routes checked: `/today`, `/codex`, `/tokens`, `/open-agents` or actual OpenAgents route.
- Shell checked: Header, Sidebar, AppLayout.
- Widths checked: 1366, 1024, 390.
- States checked: empty, loading, error, disabled, warning, success.
- Before/after notes for the three closure items.
- Exceptions list with reason and whether each exception is systemic or single-page residual.

## UX Review Output

UX will return one of:

- Pass: all three closure items are closed and no systemic issue remains.
- Partial pass: only single-page residuals remain.
- Return for Fixes: any systemic issue remains or evidence is missing.
