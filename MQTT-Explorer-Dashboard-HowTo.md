# Flow Data MQTT Dashboard — How To Use & How To Change It

(This is a customized fork of MQTT-Explorer, renamed "Flow Data MQTT
Dashboard" in the title bar/window title/package metadata. The upstream
project name still appears in some internal file/variable names and the
repo folder — that's cosmetic, not worth chasing down.)

This covers three things: how the dashboard is actually built, running it
day-to-day (including on a Linux box), and asking Claude Code to change it
using the included skill.

---

## Part 1 — How it's built (read this before changing anything)

The dashboard lives entirely under `app/src/dashboard/` and wraps the
original MQTT-Explorer tree view rather than replacing it. Nothing here
opens a second MQTT connection — every tab reads from the same topic tree
already held in Redux (`state.connection.tree`) that the Explorer tab uses.

| File | What it does |
|---|---|
| `app/src/dashboard/config.ts` | **The one file to edit for topic/threshold/color changes.** Topic prefixes for each device type, the severity color map (LOW/MODERATE/CRITICAL/OK), and severity parsing. |
| `app/src/dashboard/anomalyTypeScan.ts` | Walks a device node (a site or serial) looking for anomaly-type channels/inputs — any node with its own reading, or a retained `.../anomaly` child. Exports `resolveEntrySeverity()` (anomaly topic if present, else the digital-input rule, else OK) and `isEntryDisplayable()` (Spare/Channel filters) so the fleet-wide rollups (Overview, Anomalies feed) agree exactly with what the per-device detail views show. The detail views themselves use their own explicit field lists instead of this generic scan, since flow monitors and pump stations now render very differently from each other. |
| `app/src/dashboard/useTopicChildren.ts` | `useTopicChildren` enumerates devices under a prefix (e.g. every site under `flow_monitors`); `useFleetAnomalySeverities` flattens every anomaly-type severity across a whole device list, for Overview's rollup tiles; `useTopicMessage` re-renders a component whenever one node gets a new message. |
| `app/src/dashboard/useAnomalyFeed.ts` | Tracks anomaly transitions per (device, anomaly type) — a single site can raise several independent transitions at once, one per channel. Used by both Overview and Anomalies. |
| `app/src/dashboard/DeviceTable.tsx` | Plain device list (site/serial + last-update) — no severity column, since devices don't carry one. Row click selects a device. |
| `app/src/dashboard/FlowMonitorDetail.tsx` | Flow monitor drill-down: exactly three fixed, labeled charts — Level (inches, channel 7), Velocity (fps, channel 11), Flow (gpm, channel 15) — only the ones the site actually publishes. |
| `app/src/dashboard/PumpStationDetail.tsx` | Pump station drill-down: a status header (Service Mode, Disabled, Unacknowledged Alarms, AC Power), Digital Inputs as an alarm list (no charts), Analog Inputs as trend charts (filtered), Battery State and Temperature as value+baseline (no chart). Page, FlowAnalogs, PulseFlows, RelayOutputs, and Solar are deliberately not rendered here. |
| `app/src/dashboard/TrendPanel.tsx` | Shared chart card: title + severity badge + `TimeRangeToggle` + chart (centered on "now," see below) + a current-value-and-timestamp line + baseline readout — value/time are always visible, not hover-only. Sized to 25% width (`width: '25%'` on the card), not full-bleed. Used by both detail views for anything trend-worthy. |
| `app/src/dashboard/ValuePanel.tsx` | Shared no-chart card: current value + baseline readout. Used for Battery State and Temperature. |
| `app/src/dashboard/DigitalInputRow.tsx` | One alarm row: label, current `AlarmDescription`, severity badge. No chart — digital inputs are alarms, not trends. Exports `digitalInputSeverity()`, the severity rule (see Part 1 below). |
| `app/src/dashboard/TimeRangeToggle.tsx` | The 1h/24h/1w/1m/1y buttons. Values are `parse-duration`-compatible strings (`1h`, `24h`, `7d`, `30d`, `365d`) fed straight into `TopicPlot`'s existing `timeInterval` prop — no new time-windowing logic was needed, that prop already existed. |
| `app/src/dashboard/SeverityBadge.tsx` | Shared severity pill. |
| `app/src/dashboard/Overview.tsx`, `FlowMonitors.tsx`, `PumpStations.tsx`, `Anomalies.tsx` | The four tab panels. Flow Monitors / Pump Stations are list-then-detail: `DeviceTable` list view, click a row to swap to `FlowMonitorDetail` / `PumpStationDetail`. |
| `app/src/dashboard/DashboardTabs.tsx` | The top-level tab bar (Overview / Flow Monitors / Pump Stations / Anomalies / Explorer). |
| `app/src/components/App.tsx` | Renders `DashboardTabs` instead of the tree view directly; the original tree view (`ContentView`) is passed in unchanged as the Explorer tab's content. |
| `app/src/dashboard/useSqlFlowBaseline.ts` | Frontend hook for the SQL reporting path below — calls the backend RPC, polls every 5 minutes (baselines change at most daily), degrades to "unavailable" rather than erroring when SQL isn't configured or reachable. |
| `src/sqlReporting.ts` | Backend: one parameterized, read-only SQL Server query (flow monitor site-ID crosswalk + latest `comparison_results` row). Not a generic query endpoint — see "Two data paths" below for why. |

**Two data paths — MQTT (live) and SQL (reporting) — and how they fit
together:**

```
Anomaly-detection repo                          MQTT-Explorer dashboard (this repo)
────────────────────────                        ────────────────────────────────────
fm_mqtt.py / ps_mqtt.py                          Explorer tab, Flow Monitors/Pump
  → publish raw readings                           Stations tabs, Overview, Anomalies
  → flow_monitors/{site}/{ch}         ─── MQTT ───→  read live off the same topic tree
  → pump_stations/{serial}/...                       every tab already shares
                                                       (state.connection.tree)

(future) detector publish step
  → flow_monitors/{site}/{ch}/anomaly ─── MQTT ───→  TrendPanel severity badge
  → flow_monitors/{site}/{ch}/baseline                + "Baseline (MQTT):" line
     (see DASHBOARD_INTEGRATION_INSTRUCTIONS.md,
      not shipped yet — this is the current gap)

SQL Server: comparison_results,                  src/sqlReporting.ts
hach_flow_monitors (site-ID crosswalk)  ─── SQL ───→  one parameterized query, called
                                                       through the existing authenticated
                                                       Socket.io RPC channel (same one
                                                       llmChat already uses)
                                                     → useSqlFlowBaseline hook
                                                     → TrendPanel "Baseline (SQL):" line
```

Both paths can be live at once and are shown side by side, distinctly
labeled, in `FlowMonitorDetail`'s trend panels — "Baseline (MQTT):" and
"Baseline (SQL):". They're independent: SQL reporting works today (reads
`comparison_results`, which already exists) without waiting on the
detector-side MQTT publish step described in
`Anomaly_Detection/Anomaly_Detection/DASHBOARD_INTEGRATION_INSTRUCTIONS.md`.
Only flow monitors have this today — pump station baselines still need the
new SQL table Part 2 of that doc describes, so `useSqlFlowBaseline` has no
pump station equivalent yet.

