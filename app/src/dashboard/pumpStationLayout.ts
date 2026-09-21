/**
 * Explicit pump station dashboard layouts, selected by analog input count.
 *
 * These are authored arrangements, not derived packing. The previous approach
 * computed slot widths at render time (`graphSlotLayout`/`splitWidths`), which
 * could not express the alignment requirements the layouts below are specified
 * with — "Unit Status's right edge lines up with the Analog Input above it",
 * "Digital Inputs' bottom aligns with the analog charts' bottoms", "the stacked
 * pair's combined height equals the cards beside it". Those are relationships
 * between specific cards, so they have to be stated, not inferred.
 *
 * Grid is react-grid-layout's default 12 columns. `y`/`h` are in grid rows,
 * whose pixel height PanelGrid scales via useFitRowHeight.
 */

export type PanelId =
  | 'wet-well-gauge'
  | 'digital-inputs'
  | 'wet-well-info'
  | 'unit-status'
  | 'power-temperature'
  | 'pump-runtimes'

export interface Box {
  x: number
  y: number
  w: number
  h: number
}

export const COLS = 12

// Row 1 holds the wet-well gauge and the analog charts. Tall because those
// charts are the page's primary content.
export const ROW1_H = 17
// Row 2 holds the detail/status cards. Fixed rather than content-measured:
// these layouts specify cards that must match each other's heights, and a
// per-card auto-height would break exactly those relationships (and was the
// source of the card-jitter loop). Cards whose content exceeds this scroll
// within themselves; the user can still drag/resize any card afterwards.
export const ROW2_H = 12

const GAUGE_W = 3

/**
 * Which named layout applies. Anything above 3 analog inputs falls back to
 * `wrap`, which packs charts four-to-a-row below row 1 — no explicit rules
 * were specified past 3, and silently mangling a 5-analog station into a
 * 3-analog arrangement would be worse than packing it.
 */
export type LayoutKind = 'none' | 'one' | 'two' | 'three' | 'wrap'

export function layoutKindFor(analogCount: number): LayoutKind {
  if (analogCount <= 0) return 'none'
  if (analogCount === 1) return 'one'
  if (analogCount === 2) return 'two'
  if (analogCount === 3) return 'three'
  return 'wrap'
}

export interface PumpStationLayout {
  // Position for each analog chart, in the order the charts are listed.
  analog: Box[]
  // Position for the placeholder card shown when there are no analog inputs.
  analogPlaceholder?: Box
  fixed: Record<PanelId, Box>
  // Total grid rows the layout occupies, so useFitRowHeight can scale rows to
  // the available viewport height.
  totalRows: number
}

