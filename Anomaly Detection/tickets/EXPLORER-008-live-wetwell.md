# EXPLORER-008 — Synchronize wet-well visualization

**Status:** Fixed — 2026-09-04. Needs visual confirmation.

## Root cause

`PumpStationDetail.tsx` computed:

```ts
const currentLevelFt = wetWell?.currentLevelFt ?? liveLevelFt
```

`wetWell` comes from `useSqlWetWellInfo(deviceKey)` — a **one-shot direct SQL
Server read** of `OPCAudit_Live`, fetched on mount and never re-read when an
MQTT message arrives. So on every station where SQL reporting is configured,
`wetWell.currentLevelFt` was non-null and **won the `??`**, pinning the gauge to
a mount-time snapshot for the whole session. The analog chart, reading the MQTT
tree node directly, kept updating. Two copies of one quantity, only one live.

The existing comment described the live value as a fallback for when SQL is
*absent* — reasonable for a static field, wrong for a live reading.

## Fix

New `resolveWetWellLevelFt(summary, sqlCurrentLevelFt)` in
`usePumpStationSummary.ts` inverts the precedence — **live MQTT wins, SQL is the
fallback** — and is the single path every consumer now uses:

| File | Before | After |
| --- | --- | --- |
| `PumpStationDetail.tsx` | `wetWell?.currentLevelFt ?? liveLevelFt` | `resolveWetWellLevelFt(summary, wetWell?.currentLevelFt)` |
| `PumpStations.tsx` (list card mini gauge) | same bug | same fix |
| `PumpStationMissingAttributes.tsx` | same bug | same fix |

All three had the identical inverted `??`. Routing them through one function
means the detail gauge, the list-card gauge, and the attribute audit cannot
disagree about what "current" means.

SQL remains the fallback, so stations that publish no "Wet Well Level" analog
input (or a non-numeric one) still show a level rather than regressing to "N/A".

## Acceptance criteria

- [x] Single authoritative current-level value, one code path.
- [x] Live MQTT is the source when available.
- [x] SQL fallback preserved for stations without a live level input.
- [ ] New MQTT value arrives → chart **and** gauge both update, same value —
      **the thing to watch**: open a station and wait for the level to change.
- [ ] List-card mini gauge tracks live too.