**Why SQL access is one narrow RPC, not a generic query endpoint.** The
dashboard's server (`src/server.ts`) now holds a SQL Server connection —
new attack surface, worth being deliberate about. `src/sqlReporting.ts`
exposes exactly one parameterized, read-only query
(`getFlowMonitorBaseline(siteNumber)`), called only through the same
authenticated Socket.io RPC channel every other server action already uses
(file read/write, LLM chat) — no new unauthenticated HTTP route, no
arbitrary SQL from the browser. A generic "run this SQL" endpoint would be
a SQL-injection/data-exfiltration surface on a server that's meant to be
reachable from a browser; this was scoped narrower on purpose.

**Configuring SQL reporting** (server/Docker mode only — see below):

```bash
SQL_SERVER=DEV-SQL-00-IG.rwr.re-wa.org
SQL_DATABASE=flow_monitor          # optional, this is the default
SQL_USER=<read-only account>
SQL_PASSWORD=<...>
SQL_PORT=1433                      # optional, this is the default
SQL_ENCRYPT=true                   # optional, this is the default
SQL_TRUST_SERVER_CERT=false        # optional; set true only for a self-signed dev cert
```

Add these to `docker-compose.server.yml`'s environment block (or
`docker run -e ...`) alongside the existing `MQTT_AUTO_CONNECT_*` vars.
Unset `SQL_SERVER` and the dashboard runs exactly as before — MQTT-only,
no error, `useSqlFlowBaseline` just returns nothing and the "Baseline
(SQL):" line doesn't render. **Use a read-only SQL login** — this dashboard
never writes to SQL Server, so the account it connects with shouldn't be
able to either.

