import * as React from 'react'
import { useResizeDetector } from 'react-resize-detector'
import { severityColors } from '../config'

interface Props {
  title: string
  diameterValue: number
  diameterUnit: string
  levelValue: number
  levelUnit: string
  // Small, undecorated version for list cards — same fill math, smaller
  // circle, no card chrome/title/caption text.
  compact?: boolean
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
// Intrinsic/viewBox size — bumped up from the original 96 so the gauge
// starts out bigger by default; the on-screen size scales uniformly off
// this (see scale below) so a resizable panel grows the whole gauge, not
// just what's drawn inside a fixed box.
const VIEWBOX_SIZE = 150

export default function PipeGauge({ title, diameterValue, diameterUnit, levelValue, levelUnit, compact }: Props) {
  const percent = diameterValue > 0 ? Math.max(0, Math.min(100, (levelValue / diameterValue) * 100)) : 0
  const size = VIEWBOX_SIZE
  const r = size / 2 - 3
  const cx = size / 2
  const cy = size / 2
  const fillColor = percent >= 90 ? severityColors.CRITICAL : percent >= 70 ? severityColors.MODERATE : severityColors.OK
  const clipId = React.useId()
  const fillTop = cy + r - (percent / 100) * (2 * r)

  // border-box observation + overflow:hidden on the measured wrapper below
  // + a capped scale range guard against the rendered SVG (sized *from*
  // this measurement) ever feeding back into a larger measurement next
  // render — see the matching comment in WetWellTankGauge.tsx.
  const { width: availableW, height: availableH, ref: svgWrapRef } = useResizeDetector({ observerOptions: { box: 'border-box' } })
  // No upper cap — the gauge should fill however much space its card
  // actually has (border-box measurement + overflow:hidden on the measured
  // wrapper already rule out any feedback-loop growth, so a cap here was
  // only ever making the circle look small inside a big default card).
  const scale = compact || !availableW || !availableH ? 1 : Math.max(0.3, Math.min(availableW / size, availableH / size))
  const displaySize = compact ? 40 : size * scale

  return (
    <div
      className={compact ? undefined : 'cmom-card cmom-gauge-card'}
      style={
        compact
          ? { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }
          : {
              padding: 'var(--cmom-space-3)',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 8,
              height: '100%',
              boxSizing: 'border-box',
            }
      }
    >
      {!compact && <div style={{ fontSize: 11, fontWeight: 600, opacity: 0.75, alignSelf: 'flex-start' }}>{title}</div>}
      <div
        ref={compact ? undefined : svgWrapRef}
        style={
          compact
            ? undefined
            : { flex: '1 1 auto', minHeight: 0, width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }
        }
      >
      <svg width={displaySize} height={displaySize} viewBox={`0 0 ${size} ${size}`}>
        <defs>
          <clipPath id={clipId}>
            <circle cx={cx} cy={cy} r={r} />
          </clipPath>
        </defs>
        <circle cx={cx} cy={cy} r={r} fill="var(--cmom-surface-elevated, #1c2229)" stroke="var(--cmom-border-strong, #3a424c)" strokeWidth={2} />
        <rect x={0} y={fillTop} width={size} height={size - fillTop} fill={fillColor} opacity={0.85} clipPath={`url(#${clipId})`} />
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="var(--cmom-border-strong, #3a424c)" strokeWidth={2} />
      </svg>
      </div>
      {compact ? (
        <div style={{ fontSize: 10, opacity: 0.75, textAlign: 'center' }}>{levelValue.toFixed(1)} {levelUnit}</div>
      ) : (
        <div style={{ textAlign: 'center' }}>
          <div className="cmom-value">
            {levelValue.toFixed(1)} <span style={{ fontSize: '0.55em', fontWeight: 500, opacity: 0.7 }}>{levelUnit}</span>
          </div>
          <div style={{ fontSize: 10, opacity: 0.6, marginTop: 2 }}>
            of {diameterValue.toFixed(1)} {diameterUnit} diameter ({percent.toFixed(0)}%)
          </div>
        </div>
      )}
    </div>
  )
}
