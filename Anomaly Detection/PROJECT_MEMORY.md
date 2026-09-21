# PROJECT MEMORY — MQTT Explorer

Permanent record of architectural and UI decisions. Read before implementation
work; update whenever a significant decision is made. Do not silently reverse
anything documented here.

---

## Critical boundary

**MQTT Explorer performs no anomaly detection.** It consumes MQTT payloads,
interprets them enough to display them, and portrays the values. It does not
score, threshold, classify, or judge them. Severity styling that already exists
(`config.ts` `severityColors`, `SeverityBadge`) renders a severity *supplied by
the payload* — it does not compute one.

---

## Architecture (as discovered, Phase 0)

- **Framework:** React + Redux (immutable `Record` state) + MUI v5 + `@mui/styles`
  `withStyles`. Bundled with webpack. Runs as Electron app, browser app, and server.
- **Entry:** `app/src/components/App.tsx` → `HashRouter` → lazy `DashboardTabs`.
- **Routing:** `react-router-dom` hash routes. `DashboardTabs.tsx` owns the tab shell
  and wraps dashboard content in `<div className="cmom-dashboard">`, which is the
  scope all design tokens live under.
- **MQTT data model:** `backend/src/Model` `TreeNode` graph. Nodes expose `edges`
  (named children) and `onEdgesChange` (subscribe/unsubscribe). `logger.py` publishes
  every UnitStatus / DigitalInput / AnalogInput field as its **own leaf topic**
  (see `pumpStationLeaf.ts`), so there is no single group-level JSON message to
  subscribe to — group reads are assembled by `readGroupFields()` and refreshed by a
  2s poll plus `onEdgesChange`.
- **Dashboard state:** mostly local component state + hooks (`usePumpStationSummary`,
  `useSqlWetWellInfo`, `useFlowMeasurements`, …). A small Zustand-style store exists at
  `dashboard/store/mqttStore.ts` with `MqttStoreSync.tsx`.
- **Two data sources per device page:** live MQTT (tree nodes) and direct SQL Server
  reads (`OPCAudit_Live`, via the `useSql*` hooks). Where both supply the same
  quantity, precedence matters — see the wet-well decision below.

## UI architecture

| Concern | Component |
| --- | --- |
| Tab shell | `dashboard/DashboardTabs.tsx` |
| Left nav | `dashboard/Sidebar.tsx` |
| Top bar / connection | `dashboard/TopBar.tsx` |
| **Device page header + back** | **`dashboard/DeviceHeader.tsx`** (shared) |
| Card grid | `dashboard/widgets/PanelGrid.tsx` (react-grid-layout) |
| Row-height fitting | `dashboard/widgets/useFitRowHeight.ts` |
| Pump station page | `dashboard/PumpStationDetail.tsx` |
| Flow monitor page | `dashboard/FlowMonitorDetail.tsx` |
| Explorer tree tab | `components/Layout/ContentView.tsx`, `components/Tree/**` |
| Explorer settings | `dashboard/ExplorerSettings.tsx` |
| Design tokens | `dashboard/dashboard.css` (scoped to `.cmom-dashboard`) |

## Design system

All tokens are custom properties defined on `.cmom-dashboard` in
`dashboard/dashboard.css`. Dark terminal aesthetic: near-black surfaces,
monospace labels, green accent.

- Spacing: `--cmom-space-1..5` (4/8/12/16/24px)
- Radius: `--cmom-radius-sm` 6px, `--cmom-radius-md` 12px
- Surfaces: `--cmom-bg`, `--cmom-surface`, `--cmom-surface-elevated`
- Borders: `--cmom-border`, `--cmom-border-strong`
- Text: `--cmom-text-primary` / `-muted` / `-tertiary`
- Fonts: `--cmom-font`, `--cmom-font-mono`

**Rule:** new dashboard UI uses these tokens, never literal colors. Components that
can render outside the `.cmom-dashboard` cascade must carry a literal fallback and
say so in a comment (precedent: `widgets/Readings.tsx`).

## Known baseline (do not mistake for regressions)

- `npx tsc --noEmit -p app/tsconfig.json` reports **many pre-existing errors**
  (MUI v5 `Grid` `item` prop, `mqtt-explorer-backend` path mapping, `React.useRef`
  arity). A clean typecheck is *not* the bar. Filter to the files you touched.
- `yarn test:app` baseline as of 2026-09-04: **97 passing / 11 pending / 10 failing.**
  The 10 failures are pre-existing (`Chart.spec.tsx` interpolation + data updates,
  `LoginDialog.security.spec.tsx` timeout) and unrelated to dashboard work.

