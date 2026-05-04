# OpenAgents P0 Shell UI Notes

This note accompanies `Muse/docs/openagents-p0-shell-preview.html`.

## Scope

Keep UX work inside P0 routes and global Shell only:

- `OpenAgents`: controlled team task surface.
- `Today`: start/continue/review entry points.
- `Codex` / `Tokens`: runtime, model, account, and quota readiness repair paths.
- Global Shell: Header, Sidebar, AppLayout, shared primitives.

No all-site redesign, no page-private business expansion, and no visible navigation for P1 or rejected items.

## Three-Stage Order

1. Shell / primitives.
2. Shared context and record display.
3. Session orchestration and switching confirmation flow.

## Interaction Model

- The first screen has one main task anchor.
- Shared context is a structured thread, not raw logs by default.
- Records and artifacts are separate from chat messages.
- Runtime readiness appears as a repairable blocker, not a competing page.
- `@member` routing is visible but constrained by the controlled team skeleton.

## Visual Rules

- Header stays neutral; no primary badge or page-level emphasis.
- Sidebar active state stays shallow.
- `primary` marks current task, selected route, or main action.
- `success` marks ready, healthy, available, completed.
- `warning` marks fallback, confirmation, ambiguity, retry.
- Rejected capabilities are never given primary CTA treatment.

## Frontend Mapping

- Use existing Muse primitives: `Button`, `Surface`, `StatusTag`, `ControlPanel`, `ControlPage`.
- Do not import reference-project page styles.
- New UI must provide 1366 / 1024 / 390 checks and state coverage notes.
