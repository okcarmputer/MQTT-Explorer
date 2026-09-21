# EXPLORER-004 — Standardize device headers

**Status:** Done — 2026-09-04
**Implemented together with:** EXPLORER-007 (same component)

## Objective

Every device dashboard gets the same header:

```
[← Back]
DEVICE TITLE
DEVICE/SITE IDENTIFIER
```

Title larger, uppercase, top-left, below the back button. Identifier uppercase
below the title, visually subordinate.

## Before

Each detail page hand-rolled its own header: an inline `<button>` above an `<h2>`
using `justify-content: space-between` — identifier on the **left**, description
on the far **right**. The two halves read as unrelated, and there was no hierarchy
between "which device" and "which unit".

```
Serial: 19MIS24848                              203 Saluda 3
```

## After

`app/src/dashboard/DeviceHeader.tsx` — one shared component.

```
← BACK
203 SALUDA 3 — SALUDA LAKE PS 3
19MIS24848
```

Title parts per device type, from existing payload fields (no duplicated data):

| Device type | Title | Source |
| --- | --- | --- |
| Pump station | Description — Location | `summary.unitStatus['Description']`, `['Location']` |
| Flow monitor | Location — Site Name | `siteLocation`, `siteName` |

Identifier is `deviceKey` (serial for pump stations, site ID for flow monitors).

Empty/missing title parts are dropped rather than leaving a dangling em dash, so
a station that publishes only a Description still renders a clean single-part title.

## Styling

`.cmom-device-header__title` — 24px, 700, uppercase, monospace, `--cmom-text-primary`.
`.cmom-device-header__identifier` — 13px, 600, uppercase, `0.1em` tracking,
`--cmom-text-muted`. Title drops to 18px under 720px viewport width.

## Acceptance criteria

- [x] Title is larger, uppercase, top-left, below the back button.
- [x] Identifier uppercase, below the title, visually subordinate.
- [x] Pump station title = Description + Location.
- [x] Flow monitor title = Location + Site Name.
- [x] Uses existing data fields; no duplicate data created.
- [x] Shared component, not per-page duplication.
- [x] Visual verification, **pump station** — confirmed against the live broker
      2026-09-04 via `yarn build && yarn start`.
- [ ] Visual verification, **flow monitor** — not yet checked. The title field
      order differs there (Location — Site Name), so it needs its own look.
