# Google Design / Material 3 Research Notes

Date: 2026-04-29

## Scope

This pass treats `design.google` as the primary reference and `m3.material.io` as component-detail support. The site is editorial and not every indexed article maps directly to product UI, so the implementation uses a reproducible source inventory and extracts only actionable product-interface principles.

## Source Inventory

- https://design.google/
- https://design.google/library/colors-change
- https://design.google/library/making-material-you
- https://design.google/library/expressive-material-design-google-research
- https://design.google/library/making-motion-meaningful
- https://design.google/library/introducing-resizer
- https://design.google/library/euphrates-dahout-material-design-figma
- https://design.google/library/material-design-eras
- https://design.google/library/absolutely-fab-button
- https://design.google/library/making-more-with-material/
- https://design.google/library/material-design-dark-theme
- https://m3.material.io/

## Principles Applied To Muse

1. Dynamic color is a relationship system, not a single accent swap. Muse keeps seed choices but maps them into primary, secondary, tertiary, error, success, tonal surfaces, and inverse surfaces.
2. Expressive design uses color, shape, size, motion, and containment to make important actions easier to find. Muse raises main actions into filled/FAB/prominent surfaces and lowers secondary actions into tonal, outlined, text, chips, and list rows.
3. Tonal elevation should create hierarchy before heavy shadow. Muse uses `surface-container-lowest` through `surface-container-highest`, with modest shadows only for floating or prominent surfaces.
4. State layers must be present on interactive objects. Muse standardizes hover, focus, pressed, and dragged opacity tokens and applies them to nav rows, buttons, cards, chips, FABs, command controls, and dynamic widgets.
5. Motion explains continuity. Muse uses emphasized easing for page entry, expandable cards, dialog scale, drawer slide, toast lift, and quick state feedback rather than decorative loops.
6. FAB represents the primary action on a screen. Muse keeps FABs for new/execute actions and avoids using them as generic navigation.
7. Responsive UI should be tested across forms. Muse keeps desktop sidebar, mobile drawer behavior, and bottom-navigation previews for compact contexts.
8. Component systems need variants and states. Muse's component deck exposes buttons, cards, slider, switches, chips, dialogs, drawer, snackbar/toast, FAB, bottom nav, and dynamic form feedback in one visible pattern library.

## Implementation Mapping

- Global tokens: `web/src/index.css`
- Theme seed application: `web/src/stores/theme.ts`
- App shell, sidebar, header: `web/src/components/layout/*`
- Material wrappers: `web/src/components/ui/primitives.tsx`
- Dynamic interaction showcase: `web/src/components/md3/DynamicWidgetShowcase.tsx`
- First showcase route: `web/src/pages/Today.tsx`

## Verification Targets

- Build: `npm run build`
- Routes: `/today`, `/dashboard`, `/inbox`, `/accounts`, `/ai`, `/tokens`, `/proxy`, `/newspaper/read`
- Interactions: seed switcher, theme toggle, sidebar collapse, command palette, FAB/dialog/toast, slider/switch/chips, expandable list rows
- Responsive: desktop, tablet, mobile widths