## Decisions

| Date | Decision | Reason |
| --- | --- | --- |
| 2026-09-04 | Treat `tsc --noEmit` as advisory, not a gate; verify by filtering to touched files | Repo has a large pre-existing error backlog; a clean typecheck is unreachable without unrelated MUI migration work |
| 2026-09-04 | Removed About MQTT Explorer entirely (dialog, redux action + state, DetailsTab buttons, spec file) | EXPLORER-003. The spec file asserted the feature's existence, so it had to go with it — this drops 10 passing tests by design, not by regression |
| 2026-09-04 | Device page header extracted to one shared `DeviceHeader` component | EXPLORER-004/007. Six pages each hand-rolled a header; that duplication was the direct cause of the inconsistent, full-width back button |
| 2026-09-04 | Back button sized by content (`align-self: flex-start`, `width: auto`), not full width | A bare `<button>` in a flex column stretches to the container; that was the "back button extends the entire page" bug |
| 2026-09-04 | Device title = two payload fields joined by em dash, uppercase; identifier uppercase beneath it | EXPLORER-004. Pump stations: Description — Location. Flow monitors: Location — Site Name. Uses existing payload fields; no duplicate data introduced |
| 2026-09-04 | `DeviceHeader.titleParts` typed `unknown[]`, coerced with `String()` | Callers pass values straight from untyped MQTT field maps; coercion at the boundary beats casting at every call site |
| 2026-09-04 | Verification loop is `yarn build && yarn start` (Electron), not a dev server | `yarn dev` is broken on Windows and the browser dev server never completes its first compile. The production build is ~45s warm, which is a workable iteration loop |
| 2026-09-04 | Live MQTT outranks SQL for the wet-well current level; SQL is the fallback | EXPLORER-008. SQL is a one-shot mount-time read, so having it win the `??` pinned the gauge while the chart moved. Static wet-well *dimensions* still come from SQL — only the live reading flipped |
| 2026-09-04 | Pump station placement is authored per analog count in `pumpStationLayout.ts`, not derived at render time | The specified alignments are relationships between named cards; width-splitting math cannot express them |
| 2026-09-04 | Pump station row-2 panels are no longer `autoHeight` | Content measurement contradicts layouts that require cards to match each other's heights, and it was the jitter feedback loop. Overflowing content scrolls inside its card |
| 2026-09-04 | PanelGrid layout storage key includes the layout kind | A single key let a 2-analog station load a 3-analog station's saved positions (subset check passes), each station then overwriting the other's — the "cards constantly move" bug |
| 2026-09-04 | Dashboard tokens are theme-aware via `data-cmom-theme` on `<html>`; dark stays the default | EXPLORER-002. Only token *values* change, so a theme switch cannot move anything. Set on documentElement so MUI Portals and `body` are covered |
| 2026-09-04 | Topic nodes NOT restyled as cards pending a decision | Re-adding a background box behind node text would reopen a bug that was deliberately closed (see `Tree/TreeNode/styles.ts`). Options are in the EXPLORER-001 ticket |

## Known pre-existing defects (not caused by dashboard work)

- **BACKEND-001** — `MessageHistoryStore` flush throws `RangeError: Invalid string
  length` on a timer against the live broker. lowdb serializes the whole DB per
  write; in-memory history exceeds V8's string cap. History never persists, memory
  grows unbounded. See `tickets/BACKEND-001-message-history-flush.md`.
- `yarn dev` is broken on Windows (hardcoded Unix binary path in `app/package.json`).
- The browser webpack dev server does not complete its first compile. Root cause
  unknown.

## Open items / next up

See `tickets/`. Immediate follow-ups, in dependency order:

1. **EXPLORER-013** — pump station card jitter. Suspected cause: the `autoHeight`
   measure → `setLayout` → re-measure path in `PanelGrid.tsx` interacting with
   react-grid-layout's vertical compaction. The existing one-shot + 500ms debounce
   guard reduces but does not eliminate it.
2. **EXPLORER-008** — stale wet well. `PumpStationDetail.tsx` computes
   `wetWell?.currentLevelFt ?? liveLevelFt`, so the **SQL** value wins whenever SQL
   is configured, and the SQL read does not refresh on MQTT arrival. The gauge and
   the chart therefore diverge. Fix is to make the live MQTT reading the
   authoritative current value, with SQL as the fallback — the inverse of today.
3. **EXPLORER-010/011/012** — explicit pump station layouts by analog input count,
   replacing the derived `graphSlotLayout` / `splitWidths` math.
4. **EXPLORER-001/002** — Explorer tab hierarchy + global dark mode.
