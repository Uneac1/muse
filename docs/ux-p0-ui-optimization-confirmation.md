# UX P0 UI Optimization Confirmation

Scope: Header, Sidebar, shared control primitives, Today, Codex, and Token as the current P0/P1 high-frequency surface set from product direction.

## Overall Confirmation

Status: partial pass, not full acceptance.

The implementation improves the global UI baseline: shared primitives exist, `primary` / `success` are separated, responsive Header/Sidebar container behavior is present, and the main pages include loading, empty, error, disabled, warning, and retry-protection states. It does not yet fully satisfy the global UI optimization target because Header still carries primary emphasis, dense page controls still overuse primary selected states, and several page-level styles remain outside shared primitives.

## Visual Consistency

- Header: partial. Search, AI, menu, and theme controls are quiet tool entries, but route eyebrow and Live chip still use primary styling and compete with page-level focus.
- Sidebar: pass. Navigation active state is demoted to shallow background/text color, without primary-button treatment.
- Shared primitives: pass for the core `primary` / `success` split. `StatusTag`, `Surface`, `toneTextClass`, and CSS success tokens are in place.
- Today: mostly pass. It has a single visible main focus area and shared control layout.
- Codex: mostly pass. It has a primary task panel and warning states for ambiguity / retry protection, but account-list actions repeat primary CTAs.
- Token: partial. It uses shared primitives and success quota tones, but dense tabs/ranges/grouping controls still create too many primary emphasis points.

## Responsive Behavior

- Header: pass in structure. Container rules switch compact / fluid search and AI controls at `720px` and `1040px`.
- Sidebar: pass in structure. Mobile overlay and compact sidebar behavior are implemented; labels and dock are controlled by container width.
- Today: pass in structure. Grids collapse from multi-column to single-column layouts, with loading skeletons and empty panels.
- Codex: partial pass. Layout uses responsive grids, but account rows contain `lg:min-w-[520px]`, which should be visually checked on narrow tablets.
- Token: partial pass. Account grids collapse, but detail filters and grouping controls may still become dense on 390px due to nested flex controls.

## Empty / Loading / Error / Disabled States

- Today: pass. Loading skeleton, fatal error panel, and empty panels are present.
- Codex: partial pass. Loading skeleton, empty account pool, ambiguity warning, retry-protection warning, disabled buttons, and toast errors are present. Missing inline full-page error fallback when status/history load fails and `state` remains unavailable.
- Token: mostly pass. Loading skeleton, empty account list, empty detail, empty balance cards, empty usage sections, disabled buttons, and toast errors are present.
- Shared controls: pass. Disabled opacity/pointer rules and focus-visible ring exist.

## Remaining P0 Follow-Up

1. Demote Header eyebrow and Live chip to neutral frame styling.
2. Reduce repeated `primary` controls in Codex account rows and Token filters; selected segmented states should not read like multiple main actions.
3. Convert healthy Codex local states such as existing `auth.json` and retained `sessions` from `primary` text to `success`.
4. Browser-check 390px and 1024px for Codex account rows and Token detail filters before acceptance.
