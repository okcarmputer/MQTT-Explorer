import * as React from 'react'
import { useResizeDetector } from 'react-resize-detector'
import { severityColors } from '../config'

interface Props {
  title: string
  // Feet — the manhole's own physical depth (from manholeData.ts /
  // useManholeInfo), the 0-100% reference for this gauge, same role
  // depthFt plays in WetWellTankGauge.
  manholeDepthFt: number | null
  // The pipe's real diameter and the live level reading, both in the same
  // unit (normally inches, matching flowChannels' level channel config) —
  // the level sensor sits at the top of the manhole and reads however much
  // water is standing above the pipe invert, so this is NOT "percent of
  // pipe" the way PipeGauge shows it; it's a real depth that can exceed the
  // pipe's diameter (surcharge) and keep rising toward the manhole rim.
  pipeDiameterValue: number | null
  pipeDiameterUnit: string
  levelValue: number | null
  levelUnit: string
}

const VIEWBOX_W = 140
const VIEWBOX_H = 260

/**
 * "Man Hole View" — an alternative to PipeGauge's simple pipe-fill circle
 * (see the toggle in FlowMonitorDetail's Pipe card). Draws the manhole shaft
 * to scale (from manholeDepthFt) with the pipe as a circle sitting at its
 * invert (bottom), and the live level reading filled from the bottom up —
 * mirroring the physical setup this was built for: the level sensor reads
 * from the top of the manhole, so a full pipe is only ~half this gauge, and
 * a reading past the pipe's own diameter means the pipe has surcharged and
 * water is backing up into the manhole itself.
 */
export default function ManholeGauge({ title, manholeDepthFt, pipeDiameterValue, pipeDiameterUnit, levelValue, levelUnit }: Props) {
  const hasDepth = manholeDepthFt !== null && manholeDepthFt > 0
  const hasPipe = pipeDiameterValue !== null && pipeDiameterValue > 0
  const hasLevel = levelValue !== null && !Number.isNaN(levelValue)

  const shaftTop = 18
  const shaftBottom = VIEWBOX_H - 26
  const shaftHeight = shaftBottom - shaftTop
  const shaftWidth = 74
  const cx = VIEWBOX_W / 2
  const x0 = cx - shaftWidth / 2
  const x1 = cx + shaftWidth / 2

  // Feet-per-pixel scale, derived from the manhole's own depth — everything
  // else (pipe circle radius, fill height) is drawn to this same scale so
  // the pipe reads correctly small relative to how deep the manhole
  // actually is, not just relative to the fixed viewBox.
  const perFootScale = hasDepth ? shaftHeight / manholeDepthFt! : null

  // Level/diameter arrive in inches (this app's only configured level unit
  // — see flowChannels in config.ts) — convert to feet to share the
  // manhole's own per-foot scale rather than assuming a unit match.
  const toFeet = (value: number, unit: string) => (unit.toLowerCase().startsWith('in') ? value / 12 : value)
  const pipeDiameterFt = hasPipe ? toFeet(pipeDiameterValue!, pipeDiameterUnit) : null
  const levelFt = hasLevel ? toFeet(levelValue!, levelUnit) : null

  const pipeRadiusPx = perFootScale && pipeDiameterFt ? Math.max(4, Math.min(shaftWidth / 2 - 4, (pipeDiameterFt / 2) * perFootScale)) : null
  const pipeCy = pipeRadiusPx !== null ? shaftBottom - pipeRadiusPx : null

  const isSurcharged = hasPipe && hasLevel && pipeDiameterFt !== null && levelFt !== null && levelFt > pipeDiameterFt

  const fillFt = levelFt !== null ? Math.max(0, Math.min(manholeDepthFt ?? levelFt, levelFt)) : 0
  const fillTopY = perFootScale ? shaftBottom - fillFt * perFootScale : shaftBottom
  const fillColor = isSurcharged ? severityColors.CRITICAL : severityColors.OK

  const clipId = React.useId()

  const { width: availableW, height: availableH, ref: svgWrapRef } = useResizeDetector({ observerOptions: { box: 'border-box' } })
  const scale = !availableW || !availableH ? 1 : Math.max(0.35, Math.min(availableW / VIEWBOX_W, availableH / VIEWBOX_H))
  const displayWidth = VIEWBOX_W * scale
  const displayHeight = VIEWBOX_H * scale

  return (
    <div className="cmom-card cmom-gauge-card" style={{ padding: 'var(--cmom-space-3)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, height: '100%', boxSizing: 'border-box' }}>
      <div style={{ fontSize: 11, fontWeight: 600, opacity: 0.75, alignSelf: 'flex-start' }}>{title}</div>

      <div ref={svgWrapRef} style={{ flex: '1 1 auto', minHeight: 0, width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
        <svg width={displayWidth} height={displayHeight} viewBox={`0 0 ${VIEWBOX_W} ${VIEWBOX_H}`}>
          <defs>
            <clipPath id={clipId}>
              <rect x={x0} y={shaftTop} width={shaftWidth} height={shaftHeight} />
            </clipPath>
          </defs>

          {/* Manhole shaft outline */}
          <rect x={x0} y={shaftTop} width={shaftWidth} height={shaftHeight} fill="var(--cmom-surface-elevated, #1c2229)" stroke="var(--cmom-border-strong, #3a424c)" strokeWidth={2} />

          {/* Water level, filled from the bottom up (the level sensor at the
              top reads depth from the invert, not "percent of manhole") */}
          {hasLevel && (
            <rect x={x0} y={fillTopY} width={shaftWidth} height={shaftBottom - fillTopY} fill={fillColor} opacity={0.55} clipPath={`url(#${clipId})`} />
          )}

          {/* Pipe cross-section at the invert, drawn over the fill so its
              outline stays visible whether submerged or not. */}
          {pipeRadiusPx !== null && pipeCy !== null && (
            <circle cx={cx} cy={pipeCy} r={pipeRadiusPx} fill="var(--cmom-border, #333a42)" stroke="var(--cmom-text-primary, #e6e9ec)" strokeWidth={1.5} />
          )}

          <rect x={x0} y={shaftTop} width={shaftWidth} height={shaftHeight} fill="none" stroke="var(--cmom-border-strong, #3a424c)" strokeWidth={2} />

          {isSurcharged && (
            <text x={cx} y={shaftTop + 14} textAnchor="middle" fontSize={11} fontWeight={700} fill={severityColors.CRITICAL}>
              SURCHARGE
            </text>
          )}
        </svg>
      </div>

      <div style={{ textAlign: 'center', fontSize: 11, lineHeight: 1.5 }}>
        {!hasDepth ? (
          <div style={{ opacity: 0.7 }}>No manhole depth on record for this site yet.</div>
        ) : (
          <>
            <div className="cmom-value">{hasLevel ? `${levelValue!.toFixed(1)} ${levelUnit} level` : '— level'}</div>
            {isSurcharged && <div style={{ color: severityColors.CRITICAL, marginTop: 2 }}>Above pipe crown — surcharged</div>}
            <div style={{ opacity: 0.75, marginTop: 4, display: 'flex', flexDirection: 'column', gap: 1 }}>
              {hasPipe && <div>Pipe: {pipeDiameterValue!.toFixed(1)} {pipeDiameterUnit} diameter</div>}
              <div>Manhole depth: {manholeDepthFt!.toFixed(1)} ft</div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
