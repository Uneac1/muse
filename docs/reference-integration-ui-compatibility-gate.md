# Reference Integration UI Compatibility Gate

Scope: any Muse feature imported or adapted from `oh-my-openagent-dev` or `openteams-main`.

This is the UX gate before implementation can be considered compatible with the current Muse global UI baseline.

## Mandatory Compatibility Rules

1. No reference-project visual system is imported as-is.
   - Use Muse `primitives`, `ControlPanel`, `Surface`, `StatusTag`, `Button`, `TextInput`, `SelectInput`, and existing layout rhythm.

2. No new top-level product island.
   - OpenTeams capabilities map to `Agent Workspace` and `Team Library`.
   - oh-my-openagent capabilities map to runtime/orchestration behavior under `Runtime & Providers`.

3. Header and Sidebar remain frame-level.
   - New features may add navigation entries, but may not introduce primary emphasis in Header.
   - Sidebar active state remains shallow and navigation-only.

4. Semantic tones must stay Muse-native.
   - `primary`: current/info/main operation.
   - `success`: healthy/available/completed.
   - `warning`: needs attention/retry/ambiguity.
   - `danger`: blocked/failed/destructive.

5. Page hierarchy must be task-first.
   - Each page has one main task anchor.
   - Raw logs, team config, runtime config, and artifacts are separate panels/states, not one undifferentiated wall.

6. Imported interactions must produce Muse-native outcomes.
   - Inbox item.
   - Memory record.
   - Workspace artifact.
   - Review result.
   - Runtime/provider status.

## Systemic Problem Triggers

Classify as systemic if any of these appear across more than one page or shared component:

- Reference-project styles bypass Muse primitives.
- Multiple primary buttons appear in the same task container.
- Healthy/available states use `primary` instead of `success`.
- Header regains page-level primary emphasis.
- Raw team/runtime config becomes the default user-facing workflow.

## Single-Page Residual Triggers

Classify as single-page residual if confined to one page:

- One panel needs spacing/rhythm adjustment.
- One empty/error/loading state is missing or unclear.
- One imported control has wrong selected/disabled styling.
- One page has a local exception with a documented reason.

## UX Sign-Off Requirement

Every integration PR or handoff must include:

- Affected Muse pages.
- Which reference capability was mapped.
- Which Muse primitive/layout owns the UI.
- Whether the issue is closed, systemic, or single-page residual.
- 1366 / 1024 / 390 visual check result for new user-facing surfaces.
