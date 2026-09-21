# Anomaly Detection — MQTT Explorer workspace

Planning and documentation for the MQTT Explorer dashboarding work. No
application source lives here; the app is under `app/src/`.

MQTT Explorer is a **visual MQTT data explorer**. It portrays values delivered
by the MQTT system. It does not detect, score, or classify anomalies.

## Contents

- `PROJECT_MEMORY.md` — architecture, design system, decision log. **Read first.**
- `tickets/` — one file per ticket, with status and acceptance criteria.
- `plans/` — master implementation plan and dependency order.
- `screenshots/before/`, `screenshots/after/` — visual comparison.

## Status board

| Ticket | Title | Status |
| --- | --- | --- |
| EXPLORER-001 | Modernize topic explorer | **Blocked** — needs a decision, see ticket |
| EXPLORER-002 | Global dark mode | **Done** — needs a look |
| EXPLORER-003 | Remove About MQTT Explorer | **Done & verified** |
| EXPLORER-004 | Standardize device headers | **Done** — pump station verified; flow monitor not |
| EXPLORER-005 | Modern filter controls | **Done** — needs a look |
| EXPLORER-006 | Adjustable card layout | Pre-existing (PanelGrid); drag/resize retained |
| EXPLORER-007 | Compact back button | **Done** — pump station verified; 4 pages still inline |
| EXPLORER-008 | Live wet-well sync | **Fixed** — needs a look |
| EXPLORER-009 | Standardize dashboard grid | Covered for pump stations by 010-012; flow monitor untouched |
| EXPLORER-010 | Pump layout, 1 analog | **Done** — needs a look |
| EXPLORER-011 | Pump layout, 2 analog | **Done** — needs a look |
| EXPLORER-012 | Pump layout, 3 analog | **Done** — needs a look |
| EXPLORER-013 | Pump layout stability (jitter) | **Fixed** — needs a look |
| EXPLORER-014 | Performance | Partly addressed via 013; no profiling done |
| BACKEND-001 | MessageHistoryStore flush RangeError | Open — pre-existing, not dashboard work |

## Build & run (Windows)

```bash
yarn build
yarn start
```

`yarn build` (`tsc && cd app && yarn run build`) takes ~45s with a warm
`app/.webpack-cache`. `yarn start` launches Electron. This is the working loop —
build, then start; there is no watch server in play.

**Do not use `yarn dev`.** It is broken on Windows: `app/package.json`'s `dev`
script invokes `node_modules/.bin/webpack-dev-server` as a Unix path, which cmd
cannot execute, so `dev:app` exits 1 and `npm-run-all --parallel` tears down its
siblings. Running the browser dev server directly also failed — it did not finish
its first compile in 55 minutes (root cause unknown; ruled out type-checking,
minification, and slow devtool). Neither is worth debugging unless browser mode
becomes a requirement.

## Verification bar

A ticket is done when its acceptance criteria are checked, the files it touched
typecheck clean, and `yarn test:app` shows no *new* failures against the baseline
recorded in `PROJECT_MEMORY.md`.
