import * as React from 'react'
import { severityColors } from '../config'

interface Props {
  title: string
  depthValue: number
  depthUnit: string
  levelValue: number
  levelUnit: string
}

/**
 * Rectangular wet well cross-section, filled to the current level as a
 * percentage of the well's configured depth — same visual language as
 * PipeGauge but a rectangle, since a wet well isn't a circular pipe.
 * Depth comes from SQL (see useSqlWetWellInfo/getPumpStationWetWellInfo);
 * level from whichever analog input's Description mentions "level" (see
 * usePumpStationSummary). Callers should only render this once both real
 * values are available — see PumpStationDetail for the "wet well
 * dimensions not configured yet" fallback.
 */
export default function WetWellGauge({ title, depthValue, depthUnit, levelValue, levelUnit }: Props) {
  const percent = depthValue > 0 ? Math.max(0, Math.min(100, (levelValue / depthValue) * 100)) : 0
  const width = 72
  const height = 96
  const fillColor = percent >= 90 ? severityColors.CRITICAL : percent >= 70 ? severityColors.MODERATE : severityColors.OK
  const fillHeight = (percent / 100) * (height - 4)

  return (
    <div className="cmom-card cmom-gauge-card" style={{ padding: 'var(--cmom-space-3)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
      <div style={{ fontSize: 11, fontWeight: 600, opacity: 0.75, alignSelf: 'flex-start' }}>{title}</div>
      <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
        <rect
          x={1}
          y={1}
          width={width - 2}
          height={height - 2}
          rx={4}
          fill="var(--cmom-surface-elevated, #1c2229)"
          stroke="var(--cmom-border-strong, #3a424c)"
          strokeWidth={2}
        />
        <rect x={3} y={height - 3 - fillHeight} width={width - 6} height={fillHeight} rx={2} fill={fillColor} opacity={0.85} />
      </svg>
      <div style={{ textAlign: 'center' }}>
        <div className="cmom-value">
          {levelValue.toFixed(1)} <span style={{ fontSize: '0.55em', fontWeight: 500, opacity: 0.7 }}>{levelUnit}</span>
        </div>
        <div style={{ fontSize: 10, opacity: 0.6, marginTop: 2 }}>
          of {depthValue.toFixed(1)} {depthUnit} depth ({percent.toFixed(0)}%)
        </div>
      </div>
    </div>
  )
}
