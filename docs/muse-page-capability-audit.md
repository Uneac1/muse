# Muse Page Capability Audit

Generated: 2026-04-30

This audit tracks existing backend/API capabilities that are not fully surfaced in the current UI. Priority labels:

- P0: current blocking product issues.
- P1: existing capabilities with obvious missing page entry points.
- P2: useful completeness and density improvements.

## P0

### Codex

- Connected: desktop status, activate, rotate, auto-switch check, restore, settings, usage history, token account list.
- Fixed: the 5-hour total now excludes accounts with weekly quota 0 and accounts blocked by OpenAI official refresh rejection.
- Remaining UI follow-up: add a dedicated exclusion drawer listing excluded accounts and exact reasons.

### Newspaper

- Connected: health, briefing, article reader, article insight, briefing insight.
- Fixed: article reader uses SSE at `/newspaper/article/stream`, shows extraction/translation/insight progress, streams paragraphs as they arrive, and uses AI-only translation/insight.
- Fixed: retry/backfill wording is removed from the reader path; content displays as far as extraction reaches.
- Remaining UI follow-up: add source-level drilldown and per-section AI summary cards on the newspaper index.

### AI

- Connected: account CRUD, test connection, diagnostics, model cache, thread list/messages, chat, thread rename/delete, clear account threads.
- Fixed: chat response metadata now surfaces actual account/model/protocol and fallback account when used.
- Remaining UI follow-up: expose bulk account testing, fallback policy editing, and tool/runtime event traces in the main AI page.

## P1

### Proxy

- Existing APIs: proxy CRUD, enable/default/test, proxy-kernel status/download/start/stop/select/test-openai.
- Connected: proxy CRUD/test/default/enabled, kernel status/download/start/stop/source selection, kernel health/recovery status, group/node selector, node switch, OpenAI route probe, and AI proxy plan/apply from `/os/proxies/ai-manage`.
- Remaining UI follow-up: probe history, failover result details, and one-click “recover OpenAI route”.

### Today

- Existing APIs: `/os/workspace`, `/os/search`, `/os/agent/runtime`, `/os/agent/activity`, `/os/agent/memory`, unified inbox/newspaper/integration status via workspace aggregation.
- Connected: Today now presents the page as the AI daily briefing, with the workspace summary/questions/priorities promoted as report content instead of a generic dashboard.
- Remaining UI follow-up: add a real `/os/today/briefing` AI endpoint if the heuristic workspace summary is not enough; surface which memories/rules/news/mail items the AI used for each recommendation.

### Memory & Rules

- Existing APIs: rule CRUD, memory CRUD, AI manage/apply for memory/accounts/proxies/tokens, ingestion get/update/run, agent autonomy/runtime/memory/activity/events/profile/skills.
- Connected: Memory now treats records as AI long-term memory, exposes AI memory plan/apply, memory ingestion run/status, runtime memory totals, and memory compaction.
- Remaining UI follow-up: add profile/skill journal editing, event feed filtering, ingestion config editing, and per-memory provenance.

### Accounts

- Existing APIs: account CRUD, batch delete, import preview/confirm, export, tag assignment, tag CRUD, OpenAI OAuth authorize/launch/reset/result.
- Connected: account CRUD/import/export/tagging, OAuth helper flows, and AI account plan/apply from `/os/accounts/ai-manage`.
- Remaining UI follow-up: bulk issue repair, OAuth result diagnostics, tag management entry, and batch delete review.

### Tokens

- Existing APIs: account CRUD, per-account sync, sync all, auto-sync.
- Connected: account list/dialog, single-account sync, sync all, auto-sync, usage stats, failure information, and AI token plan/apply from `/os/tokens/ai-manage`.
- Remaining UI follow-up: clearer retry/backoff display, provider-blocked filtering, failure kind filters, and batch retry state visualization.

### Ymail

- Existing APIs: connect/sync, address list/create/credential, address mails, delete mail, clear inbox/sent, reset password, delete address.
- Connected: standalone Ymail manager, address create/delete, credential read/copy, address password reset, address inbox, delete mail, clear inbox, clear sent, and unified Inbox source handling for temporary Ymail mail.
- Remaining UI follow-up: temporary inbox bulk actions, sent/inbox split filters inside the standalone page, and richer source chips inside the message viewer.

### Integrations

- Existing APIs: GitHub, Linux.do, Cloudflare, Notion, MiSub, Ymail connect/sync/disconnect; Notion content read/update; MiSub AI analysis/inspection.
- Connected: GitHub/Linux.do/Cloudflare/Notion/MiSub/Ymail connect-sync-disconnect flows, Notion content/block editing, MiSub subscription/profile/settings editing, and MiSub AI analysis/inspection controls.
- Remaining UI follow-up: consistent integration health summary, shared stale-cache indicators, and unified error/event history.

### AI Studio

- Existing APIs: AI account diagnostics, account CRUD/test, thread list/messages, rename/delete/clear, chat with response metadata.
- Connected: core account pool, diagnostics, model cache, chat response metadata, thread rename/delete/clear.
- UI gaps: bulk testing, fallback policy editing, per-provider preset quality pass, route/tool event traces, MiMo-specific quick-add surface.

## P2

### Dashboard

- Connected: dashboard stats and OS workspace.
- Gaps: more direct action buttons to resolve account/proxy/token incidents, clearer stale-data indicators.

### Accounts / Inbox

- Connected: account CRUD/import/export/tagging, unified inbox, cached/search/recent/send/clear.
- Connected: Inbox now treats Ymail temporary messages as first-class mail through `source`, `mailboxType`, `ymail:` ids, and temporary account ids; it also links directly to Ymail management.
- Gaps: add bulk mailbox actions and clearer source chips in mail dialogs.

### Subscriptions / OpenTeams

- Connected: MiSub subscription/profile/settings management, MiSub AI analysis/inspection, and OpenTeams start/stop/status.
- Gaps: operational logs, one-click diagnosis, and clearer external process state for OpenTeams.

## Implementation Defaults

- Prefer wiring existing APIs before adding new backend capabilities.
- Add new endpoints only when the current API shape cannot support the UI, as with newspaper SSE progress.
- Do not show fake AI output. If AI is unavailable, show the failure state and the action needed to recover.
- Work page by page from routes in `web/src/App.tsx`, and for each route compare the page against route files in `server/src/routes`.
- When a page is not the right home for a backend capability, add a clear cross-link instead of burying the capability.

## Next Wiring Queue

1. AI Studio: add bulk account testing, fallback policy editing and runtime event trace surface.
2. Dashboard: add direct incident action buttons and stale-data indicators using existing workspace/status data.
3. OpenTeams: add operational log visibility and clearer external process diagnostics if backend state exposes it.
4. Inbox/Ymail: add bulk temporary-mail actions and richer source chips in the mail viewer.
5. Integrations: add a shared health summary across GitHub/Cloudflare/Notion/MiSub/Ymail/Linux.do.
6. Codex: add excluded-account drawer with exact quota exclusion reasons.