**Electron desktop mode doesn't get SQL reporting** — the RPC handler is
only registered in `src/server.ts`, the same pattern the existing `llmChat`
RPC already uses (also server-mode only). A desktop client holding
production DB credentials would be a much larger exposure than a
server-side env var; MQTT-only behavior in desktop mode is intentional, not
a bug to fix.

**Severity model — no device-level severity, by design.** A flow monitor
site or pump station serial is just a grouping; it never carries an
aggregate severity itself. Each anomaly type is independent and carries its
own: each Hach channel (Level/Velocity/Flow) for flow monitors, each
digital/analog input for pump stations — mirroring the anomaly-detection
repo's own rewrite (`Flow_Monitor_Anomalies` and `OPC_Anomalies` are now
append-only, one row per channel/input per cycle, no site/station-level
`OverallSeverity` column). Overview's severity tiles are a fleet-wide count
across every anomaly type on every device — not a count of "sites in
alarm," since a site is never itself "in alarm."

**Digital input severity is computed client-side, no detector work
needed.** Unlike every other severity value (which comes from a retained
`.../anomaly` topic the detector publishes — see the gap below), digital
input alarms already carry everything needed in their existing raw payload
(`Alarm: bool`, `AlarmDescription: string`), so `DigitalInputRow.tsx`
computes severity straight from that, live, no waiting on any other repo:

```
alarm == false                                     → OK
alarm == true, description contains "alarm"/"fail"  → CRITICAL
alarm == true, description contains "exceeded"       → MODERATE
alarm == true, description contains "running"/"normal" → LOW
alarm == true, anything else                          → OK
```

Digital inputs are also filtered before display: an input whose static
`Description` field is empty or literally `"Spare"` is skipped — those slots
aren't wired to anything, showing them is just noise. Analog inputs get a
similar filter: skip any whose `Description` is empty (unnamed — no chart is
shown for these) or contains the word "Channel" (raw hardware channel
labels, not meaningful reading points). Both filters read the field the
device itself publishes, no config needed.

Every trend panel's title includes the field's `Description`, not just its
topic path — e.g. `AnalogInputs/AnalogInput1 (Wet Well Level)` — so it's
never just a bare topic name.

Digital input severity **does feed the fleet-wide rollup and Anomalies
feed**, not just the per-device alarm rows — `anomalyTypeScan.ts` exports
`resolveEntrySeverity()` (same rule as above, applied wherever there's no
`.../anomaly` topic to defer to) and `isEntryDisplayable()` (the same
Spare/Channel filters), and both `useFleetAnomalySeverities` (Overview
tiles) and `useAnomalyFeed` (Anomalies tab) use them. So Overview and
Anomalies already reflect real digital-input alarms today, even though flow
monitor and analog-input severity are still waiting on the detector-side
publish described below.

