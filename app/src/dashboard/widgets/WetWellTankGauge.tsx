import * as React from 'react'
import { useResizeDetector } from 'react-resize-detector'
import { severityColors } from '../config'

interface Props {
  title: string
  shape: 'cylinder' | 'rectangular' | null
  volumeGallons: number | null
  diameterFt: number | null
  depthFt: number | null
  lengthFt: number | null
  widthFt: number | null
  currentLevelFt: number | null
  material: string | null
  // Small, undecorated version for list cards (Pump Stations grid) — same
  // shape/fill geometry (the SVG's viewBox is unchanged; only its on-screen
  // display size shrinks), just without the card chrome, title, or the
  // dimensions/capacity text block, down to a compact level readout.
  compact?: boolean
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
export default function WetWellTankGauge({
  title,
  shape,
  volumeGallons,
  diameterFt,
  depthFt,
  lengthFt,
  widthFt,
  currentLevelFt,
  material,
  compact,
}: Props) {
  // Dimensions are "known" only when we have a real shape from the static
  // table / parsed comments — bare volume or a live level reading alone
  // isn't enough to draw a well-shaped tank, per the "say we don't have
  // dimensions yet" requirement.
  const hasDimensions = shape !== null && depthFt !== null
  const isRectangular = hasDimensions && shape === 'rectangular'
  const hasAnyData = hasDimensions || volumeGallons !== null || currentLevelFt !== null
  const hasFillRatio = depthFt !== null && depthFt > 0 && currentLevelFt !== null && !Number.isNaN(currentLevelFt)

  const percent = hasFillRatio ? Math.max(0, Math.min(100, (currentLevelFt! / depthFt!) * 100)) : null

  // Intrinsic/viewBox size — bumped up from the original 140x200 so the
  // gauge starts out bigger by default. The rendered on-screen size (see
  // displayWidth/displayHeight below) scales uniformly off this for the
  // non-compact case, so it grows with its panel without distorting.
  const width = 170
  const height = 260
  // Rectangular wells get extra headroom (isoDy pushes the top face upward)
  // and the box is shifted left (see cx below) to leave room for the
  // isometric offset (isoDx) on the right without clipping.
  const tankTop = isRectangular ? 30 : 18
  const tankBottom = height - 26
  const tankHeight = tankBottom - tankTop
  const ellipseRy = 12

  // Feet-to-pixel scale factor, derived from depth (tankHeight is fixed by
  // the viewBox, and depth is the one dimension every well with known
  // dimensions has) — every other on-screen dimension below is this same
  // number of pixels per foot, so diameter/length/width all render
  // proportional to depth *and* to each other, instead of the old fixed
  // 84px-wide box that ignored the real dimensions entirely.
  const perFootScale = depthFt && depthFt > 0 ? tankHeight / depthFt : null

  // Front face width: diameter for a cylinder, length for a rectangular
  // well. Clamped so an extreme real-world ratio (very shallow-and-wide, or
  // very deep-and-narrow) can't collapse to nothing or blow out past the
  // card.
  const horizontalFt = isRectangular ? lengthFt : diameterFt
  const tankWidth =
    perFootScale && horizontalFt ? Math.max(30, Math.min(130, horizontalFt * perFootScale)) : isRectangular ? 74 : 84

  // Isometric offset drawing the width axis (depth-into-the-screen) for
  // rectangular wells — the front face alone (length x depth) can't show
  // width at all. Uses the same per-foot scale as tankWidth/tankHeight so
  // width is to-scale against both of them, not just eyeballed relative to
  // length. The isometric projection foreshortens it (half the true length,
  // per the standard ~30 degree iso angle) and it's still clamped to keep
  // the box from running off the card on a very wide well.
  const widthPx = perFootScale && widthFt ? widthFt * perFootScale : null
  const isoDx = isRectangular ? Math.max(8, Math.min(46, (widthPx ?? 20) * 0.5)) : 0
  const isoDy = isRectangular ? -Math.max(6, Math.min(34, (widthPx ?? 20) * 0.37)) : 0

  const cx = isRectangular ? width / 2 - isoDx / 2 : width / 2

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
  const rightFaceClipId = React.useId()

  const x0 = cx - tankWidth / 2
  const x1 = cx + tankWidth / 2
  const topFacePoints = `${x0},${tankTop} ${x1},${tankTop} ${x1 + isoDx},${tankTop + isoDy} ${x0 + isoDx},${tankTop + isoDy}`
  const rightFacePoints = `${x1},${tankTop} ${x1},${tankBottom} ${x1 + isoDx},${tankBottom + isoDy} ${x1 + isoDx},${tankTop + isoDy}`

  // Non-compact: the rendered SVG size scales uniformly with whatever space
  // is actually available (e.g. a resizable PanelGrid panel) — the internal
  // coordinate system (viewBox, and every tank* measurement above) never
  // changes, only the browser's pixel scale-up/down of it, so resizing the
  // panel grows the *entire* gauge (frame, fill, text) together rather than
  // just redrawing lines inside a fixed box.
  // border-box + overflow:hidden on the measured wrapper (below) + a capped
  // scale range together guard against any possibility of the rendered SVG
  // (sized *from* this measurement) ever feeding back into a larger
  // measurement next render — the observed box is fixed by this div's own
  // CSS/flex sizing, never by its (clipped) child's size.
  const { width: availableW, height: availableH, ref: svgWrapRef } = useResizeDetector({ observerOptions: { box: 'border-box' } })
  // No upper cap — the tank should fill however much space its card
  // actually has (border-box measurement + overflow:hidden on the measured
  // wrapper already rule out any feedback-loop growth, so a cap here was
  // only ever making the tank look small inside a big default card).
  const scale = compact || !availableW || !availableH ? 1 : Math.max(0.35, Math.min(availableW / width, availableH / height))
  const displayWidth = compact ? 42 : width * scale
  const displayHeight = compact ? 60 : height * scale

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
      <svg width={displayWidth} height={displayHeight} viewBox={`0 0 ${width} ${height}`}>
        <defs>
          <clipPath id={clipId}>
            <rect x={x0} y={tankTop} width={tankWidth} height={tankHeight} />
          </clipPath>
          {isRectangular && (
            <clipPath id={rightFaceClipId}>
              <polygon points={rightFacePoints} />
            </clipPath>
          )}
        </defs>

        {/* Rectangular wells: an isometric box (front + top + right faces)
            so length, depth, AND width are all visible at once — a flat
            front-on rectangle alone can only ever show two of the three. */}
        {isRectangular && (
          <>
            <polygon
              points={rightFacePoints}
              fill="var(--cmom-border, #333a42)"
              stroke="var(--cmom-border-strong, #3a424c)"
              strokeWidth={2}
            />
            {hasAnyData && (
              <rect
                x={x1}
                y={fillTopY + isoDy}
                width={isoDx}
                height={tankBottom - fillTopY}
                fill={fillColor}
                opacity={0.6}
                clipPath={`url(#${rightFaceClipId})`}
              />
            )}
            <polygon
              points={topFacePoints}
              fill="var(--cmom-surface, #262c34)"
              stroke="var(--cmom-border-strong, #3a424c)"
              strokeWidth={2}
            />
          </>
        )}

        <rect
          x={x0}
          y={tankTop}
          width={tankWidth}
          height={tankHeight}
          fill="var(--cmom-surface-elevated, #1c2229)"
          stroke="var(--cmom-border-strong, #3a424c)"
          strokeWidth={2}
        />

        {hasAnyData && (
          <rect
            x={x0}
            y={fillTopY}
            width={tankWidth}
            height={tankBottom - fillTopY}
            fill={fillColor}
            opacity={0.85}
            clipPath={`url(#${clipId})`}
          />
        )}

        {/* Cylindrical wells get the top/bottom/fill-surface ellipses that
            sell the 3D tank look; rectangular wells use the isometric
            faces above instead. */}
        {!isRectangular && (
          <>
            <ellipse cx={cx} cy={tankTop} rx={tankWidth / 2} ry={ellipseRy} fill="var(--cmom-surface, #262c34)" stroke="var(--cmom-border-strong, #3a424c)" strokeWidth={2} />

            {hasAnyData && percent !== null && percent > 0 && (
              <ellipse cx={cx} cy={fillTopY} rx={tankWidth / 2} ry={ellipseRy} fill={fillColor} opacity={0.95} />
            )}

            <ellipse cx={cx} cy={tankBottom} rx={tankWidth / 2} ry={ellipseRy} fill="var(--cmom-border, #333a42)" stroke="var(--cmom-border-strong, #3a424c)" strokeWidth={2} />
          </>
        )}

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
      </div>

      {compact ? (
        <div style={{ fontSize: 10, opacity: 0.75, textAlign: 'center' }}>
          {currentLevelFt !== null ? `${currentLevelFt.toFixed(1)} ft` : hasDimensions ? '— ft' : 'no dims'}
        </div>
      ) : (
      <div style={{ textAlign: 'center', fontSize: 11, lineHeight: 1.5 }}>
        {!hasDimensions ? (
          <div style={{ opacity: 0.7 }}>
            We don&apos;t have dimensions for this wet well yet.
            {currentLevelFt !== null && (
              <div className="cmom-value" style={{ marginTop: 4 }}>
                {currentLevelFt.toFixed(2)} ft level
              </div>
            )}
          </div>
        ) : (
          <>
            <div className="cmom-value">
              {currentLevelFt !== null ? `${currentLevelFt.toFixed(2)} ft level` : '— ft level'}
            </div>
            {!hasFillRatio && (
              <div style={{ opacity: 0.6, marginTop: 2 }}>No live level reading — fill % unavailable</div>
            )}
            {/* All known dimensions, not just the ones the detected shape
                uses for its own fill math — diameter for cylinders, depth
                always, length/width for rectangular. */}
            <div style={{ opacity: 0.75, marginTop: 4, display: 'flex', flexDirection: 'column', gap: 1 }}>
              {diameterFt !== null && <div>Diameter: {diameterFt.toFixed(1)} ft</div>}
              {depthFt !== null && <div>Depth: {depthFt.toFixed(1)} ft</div>}
              {lengthFt !== null && <div>Length: {lengthFt.toFixed(1)} ft</div>}
              {widthFt !== null && <div>Width: {widthFt.toFixed(1)} ft</div>}
            </div>
            {volumeGallons !== null && (
              <div style={{ opacity: 0.6, marginTop: 2 }}>{Math.round(volumeGallons).toLocaleString()} gal capacity</div>
            )}
            {material && <div style={{ opacity: 0.6, marginTop: 2 }}>{material}</div>}
          </>
        )}
      </div>
      )}
    </div>
  )
}
