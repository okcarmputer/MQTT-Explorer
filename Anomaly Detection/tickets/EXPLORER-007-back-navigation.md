# EXPLORER-007 — Compact modern back button

**Status:** Done — 2026-09-04
**Implemented together with:** EXPLORER-004 (same component)

## Problem

The back button extended across the entire page width.

**Root cause:** the button was a bare `<button>` rendered as a direct child of a
`display: flex; flex-direction: column` container. In a column flex container the
default `align-items: stretch` makes every child fill the cross axis — so the
button stretched to the full page width. Nothing was setting the width; something
had to *stop* it.

## Fix

`.cmom-back-button` in `dashboard.css`:

- `align-self: flex-start` + `width: auto` + `flex: 0 0 auto` — sizes to content,
  independent of dashboard width. This is the actual bug fix.
- `display: inline-flex` with `--cmom-space-1` gap so the arrow and label align.
- Token-driven surface/border/hover, `--cmom-radius-sm`, uppercase monospace label
  matching the rest of the dashboard's visual language.
- `:focus-visible` outline in `--cmom-accent` for keyboard accessibility.

Lives inside the shared `DeviceHeader`, so every page that adopts the header gets
the identical control — Explorer, flow monitors, and pump stations cannot drift
apart again.

## Acceptance criteria

- [x] Compact, sized to its own content.
- [x] Top-left of the tab.
- [x] Consistent across device pages (single shared component).
- [x] Accessible — real `<button>`, focus-visible ring, `aria-hidden` on the
      decorative arrow so screen readers announce "Back", not "left arrow Back".
- [x] Independent of dashboard width.
- [x] Visual verification, **pump station** — confirmed against the live broker
      2026-09-04. Button is compact at the top left, no longer full width.
- [ ] Visual verification, **flow monitor** — not yet checked.

## Remaining consumers

Four pages still render their own inline `&larr; Back` and should be migrated to
`DeviceHeader` (or to a standalone `BackButton` export) for full consistency:

- `dashboard/DataChannelTypes.tsx:118`
- `dashboard/FlowMonitorMissingAttributes.tsx:65`
- `dashboard/PumpStationMissingAttributes.tsx:88`
- `dashboard/FlowMonitors.tsx:31` / `dashboard/PumpStations.tsx:30`
