# Muse Frontend UI Spec

Generated from a traversal of `C:\Users\1\Desktop\muse`, with emphasis on:

- `Muse/web/src` as the live product surface
- `.stitch/DESIGN.md` as the active Stitch direction
- `参考项目/DESIGN-apple.md`
- `参考项目/DESIGN-claude.md`
- `参考项目/DESIGN-spotify.md`
- root `README.md` and `readme.txt`

This spec is the source of truth for future Stitch generation and Figma system work.

## 1. Product Definition

Muse is not a landing page and not a generic admin dashboard. It is a personal operations cockpit for:

- account and subscription management
- unified inbox and mailbox handling
- token and proxy capacity management
- memory and entity tracking
- rules, agents, and integration health

The product should feel like a logged-in operator workspace for a single power user who scans quickly, resolves exceptions, and jumps between related tools all day.

## 2. Source Synthesis

### 2.1 Muse Codebase Signals

Current routes show three UI families already emerging:

- command-center pages: `Today`, `Dashboard`
- operational list/detail pages: `Inbox`, `Rules`, `Accounts`, `Tokens`
- integration managers: `GitHub`, `Cloudflare`, `Notion`, `Linux.do`, `Ymail`, `OpenTeams`

The codebase already favors:

- fixed sidebar + sticky header shell
- compact operational panels
- metric strips
- dense but readable text
- realistic product copy instead of placeholder marketing language

### 2.2 Apple Reference

Keep from Apple:

- white and off-white workspace baseline
- near-black ink
- hairline dividers
- restrained shadows
- blue as the decisive action color
- disciplined spacing and chrome that stays out of the way

Do not import:

- marketing hero composition
- oversized photography-first sections
- product-advertising layouts

### 2.3 Claude Reference

Keep from Claude:

- warm neutral canvas
- clear, useful, human product writing
- calm operational explanation style
- dark code or runtime surfaces only where they carry real product information
- sparse coral emphasis for warnings, memory, or editorial callouts

Do not import:

- big editorial hero bands
- brand-heavy serif marketing layout

### 2.4 Spotify Reference

Keep from Spotify:

- persistent navigation
- dense scanning rhythm
- compact queues and list ergonomics
- strong active state
- touchable pill controls where appropriate

Do not import:

- dark default theme
- green-led branding
- entertainment-style immersion

## 3. Product Shape

### 3.1 Core Information Architecture

The app shell should remain:

- left sidebar: workspace areas, runtime tools, integrations
- top header: page title, command search, quick actions, sync/runtime status
- main canvas: operational page content

### 3.2 Page Priority Tiers

Tier 1 pages:

- Today
- Dashboard
- Inbox
- Rules
- Memory
- Accounts

Tier 2 pages:

- Tokens
- Proxy
- Subscriptions
- Entities

Tier 3 pages:

- GitHub
- Cloudflare
- Notion
- Linux.do
- Ymail
- OpenTeams
- Newspaper

## 4. Visual System

### 4.1 Theme Direction

Default theme is light. The background must be white or warm off-white, never deep gray or neon-dark by default.

Allowed dark surfaces:

- logs
- code output
- runtime preview
- terminal-like diagnostics

### 4.2 Color Tokens

Primary palette:

- canvas: `#FCF8FB`
- surface: `#FFFFFF`
- muted surface: `#F5F5F7`
- hairline: `#E5E5EA`
- main ink: `#1B1B1D`
- secondary ink: `#6E6E73`
- command blue: `#0071E3`
- command blue pressed: `#0059B5`

Semantic palette:

- success: `#178A4A`
- warning: `#D97757`
- accent amber: `#D4A017`
- error: `#BA1A1A`
- info teal: `#2E8C9E`

Usage rules:

- blue is for primary actions, focused states, active nav, selected chips
- coral is rare and only for warnings, exception summaries, or memory highlights
- semantic colors must never replace labels; they support text, not substitute it

### 4.3 Typography

Use the current product-safe system:

- display/body family: `Inter`
- code family: `JetBrains Mono`

Sizing rules:

- page title: `32px` to `40px`, semibold
- section title: `18px` to `20px`
- body: `14px` to `16px`
- metadata: `12px` to `13px`
- micro labels: `11px` uppercase with `0.05em` to `0.08em` tracking

Typography constraints:

- no hero-scale type inside workspace panels
- no negative tracking except very slight display tightening
- labels stay short and scan-friendly

### 4.4 Shape and Depth

- default radius: `8px`
- large panel radius: `10px`
- compact chip/button radius: `9999px` only when the control is intentionally pill-shaped
- borders are thin and neutral
- shadows are subtle and mostly reserved for overlays, menus, and dialogs

Avoid:

- nested cards inside cards
- floating section cards as page-wide wrappers
- gradient blobs
- glossy neon treatment

## 5. Layout Rules

### 5.1 Shell

- sidebar stays fixed
- header stays sticky
- main content scrolls independently
- layouts should remain stable under loading and refresh states

### 5.2 Page Rhythm

Default page rhythm:

1. compact page header
2. metric strip or health cards
3. two-column or twelve-column operational work area
4. list/detail or queue panels
5. logs, timeline, or secondary signals near the bottom

### 5.3 Density

Muse should be dense, but not cramped:

- use compact spacing and strong grouping
- prefer multiple medium panels over a single oversized hero block
- keep actionable content above decorative content at all times

## 6. Component System

