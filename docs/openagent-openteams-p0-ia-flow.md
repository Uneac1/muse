# OpenAgent / OpenTeams Integration P0 IA And User Flow

Scope: integrate capabilities from:

- `C:\Users\1\Desktop\muse\参考项目\oh-my-openagent-dev`
- `C:\Users\1\Desktop\muse\参考项目\openteams-main`

UX goal: do not copy both products into Muse as separate feature islands. Convert them into one Muse-native "Agent Workspace" layer that supports planning, team execution, runtime routing, and review.

## Product Placement

## Architecture-Aligned Integration Boundary

Adopt the architecture split:

- Keep from `oh-my-openagent-dev`: global visual language references, Shell layout ideas, design primitives direction, and reusable interaction patterns.
- Keep from `openteams-main`: group collaboration concept, shared context, and shared record abstractions.
- Rewrite: session state machines, switching rules, permission checks, audit chains, backend API contracts, and Muse-bound page implementations for `/today`, `/codex`, and `/tokens`.
- Adapt: component organization, message display patterns, and collaboration information structure after trimming them into Muse shared primitives.
- Drop: page-private logic, repository scaffolding, release pipelines, and non-P0 peripheral modules.

UX output boundary for P0:

- Global Shell pattern.
- Shared primitives usage.
- P0 routes and navigation.
- Shared context / records display.
- Session orchestration and switching confirmation flow shape.

UX does not need to cover the entire imported repositories or non-P0 pages before the first integration pass.

Product-confirmed P0 feature scope:

- Controlled team collaboration skeleton.
- Shared context.
- `@member` routing.
- Session / task state.
- Artifact records.
- Runtime / model capability mapping.
- Safety confirmation chain.

Out of P0:

- One-by-one navigation entries for reference project modules.
- Full reference-project feature parity.
- Non-essential peripheral modules.

P1 evaluation candidates:

- Team presets.
- Skill library import.
- Parallel execution view.
- File-change review.
- LSP / AST assistance.
- Hash edit validation.

Rejected for integration:

- Full UI copy from reference projects.
- Infinite autonomous loop enabled by default.
- External networking / MCP / telemetry enabled by default.
- Plaintext token migration.

Migration order:

1. Shell / primitives.
2. Shared context and record display.
3. Session orchestration and switching confirmation flow.

### What OpenTeams contributes

- Shared group-chat context.
- Multi-agent team presets and members.
- `@member` directed collaboration.
- Parallel execution.
- Team guidelines and workflow coordination.
- Skill library and local workspace artifacts.

### What oh-my-openagent contributes

- Agent/runtime orchestration patterns.
- Model/provider routing and capability matching.
- Built-in role agents and dynamic prompts.
- Skills, hooks, tools, MCP, and runtime fallback.
- Background task / circuit breaker / automation patterns.

### Muse-native interpretation

OpenTeams becomes the collaboration surface.  
oh-my-openagent becomes the runtime and orchestration engine layer.  
Muse owns the user journey, navigation, status, memory, inbox, account health, and review loop.

## Recommended Navigation

Do not add "OpenTeams" and "OpenAgent" as two top-level nav items.

P0 should reuse current Muse context:

```text
Today
OpenAgents
Codex
Tokens
```

P0 surface mapping:

1. Existing `OpenAgents`
   - Primary surface for controlled team collaboration.
   - Combines shared session, task brief, members, progress, artifacts, and review.
   - May contain internal tabs/panels, but not new top-level navigation for P1 features.

2. Existing `Today`
   - Entry point for "start/continue agent team task" when a high-priority task needs multi-agent help.
   - Shows status and review needs, not raw team configuration.

3. Existing `Codex` / `Tokens`
   - Runtime, model, account, and quota readiness surfaces.
   - They provide repair paths for blockers; they do not become team workflow pages.

P1 candidates stay hidden from primary navigation:

- Team presets.
- Skill library import.
- Parallel execution view.
- File-change review.
- LSP / AST assistance.
- Hash edit validation.

Existing pages affected:

- `Today`: surface "start with team" for high-priority work.
- `Inbox`: receive agent output needing human decision.
- `Memory`: retain team guidelines, task decisions, and accepted artifacts.
- `Codex` / `Tokens`: remain account and quota control surfaces, not team workflow pages.
- `OpenAgents`: becomes the P0 collaboration workspace.

