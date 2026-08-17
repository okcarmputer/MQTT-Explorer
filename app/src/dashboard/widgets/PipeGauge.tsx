import * as React from 'react'
import { severityColors } from '../config'

interface Props {
  title: string
  diameterValue: number
  diameterUnit: string
  levelValue: number
  levelUnit: string
}

/**
 * Circular pipe cross-section, filled to the current level as a percentage
 * of the pipe's actual diameter — replaces the small cylinder "LevelGauge"
 * that used to sit in the Flow Monitors card grid (removed per feedback:
 * too messy for a list of many cards). This is a single, bigger, purposeful
 * visualization for one site's own detail page, sized by its *real*
 * diameter (from the MQTT ports topic — see useFlowPortInfo — falling back
 * to the SQL-sourced dimension, then to config.ts's flat assumption), not a
 * decorative gauge.
 */
export default function PipeGauge({ title, diameterValue, diameterUnit, levelValue, levelUnit }: Props) {
  const percent = diameterValue > 0 ? Math.max(0, Math.min(100, (levelValue / diameterValue) * 100)) : 0
  const size = 96
  const r = size / 2 - 3
  const cx = size / 2
  const cy = size / 2
  const fillColor = percent >= 90 ? severityColors.CRITICAL : percent >= 70 ? severityColors.MODERATE : severityColors.OK
  const clipId = React.useId()
  const fillTop = cy + r - (percent / 100) * (2 * r)

  return (
    <div className="cmom-card cmom-gauge-card" style={{ padding: 'var(--cmom-space-3)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
      <div style={{ fontSize: 11, fontWeight: 600, opacity: 0.75, alignSelf: 'flex-start' }}>{title}</div>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <defs>
          <clipPath id={clipId}>
            <circle cx={cx} cy={cy} r={r} />
          </clipPath>
        </defs>
        <circle cx={cx} cy={cy} r={r} fill="var(--cmom-surface-elevated, #1c2229)" stroke="var(--cmom-border-strong, #3a424c)" strokeWidth={2} />
        <rect x={0} y={fillTop} width={size} height={size - fillTop} fill={fillColor} opacity={0.85} clipPath={`url(#${clipId})`} />
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="var(--cmom-border-strong, #3a424c)" strokeWidth={2} />
      </svg>
      <div style={{ textAlign: 'center' }}>
        <div className="cmom-value">
          {levelValue.toFixed(1)} <span style={{ fontSize: '0.55em', fontWeight: 500, opacity: 0.7 }}>{levelUnit}</span>
        </div>
        <div style={{ fontSize: 10, opacity: 0.6, marginTop: 2 }}>
          of {diameterValue.toFixed(1)} {diameterUnit} diameter ({percent.toFixed(0)}%)
        </div>
      </div>
    </div>
  )
}
