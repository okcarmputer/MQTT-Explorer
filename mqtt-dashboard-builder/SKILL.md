---
name: mqtt-dashboard-builder
description: Use this skill when working on a local MQTT-Explorer (thomasnordquist/MQTT-Explorer) checkout to turn it into a tabbed monitoring dashboard for flow monitors, pump stations, and anomaly detection alerts. Trigger this skill any time the user asks to add or change a dashboard tab/view, wire a new MQTT topic pattern into a panel, adjust anomaly/alarm styling, reorganize the explorer UI, or otherwise customize MQTT-Explorer for the CMOM Flow Monitoring and Anomaly Detection Platform. Do NOT trigger this for unrelated MQTT broker work (Mosquitto config, detector.py, SQL schemas) — this skill is scoped to the MQTT-Explorer front-end/dashboard application only.
---

# MQTT-Explorer Dashboard Builder

## Who this is for and why

This skill supports one person's recurring task: evolving a local fork of
**MQTT-Explorer** (https://github.com/thomasnordquist/MQTT-Explorer) from a
generic topic-tree browser into a purpose-built, multi-tab operations
dashboard for a wastewater utility's **CMOM Flow Monitoring and Anomaly
Detection Platform**. The person is not primarily a front-end developer —
they are a data/infrastructure engineer. Favor small, reviewable, working
changes over big-bang rewrites. Always leave the app in a state that
`yarn dev` or `yarn dev:server` can run.

This is a *skill*, not a one-shot script. It will be invoked repeatedly as
the dashboard evolves — new tabs, new widgets, new topic patterns, styling
tweaks. Each invocation should assume the codebase has already been
partially modified by a previous invocation, so **always inspect the
current state of the app before changing it** — do not assume the vanilla
upstream structure still applies after the first pass.

## Domain context (use this, don't ask for it again)

The dashboard monitors two device classes plus a rollup/alert view:

- **Flow monitors** — ~151 active sites, Hach FSData telemetry, baseline
  comparison via z-score/SD bands against CHA historical baselines.
- **Pump stations** — OPC-UA SCADA tags via a bridge into MQTT, digital
  input alerts, history/baseline tracking (in progress).
- **Anomaly/alerting** — high-side-only alarm ladder: 1/2/3 SD above the
  peak mean maps to **LOW / MODERATE / CRITICAL**. Alarm level per
  device = MAX across flow, velocity, and level evaluated independently.
  Surcharge (depth exceeding pipe diameter) is the primary surcharge rule.

**MQTT topic conventions currently in use** (confirm against the live
broker before hard-coding subscriptions, since one mismatch is open):

- `rewa/flow/{site_id}/anomaly` — flow monitor anomaly state, retained.
- `rewa/pump_stations/{serial}/...` — documented pump station scheme.
- `opcua/12299/{serial}/...` — what the live equipment inspector app
  actually subscribes to today. **These two pump station schemes do not
  yet match.** Until this is resolved upstream, build the pump station
  tab to accept a *configurable* topic prefix (see "Configuration, not
  hard-coding" below) rather than hard-coding either scheme, so the
  dashboard keeps working once the mismatch is fixed.
- All publishes use `retain=True`. A panel that shows "no data" is more
  likely a missing retain flag upstream than a dashboard bug — don't
  spend time debugging the UI for that symptom; note it to the user.
- QoS level for the pipeline is still being finalized (QoS 2 target,
  unconfirmed) — this affects the broker/publisher, not the dashboard,
  so it's out of scope for this skill.

Alarm severity color convention to reuse consistently across every panel:
LOW = amber/yellow, MODERATE = orange, CRITICAL = red, OK/nominal = green
or neutral gray. Keep this mapping in one shared place (see below), not
duplicated per component.

## What "dashboard" means here

Turn the single always-on topic tree into a **tabbed layout** with the
tree still available as one of the tabs, plus:

1. **Overview** — at-a-glance summary: counts of sites in
   OK/LOW/MODERATE/CRITICAL, most recent anomaly events, connection
   health to the broker.
2. **Flow Monitors** — a filterable/sortable table or card grid, one row
   per site, keyed on `site_id`, showing latest flow/velocity/level vs.
   baseline and current alarm level. Clicking a row can drill into a
   time-series/sparkline view for that site.
3. **Pump Stations** — same pattern, keyed on `serial`, showing pump
   status, digital inputs, and alarm level once the topic scheme is
   resolved. Build this panel defensively (see topic mismatch above).
4. **Anomalies** — a live feed / log of anomaly transitions (state
   changes into and out of LOW/MODERATE/CRITICAL), newest first,
   filterable by device type and severity. This is the panel the person
   will actually watch during a shift.
5. **Explorer** (original tree view) — keep MQTT-Explorer's existing
   topic-tree browser intact and reachable as its own tab. Don't remove
   or degrade it — it's the fallback for raw debugging.

Tabs must be independently addable/removable/reorderable by the person
later without touching unrelated tabs — treat each tab as its own
component with its own subscription logic, not a shared monolith.

## Configuration, not hard-coding

Every topic pattern, threshold color, and site/serial list must live in
one editable config location (e.g. a `dashboard.config.ts` or JSON file
under a clearly-named `config/` or `dashboard/` directory — check what
already exists in the checkout first; do not create a second competing
config mechanism if one already exists from a prior pass of this skill).
The person will ask you to "add a new panel" or "change the topic
pattern" in plain language — your job on each invocation is to translate
that into a targeted, minimal diff against this config plus whatever
component code it drives. Never require a full rebuild-from-scratch to
add one panel.

## Working method for each invocation

1. **Orient first.** Run something like `git status`, `git log --oneline -10`,
   and look at the actual current `app/` and `backend/` structure
   (`ls`, targeted `grep`/`rg` for "tab", "dashboard", "panel"). Don't
   assume the vanilla upstream layout — a previous pass may have already
   restructured things.
2. **Confirm scope with the smallest useful change.** If the person's
   request is ambiguous ("make it better"), pick the smallest concrete
   interpretation and say what you assumed, rather than redesigning
   broadly.
3. **Reuse existing MQTT-Explorer plumbing.** It already has a working
   MQTT connection layer (`mqtt.js`-based, in `backend/`) and a React
   rendering layer (`app/`). New dashboard tabs should subscribe through
   the existing connection/store rather than opening parallel MQTT
   connections.
4. **Keep the tree view working.** Every change should leave
   `yarn dev` / `yarn dev:server` able to start and the original
   Explorer tab functional.
5. **Test before declaring done.** Run `yarn test:app` and
   `yarn test:backend` (or `yarn test`) after non-trivial changes.
   If UI tests exist and are practical to run (`yarn test:ui`), prefer
   running them for layout/tab changes over skipping verification.
6. **Summarize the diff in plain terms** at the end — what tab/file
   changed, what topic pattern it reads, what config the person can
   edit next time without invoking Claude Code again (see the
   companion how-to guide).

## Guardrails

- Don't touch broker-side code (Mosquitto config, `detector.py`, SQL
  schemas, ADO pipelines) — that's a separate system and separate repo.
- Don't invent topic data the person hasn't confirmed. If a panel needs
  a topic that isn't in the documented list above, ask, or wire it
  through the same configurable-prefix pattern as the pump station tab.
- Don't remove the CC BY-SA 4.0 attribution/donation content from the
  app if this fork is ever redistributed — that's a license requirement
  of upstream MQTT-Explorer, not a style preference.
- Don't quietly change the alarm color mapping per-panel — it must stay
  centralized so LOW/MODERATE/CRITICAL always look the same everywhere.