## P0 User Path 1: Start A Team Task

Entry:

- `Today` high-priority action.
- `OpenAgents` primary CTA.
- Command palette action: "Start agent team task".

Flow:

1. User enters task brief.
2. User selects a controlled Muse team mode or "default collaboration skeleton".
3. Muse shows members, roles, runtime availability, and expected workspace.
4. User confirms workspace and run mode:
   - "Plan first"
   - "Run now"
5. Muse starts shared session.
6. User sees live team thread, member statuses, current blockers, and artifacts.
7. Completed artifacts go to review panel.
8. Accepted output can be sent to Inbox, Memory, PR/workspace artifact, or copied into current task.

P0 UI requirement:

- One main task anchor: "Start / Continue this team task".
- Team/member details stay secondary until execution starts.
- Runtime failures are warning/danger states, not hidden logs.

## P0 User Path 2: Import Or Build A Team

Status: not P0 as a standalone navigation path.

P0 replacement:

- Provide a minimal team/member confirmation panel inside `OpenAgents`.
- Use a fixed default team or product-approved controlled skeleton.
- Do not expose preset import, skill assignment, or full team builder in P0.

P0 UI requirement:

- Show the human-readable team contract before run.
- `@member` routing must be visible and constrained.
- Raw OpenTeams configuration stays hidden.

## P0 User Path 3: Runtime Readiness Check

Entry:

- Blocking state inside `OpenAgents`.
- Existing `Codex` / `Tokens` pages.

Flow:

1. Muse lists required runtimes for the selected team.
2. User sees status:
   - Ready.
   - Needs credential.
   - Missing CLI/runtime.
   - Quota or account issue.
3. User fixes provider/account/runtime.
4. User runs a readiness check.
5. Muse returns to OpenAgents when all required roles are runnable.

P0 UI requirement:

- `success`: runtime ready, quota healthy, account available.
- `warning`: missing optional runtime, quota low, fallback available.
- `danger`: required runtime unavailable, credential invalid, no fallback.
- Do not make runtime setup a competing main page when the user is in a task; show it as an inline blocker with a repair path.

## P0 User Path 4: Review Team Output

Entry:

- OpenAgents run completion.
- Inbox item.
- Today "needs review" item.

Flow:

1. User opens completed run.
2. Muse shows:
   - Final answer.
   - Artifacts changed.
   - Decisions made.
   - Open blockers.
   - Test/validation status.
3. User chooses:
   - Accept.
   - Ask follow-up.
   - Send to another team/member.
   - Save to Memory.
   - Create Inbox follow-up.

P0 UI requirement:

- Review is a separate panel/state, not mixed into raw chat.
- Artifacts and decisions must be scannable before raw logs.
- Re-run or follow-up actions are secondary unless the result failed.

## Navigation Priority

P0 sidebar:

```text
Existing entries only:
  Today
  OpenAgents
  Codex
  Tokens
```

Optional P0 addition:

```text
Command palette action:
  Start agent team task
```

Recommendation: do not add visible main navigation for P1 or rejected items. If a new visible entry is unavoidable, it must serve the P0 start/continue/review path only.

## What Not To Do

- Do not expose both reference products as top-level pages.
- Do not add Team Library / Skill Library / Parallel View as visible main nav in P0.
- Do not force users to understand OpenTeams vs OpenAgent before starting a task.
- Do not create separate credential stores for these integrations if Muse already has AI/Codex/Token account management.
- Do not put raw team config, raw runtime config, and live chat in one undifferentiated page.
- Do not move global UI completion criteria; this integration still must obey Header demotion, semantic tones, and primitives reuse.

## P0 Acceptance Criteria

- A user can start a team task from `Agent Workspace`.
- A user can choose/import a team preset without editing raw JSON.
- A user can see runtime readiness before running.
- A user can watch progress and review output from one place.
- Team output creates Muse-native artifacts: Inbox item, Memory record, file/workspace artifact, or review result.
- Navigation adds at most two new visible entries for first release: `Agent Workspace` and `Team Library`.
