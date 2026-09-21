# EXPLORER-013 — Pump station layout stability (card jitter)

**Status:** Fixed — 2026-09-04. Needs visual confirmation.

## Root cause

Not one bug. Three compounding causes, the main one being a shared storage key.

### 1. One layout key for every pump station (the main cause)

`PumpStationDetail` rendered `<PanelGrid storageKey="cmom-layout-pump-station-detail-v2" …>`
— a single key for **all** pump stations regardless of shape.

`PanelGrid.loadLayout` reuses a saved layout when it has an entry for every panel
currently rendered:

```ts
if (Array.isArray(saved) && panels.every(p => saved.some(s => s.i === p.id))) {
  return saved.filter(s => panels.some(p => p.id === s.i))
}
```

A 2-analog station's panels are a **subset** of a 3-analog station's, so that
check passes and the smaller station silently loads positions authored for the
larger one. `autoHeight` then "corrected" the mismatched heights and wrote the
result back — so each station undid the previous one's layout. Clicking between
stations was what made cards walk around the page.

**Fix:** the key now includes the layout kind —
`cmom-layout-pump-station-detail-v3-${layoutKind}` — so a station only ever
restores an arrangement authored for its own shape.

### 2. autoHeight feedback loop

`AutoHeightMeasure` → `applyAutoHeight` → `setLayout` → react-grid-layout
re-lays out with vertical compaction (moving every card below) → re-render →
new measurement. The existing one-shot `autoSizedRef` and 500ms debounce damped
this but did not remove it, and any panel-set change reset the guard.

**Fix:** row-2 pump station panels are no longer `autoHeight` at all. Their
heights are specified by the layout (which is also what EXPLORER-010/011/012
requires), so there is nothing to measure and no loop.

### 3. Unstable measure callback

`PanelGrid` passed `onHeight={px => handleAutoHeight(panel.id, px)}` — a fresh
closure each render — and `AutoHeightMeasure`'s effect listed `onHeight` in its
dependencies. Every one of the page's 2s live-data renders therefore re-ran the
effect and re-reported an unchanged height, restarting the debounce downstream.

**Fix:** the callback is held in a ref and kept out of the dependency array, so
only a genuine height change propagates. This one matters for the **flow
monitor** page too, which still uses `autoHeight`.

## Note on useFitRowHeight

I had suspected `useFitRowHeight` as a second feedback path (measured height →
rowHeight → content rewrap → new measured height). On reading it, the container
it measures is `flex: 1` with its own `overflow: auto`, so its height does not
depend on content and the loop does not close. Left alone. Recording it so the
next person does not re-investigate.

## Acceptance criteria

- [x] Shared-key cross-contamination eliminated.
- [x] autoHeight loop eliminated for pump station panels.
- [x] Measure callback no longer re-fires on unrelated renders.
- [ ] Confirm no card shifts when switching between stations of different
      analog counts — **the specific thing to try**, since that is what
      triggered it.
- [ ] Confirm no oscillation while live values update.
- [ ] Window resize.
- [ ] Dark mode.

## Note on existing saved layouts

The key changed from `-v2` to `-v3-<kind>`, so everyone starts from the new
defaults. Old `-v2` entries are orphaned in localStorage and harmless; they can
be cleared if you want the storage tidy.