### 6.1 Navigation

- left nav item height should be compact and repeatable
- active state uses subtle blue tint plus strong label contrast
- icons come from lucide
- nav labels remain short

### 6.2 Header

Header contains:

- page title context
- command search
- sync or refresh control
- lightweight runtime or health indicator

Header should not contain:

- marketing taglines
- oversized breadcrumbs
- multi-row clutter

### 6.3 Cards and Panels

Use panels only for:

- metric clusters
- list modules
- queue modules
- forms
- runtime surfaces

Panel anatomy:

- eyebrow label
- title
- compact meta
- optional action slot
- dense body

### 6.4 Lists

List items should be edge-to-edge or nearly edge-to-edge inside the panel:

- clear headline
- concise metadata row
- preview or explanation
- explicit action affordance only when useful

### 6.5 Forms

Forms should be split by task:

- list on the left
- editor or detail in the center
- context or execution history on the right when needed

Use:

- labels above fields
- compact field heights
- JSON or code areas only where the task genuinely needs them

### 6.6 Status

Status expression order:

1. label
2. count or value
3. semantic color
4. optional icon

Do not communicate status with color alone.

## 7. Page Archetypes

### 7.1 Today

Purpose:

- answer what the operator should do now

Required blocks:

- focus summary
- immediate queue
- risk panel
- memory or signal timeline
- quick links into Inbox, Memory, Entities, Newspaper

### 7.2 Dashboard

Purpose:

- show platform health and throughput

Required blocks:

- command search + sync
- runtime health cards
- priority action queue
- mail triage
- token/proxy/integration health
- operational logs

### 7.3 Inbox

Purpose:

- unified mail reading and triage surface

Required blocks:

- compact top summary
- chronological mail list
- preview lines
- expandable body
- account and mailbox metadata

### 7.4 Rules

Purpose:

- define what enters Today, Inbox, Alert, and follow-up systems

Required blocks:

- left list of rules
- central editor
- right detail or run history
- compact rule metrics above

### 7.5 Integration Managers

Purpose:

- operate one external platform without breaking shell consistency

Required blocks:

- status summary
- account table or item list
- actions and diagnostics
- recent events or sync history

## 8. Interaction Rules

- Search should filter visible work, not navigate to marketing-style search results.
- Sync buttons need a loading state and updated timestamp.
- Queues should support completion, acknowledgement, or dismiss actions.
- Long previews should expand inline.
- Logs should support compact and expanded modes.
- Empty states should explain what is missing and what the next action is.
- Loading states should preserve layout footprint.

## 9. Content Rules

- Use realistic operational copy for mail, tokens, accounts, memory, integrations, and runtime.
- Keep Chinese labels where the workflow is already Chinese.
- Short English labels are acceptable for technical scan points like `Sync`, `Live`, `Runtime`, `Queue`.
- Never describe the UI itself inside the UI.

## 10. Stitch Generation Rules

### 10.1 Active Stitch Baseline

Use Stitch project `5595740735556504905` as the Muse workspace generation base.

Current reference screen:

- screen `343353a595cd4f91b424210b6f5e79e5`
- design asset `497f7afe29e048bfbb11208eb97b1a51`

### 10.2 Stitch Prompt Formula

Every Muse page prompt should include:

- product identity: dense authenticated operations workspace
- shell identity: fixed left sidebar + sticky utility header
- visual identity: warm white, white surfaces, near-black ink, blue actions
- writing identity: concise operational copy, realistic data
- anti-patterns: no landing page, no dark default, no decorative blobs, no oversized hero

### 10.3 Page Prompt Seeds

Today prompt seed:

> Generate a Muse Today page for a personal operations cockpit. Use a fixed left navigation, sticky utility header, warm white canvas, white operational panels, blue primary actions, and compact dense scanning. The first screen should answer what needs attention now through a focus summary, priority queue, risk panel, memory signals, and quick workspace links. Use realistic Chinese operational labels with short English metadata where useful.

Inbox prompt seed:

> Generate a Muse Inbox page as a unified mail reading workspace inside the same app shell. Keep the light warm-white system, dense mail list ergonomics, compact top summary cards, chronological message rows, sender/account/mailbox metadata, expandable preview behavior, and explicit refresh state. Avoid marketing layout and avoid oversized cards.

Rules prompt seed:

> Generate a Muse Rules page for managing operational routing logic. Use a three-zone workspace: left rule list, center rule editor, right detail or execution context. Keep compact metrics at the top, thin borders, white surfaces, blue active states, and realistic JSON/config editing affordances. The page must feel like a production operator tool, not a no-code landing page.

## 11. Figma Sync Rules

If Figma MCP is connected later, this file should drive:

- variables for color, spacing, radius, typography
- app shell foundation page
- component pages for nav, header, panel, metric, list row, status tag, form controls
- screen pages for Today, Dashboard, Inbox, Rules, and one integration manager

Figma naming:

- `color/bg/canvas`
- `color/bg/surface`
- `color/text/primary`
- `color/text/secondary`
- `color/action/primary`
- `spacing/xs` `spacing/sm` `spacing/md` `spacing/lg`
- `radius/sm` `radius/md` `radius/lg`

## 12. Non-Negotiables

- default is light
- Muse is an app workspace, never a promo site
- density beats decoration
- hierarchy comes from layout and copy, not giant type
- logs and code may be dark, the app shell may not default dark
- interaction states must be visible and deterministic
