import * as React from 'react'

// Fixed per-series colors (not severity-based) — same three colors used for
// every channel and every site, so the shared legend below the three charts
// stays correct no matter which bar is tallest. Severity is what caused the
// earlier gauge version's bug (arc color implied a position the fill length
// didn't match); a plain bar's height already *is* the value, so there's
// nothing left to get out of sync.
export const DIURNAL_SERIES = [
  { key: 'normalized', label: 'Normalized (shape)', color: '#4dabf5' },
  { key: 'average', label: 'Hour/month average', color: '#9e9e9e' },
  { key: 'measurement', label: 'Measurement', color: '#66bb6a' },
] as const

interface Props {
  title: string
  values: { normalized: number | undefined; average: number | undefined; measurement: number | undefined }
  unit?: string
  max: number
  // "<value> <unit> as of <time>" line for the live measurement, shown under
  // the chart so the actual reading behind the green bar is visible as text,
  // not just implied by bar height.
  measurementReadout?: string
}

// Fixed logical coordinate system — the svg is sized to its grid cell by CSS
// (width/height 100%), not by measuring pixels, so this only needs to stay
// internally consistent, not match any real on-screen size.
const VB_W = 100
const VB_H = 64
const BAR_GAP = 6

export default function DiurnalBarChart({ title, values, unit, max, measurementReadout }: Props) {
  const barW = (VB_W - BAR_GAP * (DIURNAL_SERIES.length + 1)) / DIURNAL_SERIES.length
  const chartH = VB_H - 12 // reserve room for the value label above each bar

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', minWidth: 0, height: '100%' }}>
      <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>{title}</div>
      <div style={{ flex: '1 1 auto', minHeight: 0, width: '100%', display: 'flex' }}>
        <svg width="100%" height="100%" viewBox={`0 0 ${VB_W} ${VB_H}`} preserveAspectRatio="xMidYMax meet">
          <line x1={0} y1={VB_H - 1} x2={VB_W} y2={VB_H - 1} stroke="var(--cmom-border-strong, #3a424c)" strokeWidth={0.5} />
          {DIURNAL_SERIES.map((s, i) => {
            const value = values[s.key]
            const fraction = value === undefined || max <= 0 ? 0 : Math.max(0, Math.min(1, value / max))
            const barH = fraction * chartH
            const x = BAR_GAP + i * (barW + BAR_GAP)
            const y = VB_H - 1 - barH
            return (
              <g key={s.key}>
                {value !== undefined && (
                  <text x={x + barW / 2} y={Math.max(6, y - 2)} textAnchor="middle" fontSize={6} fill="var(--cmom-text, #e6edf3)">
                    {value.toFixed(1)}
                  </text>
                )}
                <rect x={x} y={y} width={barW} height={barH} fill={s.color} rx={1} opacity={value === undefined ? 0.15 : 0.9} />
                {value === undefined && <rect x={x} y={VB_H - 2} width={barW} height={1} fill={s.color} opacity={0.3} />}
              </g>
            )
          })}
        </svg>
      </div>
      {unit && <div style={{ fontSize: 10, opacity: 0.6, marginTop: 2 }}>{unit}</div>}
      <div style={{ fontSize: 10, opacity: 0.7, marginTop: 2, textAlign: 'center' }}>
        {measurementReadout ?? 'No measurement yet'}
      </div>
    </div>
  )
}
