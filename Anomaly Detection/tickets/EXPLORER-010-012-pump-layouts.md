# EXPLORER-010 / 011 / 012 — Pump station layout rules

**Status:** Implemented — 2026-09-04. Needs visual verification.

## What changed

Placement moved out of `PumpStationDetail.tsx`'s render-time packing math
(`graphSlotLayout`, `splitWidths`, the `singleGraph` special case — all removed)
into a new **`dashboard/pumpStationLayout.ts`**, which returns an explicit,
authored arrangement selected by analog input count.

Derived packing could not express the requirements, because they are
relationships between *specific cards* — "Unit Status's right edge lines up with
the Analog Input above it", "Digital Inputs' bottom aligns with the charts'
bottoms", "the stacked pair's combined height equals the cards beside it". Those
have to be stated, not inferred from a width-splitting rule.

Grid is 12 columns. `ROW1_H = 17`, `ROW2_H = 12` rows.

### One analog (EXPLORER-010)

| Card | x | y | w | h |
| --- | --- | --- | --- | --- |
| Wet Well | 0 | 0 | 3 | 17 |
| Analog Input | 3 | 0 | 3 | 17 |
| Digital Inputs | 6 | 0 | 6 | 9 |
| Power & Temperature | 6 | 9 | 6 | 4 |
| Pump Runtimes | 6 | 13 | 6 | 4 |
| Wet Well Info | 0 | 17 | 3 | 12 |
| Unit Status | 3 | 17 | 3 | 12 |

Unit Status right edge = 3 + 3 = 6 = Analog Input's right edge. Because both are
column counts in the same 12-column grid, that alignment is resolution
independent and holds through window resize.

### Two analog (EXPLORER-011)

Row 1: Wet Well (0,3) | Analog 1 (3,3) | Analog 2 (6,3) | Digital Inputs (9,3).
Digital Inputs gets the full `ROW1_H`, so its bottom aligns with the gauge and
both charts.

Row 2: Wet Well Info (0,3) | Unit Status (3,3) | Pump Runtimes (6,6, h=6) over
Power & Temperature (6,6, h=6). The stack totals 12 = `ROW2_H`, matching the two
cards beside it.

### Three analog (EXPLORER-012)

Row 1: Wet Well | Analog 1 | Analog 2 | Analog 3, each w=3 — exactly filling 12.

Row 2: Wet Well Info (0,3) | Unit Status (3,3) | Digital Inputs (6,3) | Power &
Temperature (9,3, h=6) over Pump Runtimes (9,3, h=6), again totalling `ROW2_H`.

### Cases the spec did not cover

- **0 analog** — gauge keeps its column, a placeholder fills the chart space, and
  the detail cards spread across row 2, so the page does not collapse to a strip.
- **4+ analog** — falls back to a `wrap` layout: gauge plus three charts on row 1,
  the rest four to a row beneath. Silently forcing a 5-analog station into the
  3-analog arrangement would be worse than packing it.

## autoHeight removed for these panels

None of the row-2 panels are `autoHeight` any more. Per-card content
measurement directly contradicts layouts that specify cards matching each
other's heights, and it was also the jitter loop (see EXPLORER-013). Content
taller than its card scrolls within the card; the user can still drag/resize.

## Acceptance criteria

- [x] Layout matches the specified arrangement for its analog count.
- [x] Required edges align by construction (shared column arithmetic), so they
      hold across window resize.
- [x] 0-analog degrades sensibly.
- [x] 4+ analog has defined behavior.
- [x] Varying digital input counts cannot break the grid (Digital Inputs has a
      fixed cell; its content scrolls).
- [ ] Dark mode correct — needs a look.
- [ ] No card movement on live MQTT update — needs a look.
- [ ] Visual verification of all three layouts — **needs your eyes**.