export function buildPumpStationLayout(analogCount: number): PumpStationLayout {
  const kind = layoutKindFor(analogCount)
  const row2Y = ROW1_H

  if (kind === 'one') {
    // Row 1: Wet Well | Analog | Digital Inputs (to the right edge).
    // Digital Inputs' column continues below it with Power & Temperature and
    // then Pump Runtimes, each also running to the right edge.
    // Row 2 (below the gauge): Wet Well Info | Unit Status, with Unit Status's
    // right edge (3 + 3 = 6) matching the Analog card's right edge above it.
    const rightX = 6
    const rightW = 6
    const digitalH = 9
    const stackH = 4
    return {
      analog: [{ x: GAUGE_W, y: 0, w: 3, h: ROW1_H }],
      fixed: {
        'wet-well-gauge': { x: 0, y: 0, w: GAUGE_W, h: ROW1_H },
        'digital-inputs': { x: rightX, y: 0, w: rightW, h: digitalH },
        'power-temperature': { x: rightX, y: digitalH, w: rightW, h: stackH },
        'pump-runtimes': { x: rightX, y: digitalH + stackH, w: rightW, h: stackH },
        'wet-well-info': { x: 0, y: row2Y, w: 3, h: ROW2_H },
        'unit-status': { x: 3, y: row2Y, w: 3, h: ROW2_H },
      },
      totalRows: ROW1_H + ROW2_H,
    }
  }

  if (kind === 'two') {
    // Row 1: Wet Well | Analog 1 | Analog 2 | Digital Inputs, with Digital
    // Inputs given the full ROW1_H so its bottom aligns with the gauge and
    // both charts.
    // Row 2: Wet Well Info | Unit Status | [Pump Runtimes over Power & Temp],
    // the stacked pair splitting ROW2_H so the column totals the same height
    // as the two cards beside it.
    const half = ROW2_H / 2
    return {
      analog: [
        { x: GAUGE_W, y: 0, w: 3, h: ROW1_H },
        { x: 6, y: 0, w: 3, h: ROW1_H },
      ],
      fixed: {
        'wet-well-gauge': { x: 0, y: 0, w: GAUGE_W, h: ROW1_H },
        'digital-inputs': { x: 9, y: 0, w: 3, h: ROW1_H },
        'wet-well-info': { x: 0, y: row2Y, w: 3, h: ROW2_H },
        'unit-status': { x: 3, y: row2Y, w: 3, h: ROW2_H },
        'pump-runtimes': { x: 6, y: row2Y, w: 6, h: half },
        'power-temperature': { x: 6, y: row2Y + half, w: 6, h: half },
      },
      totalRows: ROW1_H + ROW2_H,
    }
  }

  if (kind === 'three') {
    // Row 1: Wet Well | Analog 1 | Analog 2 | Analog 3 — the gauge and three
    // charts exactly fill the 12 columns.
    // Row 2: Wet Well Info | Unit Status | Digital Inputs | [Power & Temp over
    // Pump Runtimes], the stacked pair again splitting ROW2_H to match.
    const half = ROW2_H / 2
    return {
      analog: [
        { x: GAUGE_W, y: 0, w: 3, h: ROW1_H },
        { x: 6, y: 0, w: 3, h: ROW1_H },
        { x: 9, y: 0, w: 3, h: ROW1_H },
      ],
      fixed: {
        'wet-well-gauge': { x: 0, y: 0, w: GAUGE_W, h: ROW1_H },
        'wet-well-info': { x: 0, y: row2Y, w: 3, h: ROW2_H },
        'unit-status': { x: 3, y: row2Y, w: 3, h: ROW2_H },
        'digital-inputs': { x: 6, y: row2Y, w: 3, h: ROW2_H },
        'power-temperature': { x: 9, y: row2Y, w: 3, h: half },
        'pump-runtimes': { x: 9, y: row2Y + half, w: 3, h: half },
      },
      totalRows: ROW1_H + ROW2_H,
    }
  }

  if (kind === 'none') {
    // No analog inputs: the gauge keeps its column and a placeholder occupies
    // the space the charts would have taken, so the page doesn't collapse into
    // an odd narrow strip.
    return {
      analog: [],
      analogPlaceholder: { x: GAUGE_W, y: 0, w: 12 - GAUGE_W, h: ROW1_H },
      fixed: {
        'wet-well-gauge': { x: 0, y: 0, w: GAUGE_W, h: ROW1_H },
        'digital-inputs': { x: 0, y: row2Y, w: 3, h: ROW2_H },
        'wet-well-info': { x: 3, y: row2Y, w: 3, h: ROW2_H },
        'unit-status': { x: 6, y: row2Y, w: 3, h: ROW2_H },
        'power-temperature': { x: 9, y: row2Y, w: 3, h: ROW2_H / 2 },
        'pump-runtimes': { x: 9, y: row2Y + ROW2_H / 2, w: 3, h: ROW2_H / 2 },
      },
      totalRows: ROW1_H + ROW2_H,
    }
  }

  // 'wrap' — more analog inputs than any specified layout covers. Row 1 keeps
  // the gauge plus the first three charts; the rest wrap four to a row beneath,
  // and the detail cards follow below all of them.
  const FIRST_ROW_SLOTS = 3
  const PER_WRAP_ROW = 4
  const analog: Box[] = []
  for (let i = 0; i < analogCount; i++) {
    if (i < FIRST_ROW_SLOTS) {
      analog.push({ x: GAUGE_W + i * 3, y: 0, w: 3, h: ROW1_H })
    } else {
      const overflowIndex = i - FIRST_ROW_SLOTS
      const rowIndex = Math.floor(overflowIndex / PER_WRAP_ROW)
      const colIndex = overflowIndex % PER_WRAP_ROW
      analog.push({ x: colIndex * 3, y: ROW1_H * (rowIndex + 1), w: 3, h: ROW1_H })
    }
  }
  const wrapRows = 1 + Math.ceil(Math.max(0, analogCount - FIRST_ROW_SLOTS) / PER_WRAP_ROW)
  const wrapRow2Y = ROW1_H * wrapRows
  const half = ROW2_H / 2
  return {
    analog,
    fixed: {
      'wet-well-gauge': { x: 0, y: 0, w: GAUGE_W, h: ROW1_H },
      'wet-well-info': { x: 0, y: wrapRow2Y, w: 3, h: ROW2_H },
      'unit-status': { x: 3, y: wrapRow2Y, w: 3, h: ROW2_H },
      'digital-inputs': { x: 6, y: wrapRow2Y, w: 3, h: ROW2_H },
      'power-temperature': { x: 9, y: wrapRow2Y, w: 3, h: half },
      'pump-runtimes': { x: 9, y: wrapRow2Y + half, w: 3, h: half },
    },
    totalRows: wrapRow2Y + ROW2_H,
  }
}