**Charts center "now" at the horizontal midpoint**, not right-align to the
latest data point — added as an opt-in `centerNow` prop on the shared
`Chart`/`TopicPlot` components (`app/src/components/Chart/effects/useCustomXDomain.tsx`),
used only by `TrendPanel.tsx`. The Explorer tab's own chart panels are
untouched (prop defaults to off), so this didn't touch existing behavior or
its test coverage (`Chart.domain.spec.tsx`).

**Hover tooltips anchor near the cursor now, not the chart's top edge** —
this was a real bug (not dashboard-specific — it affects every chart in the
app, including the Explorer tab's). The tooltip used to anchor to the whole
chart container with `placement="top"`, so a chart sitting near the top of
the viewport (any `TrendPanel`, being quarter-width cards, is a lot more
likely to be there than the old full-width Explorer charts) pushed the
tooltip off-screen. Fixed in the shared `Chart.tsx`/`TooltipComponent.tsx`:
the tooltip now anchors to the actual cursor position (via a Popper virtual
element at the pointer's `clientX`/`clientY`) with `flip`/`preventOverflow`
modifiers as a safety net for any remaining edge case.

**Confirmed live topic scheme** (from the anomaly-detection repo's
`fm_mqtt.py` / `ps_mqtt.py`, not guessed):
- Flow monitors: `flow_monitors/{site_number}/{channel_type}`, plus
  `.../site_info`, `.../ports/{port_id}`, `.../status` — all retained.
- Pump stations: `pump_stations/{serial}/UnitStatus`,
  `.../AnalogInputs/AnalogInput{n}`, `.../DigitalInputs/DigitalInput{n}`,
  plus `ACPower`, `BatteryState`, `RainInfo`, `Solar`, `Temperature`,
  `PumpRuntimes/{n}`, `RelayOutputs/{n}`, etc — all retained.
- **No `rewa/` prefix, and `opcua/12299` is not an MQTT topic** — that's
  only the OPC-UA node-ID namespace `ps_mqtt.py` reads *from* before
  republishing to `pump_stations/...`. If you ever see either of those in
  old notes, they're wrong; `config.ts` has the corrected prefixes.

**The current gap — flow monitor and analog-input severity/baseline are
not live yet; digital inputs already are.** Anomaly detection (z-score vs.
baseline) happens in `detector.py` today and is written to SQL Server
(`Flow_Monitor_Anomalies` for flow monitors, `OPC_Anomalies` for pump
stations), consumed by Grafana. No `flow_monitors/{site}/{channel}/anomaly`,
`.../baseline`, `pump_stations/{serial}/{input}/anomaly`, or `.../baseline`
topic is published to MQTT yet, so those trend panels' severity badges read
OK and their "Baseline:" line reads "not available yet" — correct given
today's data, not a bug. Digital input alarms are unaffected by this gap
(see above — computed client-side already).

**Instructions for closing this gap were handed off, not implemented
here** — the dashboard has no SQL connection and shouldn't grow one; the
detector repo is the only thing that can compute a baseline or z-score.
See `Anomaly_Detection/Anomaly_Detection/DASHBOARD_INTEGRATION_INSTRUCTIONS.md`
for the exact topic convention and a starting point for a new pump-station
baseline table sourced from the OPC audit log. Once those topics go live,
no dashboard code changes are needed — `TrendPanel.tsx`/`ValuePanel.tsx`
already look for `.../anomaly` and `.../baseline` siblings next to every
value-bearing node.

---

## Part 2 — Running it day to day

**Desktop (Electron) app, Windows/Mac:**
```
yarn
yarn build
yarn start
```

**Browser mode** (reachable from other machines, e.g. a monitoring wall
display — works on Windows or Linux, same commands):
```
yarn
yarn build:server
yarn start:server
```
Then open `http://localhost:3000` (or the host's IP, port 3000).

**Linux deployment via Docker — this is the supported path for a Linux
box.** The repo now has two separate Docker images; don't confuse them:

- `Dockerfile` (root) — a **CI/test image** (Playwright, VNC, a bundled
  test-only mosquitto). Not what you run in production.
- `Dockerfile.server` — the **dashboard deployment image**. Multi-stage
  build, Node 22 (a devDependency requires it even though `package.json`
  says `>=20`), builds `yarn build:server` and runs
  `node dist/src/server.js`. Built and smoke-tested against a real
  container — confirmed the HTTP server comes up and serves the app.

Simplest deploy, standalone:
```bash
docker build -f Dockerfile.server -t mqtt-explorer-dashboard .
docker run -d -p 3000:3000 \
  -e MQTT_AUTO_CONNECT_HOST=mosquitto \
  -e MQTT_AUTO_CONNECT_PORT=1883 \
  -e MQTT_EXPLORER_USERNAME=admin \
  -e MQTT_EXPLORER_PASSWORD=your_secure_password \
  -v mqtt-explorer-data:/app/data \
  mqtt-explorer-dashboard
```

Recommended deploy, alongside the anomaly-detection stack — `docker-compose.server.yml`
joins the same `rewa_mqtt_net` network the broker's own compose file
creates (`Anomaly_Detection/mqtt-broker/Docker-compose.yml`), so it can
reach `mosquitto` by container name:
```bash
# Deploy the anomaly-detection mosquitto stack first (creates rewa_mqtt_net),
# then from the MQTT-Explorer checkout:
docker compose -f docker-compose.server.yml up -d --build
```
Since you're already running things behind nginx/oauth2-proxy, set
`MQTT_EXPLORER_SKIP_AUTH=true` in the compose file's environment and let
the proxy handle auth instead of the app's built-in login (both env vars
are read in `src/AuthManager.ts` — verified, not assumed).

**Connecting to the broker — this is "connecting the two repos."** There is
no code-level integration between MQTT-Explorer and the anomaly-detection
repo, and there doesn't need to be — they only ever talk through mosquitto.
Two separate things determine what you see:

1. **Is the dashboard pointed at the right broker at all?** If Flow
   Monitors/Pump Stations show "No devices seen on this topic prefix yet,"
   the dashboard likely isn't connected, or is connected to the wrong
   broker/host. Fix: open the connection dialog (desktop app) or set
   `MQTT_AUTO_CONNECT_HOST`/`MQTT_AUTO_CONNECT_PORT` (server/Docker mode,
   see Part 2) to the same mosquitto instance `fm_mqtt.py`/`ps_mqtt.py`
   publish to — `Anomaly_Detection/mqtt-broker/mosquitto/mosquitto.conf`
   currently listens on plain `1883` with `allow_anonymous true` (no
   TLS/8883 yet, despite older notes mentioning MQTTS). Once connected,
   the Explorer tab should show a live `flow_monitors`/`pump_stations` tree
   immediately — check there first if anything looks empty, it's the
   fastest way to confirm the connection itself is working before
   suspecting a dashboard bug.
2. **Is severity/baseline data being published?** This is the part that's
   still incomplete — see the gap noted in Part 1 above and
   `Anomaly_Detection/Anomaly_Detection/DASHBOARD_INTEGRATION_INSTRUCTIONS.md`.
   Even with the broker connection fully working, flow monitor and analog
   input severity/baselines stay blank until that publish step ships.
   Digital input alarms don't have this problem — they're already visible
   end-to-end once step 1 is done, since their severity is computed
   entirely client-side from data `ps_mqtt.py` already publishes.

---

## Part 3 — Using the dashboard once it has tabs

- **Overview tab** — glance here first each shift. Fleet-wide severity
  counts (across every channel/input on every device, not per-site), most
  recent anomaly transitions, broker connection status. Tiles undercount
  until the detector publishes flow-monitor/analog-input anomaly topics —
  see Part 1 — but digital input alarms already count correctly today.
- **Flow Monitors tab** — filterable list, one row per site number under
  `flow_monitors/`, no severity column. **Click a site** to open its detail
  view: up to three fixed charts — Level (inches), Velocity (fps), Flow
  (gpm) — whichever the site actually publishes, each a quarter-width card
  with its own severity badge, a 1h/24h/1w/1m/1y toggle (defaults to 24h),
  and a baseline readout.
- **Pump Stations tab** — one row per serial under `pump_stations/`. Click
  a serial to open its detail view: a quick-stat header (Service Mode,
  Disabled, Unacknowledged Alarms), then AC Power and Battery State side by
  side as value+baseline cards (no chart), then an alarm list for Digital
  Inputs (no charts — description + severity, "Spare"/empty inputs
  hidden), trend charts for Analog Inputs (filtered to exclude unnamed
  inputs and raw "Channel" labels, each titled with its field description),
  and a value+baseline card for Temperature. Page, FlowAnalogs, PulseFlows,
  RelayOutputs, and Solar are intentionally not shown.
- **Anomalies tab** — newest-first feed of anomaly *type* transitions
  (device + which channel/input, not just which device), filterable by
  device type and severity (LOW/MODERATE/CRITICAL).
- **Explorer tab** — the original MQTT-Explorer tree browser, untouched,
  for raw debugging (confirming a retained message landed on a topic,
  cross-checking against `docker logs`).

---

## Part 4 — Changing it later (no code editing required from you)

Open Claude Code in the repo and describe the change in plain language —
the skill (`.claude/skills/mqtt-dashboard-builder/`) translates it into a
minimal diff. Examples that work well:

- *"Add a new tab called Rain Events that shows the latest
  `RainInfo` readings."* (real topic: `pump_stations/{serial}/RainInfo`)
- *"Change CRITICAL from red to a red I can actually see on the office
  TV — make it high-contrast."*
- *"Add a column to the Flow Monitors list for last-updated timestamp,
  and gray out rows that haven't reported in over an hour."*
- *"Remove the Pump Stations tab for now, I'm not using it yet."*
- *"Sort the Analog Inputs trend panels in PumpStationDetail by severity
  instead of by input number, worst first."*

**Known follow-up, not yet done:** `useAnomalyFeed.ts`'s per-type
subscriptions are re-wired only when the device list itself changes (a
site/serial appearing or disappearing), not when a *new channel* shows up
mid-session on an already-known device — it'll be picked up on the next
device-list change rather than instantly. Flagged rather than adding a
second polling layer for what's currently a rare event.

Each of these should produce a small, reviewable diff — not a rewrite. If
a request is ambiguous, Claude Code will pick the smallest reasonable
interpretation and tell you what it assumed.

**Config-first changes** (even faster, sometimes no Claude Code needed):
topic prefixes, severity colors, and severity parsing all live in
**`app/src/dashboard/config.ts`**. Repointing a topic prefix or restyling
a severity color is a one-line edit to that file — no other file should
hard-code these values.

**Review before you trust it:** after any dashboard change, run:
```
yarn test:app
yarn test:backend
```
and open the app to eyeball the affected tab before relying on it for
monitoring. Both were run and passed (backend has a pre-existing
Windows/PowerShell-only script quirk unrelated to the dashboard; app
suite: 106 passing, 1 pre-existing unrelated failure) as of the
per-device-panel-redesign — re-run them yourself after every change, this
is a floor, not a substitute for looking at the screen.

---

## Part 5 — Things that are *not* dashboard problems

If a panel shows "No data" or stale values, check these before asking for
a UI fix — they're almost always upstream:

- Missing `retain=True` on the publisher side.
- No anomaly topic published yet per channel/input (Part 1 — expected
  today, not a bug).
- A device with no detail-view panels at all means MQTT-Explorer hasn't
  seen any retained message under that site/serial yet — check the
  Explorer tab directly against the same topic prefix.
- TZ misconfiguration causing epoch-zero timestamps at the source.
- Broker-side lockouts from shared Hach API credentials.

The dashboard skill is scoped to the MQTT-Explorer app only — it won't
(and shouldn't) touch `detector.py`, the Mosquitto broker config, or the
SQL schemas. Those stay in their own repo/workflow.
