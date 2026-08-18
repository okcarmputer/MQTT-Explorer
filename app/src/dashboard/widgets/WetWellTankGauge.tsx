import * as React from 'react'
import { severityColors } from '../config'

interface Props {
  title: string
  volumeGallons: number | null
  diameterFt: number | null
  depthFt: number | null
  currentLevelFt: number | null
  material: string | null
}

/**
 * Cylindrical wet well depiction sized from GIS data (SPUMPSTA_H.WetWellVolume,
 * plus diameter/depth when parseable out of freeform Comments — see
 * parseDiameterAndDepthFt in src/sqlReporting.ts) and filled to the live
 * "Wet Well Level" analog reading.
 *
 * Fill percent prefers depthFt (actual well depth) as the 0-100% reference,
 * since that's what the level reading is physically measured against. When
 * depth isn't known but volume is, there's no way to know how full the well
 * is from level alone (a level of "2 ft" means nothing without knowing the
 * well's total depth) — so the gauge still renders the cylinder and shows the
 * volume/level numbers, but doesn't attempt a fill percentage.
 *
 * When nothing at all is configured for this station, renders a plain grey
 * "generic" cylinder and says so explicitly rather than silently omitting
 * the widget.
 */
export default function WetWellTankGauge({ title, volumeGallons, diameterFt, depthFt, currentLevelFt, material }: Props) {
  const hasAnyData = volumeGallons !== null || diameterFt !== null || depthFt !== null || currentLevelFt !== null
  const hasFillRatio = depthFt !== null && depthFt > 0 && currentLevelFt !== null && !Number.isNaN(currentLevelFt)

  const percent = hasFillRatio ? Math.max(0, Math.min(100, (currentLevelFt! / depthFt!) * 100)) : null

  const width = 140
  const height = 200
  const tankTop = 18
  const tankBottom = height - 26
  const tankHeight = tankBottom - tankTop
  const tankWidth = 84
  const cx = width / 2
  const ellipseRy = 12

  const fillColor =
    percent === null
      ? 'var(--cmom-border-strong, #3a424c)'
      : percent >= 90
        ? severityColors.CRITICAL
        : percent >= 70
          ? severityColors.MODERATE
          : severityColors.OK

  const fillFrac = percent === null ? 0 : percent / 100
  const fillTopY = tankBottom - fillFrac * tankHeight
  const clipId = React.useId()

  return (
    <div className="cmom-card cmom-gauge-card" style={{ padding: 'var(--cmom-space-3)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
      <div style={{ fontSize: 11, fontWeight: 600, opacity: 0.75, alignSelf: 'flex-start' }}>{title}</div>

      <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
        <defs>
          <clipPath id={clipId}>
            <rect x={cx - tankWidth / 2} y={tankTop} width={tankWidth} height={tankHeight} />
          </clipPath>
        </defs>

        <rect
          x={cx - tankWidth / 2}
          y={tankTop}
          width={tankWidth}
          height={tankHeight}
          fill="var(--cmom-surface-elevated, #1c2229)"
          stroke="var(--cmom-border-strong, #3a424c)"
          strokeWidth={2}
        />

        {hasAnyData && (
          <rect
            x={cx - tankWidth / 2}
            y={fillTopY}
            width={tankWidth}
            height={tankBottom - fillTopY}
            fill={fillColor}
            opacity={0.85}
            clipPath={`url(#${clipId})`}
          />
        )}

        <ellipse cx={cx} cy={tankTop} rx={tankWidth / 2} ry={ellipseRy} fill="var(--cmom-surface, #262c34)" stroke="var(--cmom-border-strong, #3a424c)" strokeWidth={2} />

        {hasAnyData && percent !== null && percent > 0 && (
          <ellipse cx={cx} cy={fillTopY} rx={tankWidth / 2} ry={ellipseRy} fill={fillColor} opacity={0.95} />
        )}

        <ellipse cx={cx} cy={tankBottom} rx={tankWidth / 2} ry={ellipseRy} fill="var(--cmom-border, #333a42)" stroke="var(--cmom-border-strong, #3a424c)" strokeWidth={2} />

        <text
          x={cx}
          y={(tankTop + tankBottom) / 2}
          textAnchor="middle"
          fontSize={18}
          fontWeight={700}
          fill={percent !== null && percent > 45 ? '#ffffff' : 'var(--cmom-text, #e6e9ec)'}
        >
          {percent !== null ? `${Math.round(percent)}%` : 'N/A'}
        </text>
      </svg>

      <div style={{ textAlign: 'center', fontSize: 11, lineHeight: 1.5 }}>
        {!hasAnyData ? (
          <div style={{ opacity: 0.7 }}>
            Generic wet well — no dimensions, volume, or level configured for this station yet.
          </div>
        ) : (
          <>
            <div className="cmom-value">
              {currentLevelFt !== null ? `${currentLevelFt.toFixed(2)} ft` : '— ft'}
              {depthFt !== null && <span style={{ fontWeight: 500, opacity: 0.7 }}> of {depthFt.toFixed(1)} ft depth</span>}
            </div>
            {!hasFillRatio && depthFt === null && (
              <div style={{ opacity: 0.6, marginTop: 2 }}>Well depth not known — fill % unavailable</div>
            )}
            {diameterFt !== null && <div style={{ opacity: 0.6, marginTop: 2 }}>{diameterFt.toFixed(1)} ft diameter</div>}
            {volumeGallons !== null && (
              <div style={{ opacity: 0.6, marginTop: 2 }}>{Math.round(volumeGallons).toLocaleString()} gal capacity</div>
            )}
            {material && <div style={{ opacity: 0.6, marginTop: 2 }}>{material}</div>}
          </>
        )}
      </div>
    </div>
  )
}
