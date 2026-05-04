# Global UI Completion Review Checklist

## Scope

This checklist is the UX/product review gate for global UI completion. It must be applied at the global layer first, then checked across `/today`, `/codex`, and `/tokens`.

## Completion Rule

Global UI can move to completion only when all three closure conditions are proven across shared primitives, Shell, Header, Sidebar, and the P0 pages:

1. Header no longer competes with page content for primary attention.
2. `primary` and `success` semantics are constrained to their intended meaning.
3. Page-specific styling is recovered into shared primitives or explicitly documented as a justified exception.

Any remaining issue must be labeled as `systemic issue` or `single-page leftover`. Systemic issues keep the result as Return for Fixes.

## Shared Primitives

Must be complete:

- Button variants: `primary`, `secondary`, `ghost`, `danger`, `success`, `warning`, disabled, loading.
- Badge/status variants: neutral, info, warning, danger, success, running, blocked, cooldown.
- Empty, loading, error, warning, success, disabled, and blocked states.
- Card/panel/list/table shells used by `/today`, `/codex`, and `/tokens`.
- Form inputs, selects, toggles, segmented controls, and confirmation controls.
- Toast/inline feedback rules with clear severity mapping.
- Responsive spacing and density tokens for 1366, 1024, and 390 widths.

Fail if:

- A P0 page defines one-off button/status/card styling that duplicates primitive behavior.
- Success color is used for generic health, decoration, or positive emphasis without an actual successful action/result.
- Primary styling is used for passive labels, metrics, decorative badges, or non-primary actions.

## Shell, Header, Sidebar

Must be complete:

- Header is a utility/status layer, not the main visual focus.
- Header primary actions are limited to one real top-level action per context.
- Live/running/session/account indicators use subdued status treatment unless action is required.
- Sidebar owns navigation hierarchy and active route clarity.
- AppLayout sets consistent content max width, gutters, scroll behavior, and page header spacing.
- Global account/session/model status does not force users into manual intervention unless identity ambiguity or safety confirmation applies.

Fail if:

- Header badges, gradients, oversized controls, or strong colors overpower page content.
- Sidebar and page tabs create competing navigation for the same hierarchy.
- Account switching presents manual account change as the default fallback for low quota or unavailable accounts.

## P0 Pages

### `/today`

Must prove:

- Uses shared page header, panels, lists, buttons, badges, empty/loading/error states.
- Task/session status uses neutral or warning semantics unless an action has successfully completed.
- Primary action is limited to the next main user action.

### `/codex`

Must prove:

- Codex account/session states map to shared status primitives.
- Auto-switch states are visible: switching, success, identity ambiguity, no qualified candidate, cooldown, retry limit reached.
- Manual user intervention appears only for identity ambiguity or safety confirmation.

### `/tokens`

Must prove:

- Token capacity, quota, provider, and warning states use consistent status semantics.
- Low quota or unavailable account routes into automatic recovery where possible, not a manual-switch default.
- Success is only used after a real token/account/provider operation completes.

## Responsive And State Evidence

Frontend delivery must include evidence for:

- Widths: 1366, 1024, 390.
- States: empty, loading, error, disabled, warning, success.
- Routes: `/today`, `/codex`, `/tokens`.
- Global areas: Shell, Header, Sidebar, primitives.
- Exceptions: file path, reason, impact, and whether it is systemic or single-page.

## UX Review Result

Use one of:

- Pass: all global conditions are closed; only documented non-systemic exceptions remain.
- Partial pass: most conditions are closed, but one or more single-page leftovers remain.
- Return for Fixes: any systemic issue remains, or evidence is missing for shared primitives, Shell/Header/Sidebar, or P0 page states.
