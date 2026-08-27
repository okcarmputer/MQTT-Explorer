import React, { memo, useCallback, useMemo } from 'react'
import { useResizeDetector } from 'react-resize-detector'
import { emphasize, useTheme } from '@mui/material/styles'
import { XYChart, Axis, Grid, LineSeries, GlyphSeries } from '@visx/xychart'
import DateFormatter from '../helper/DateFormatter'
import NoData from './NoData'
import NumberFormatter from '../helper/NumberFormatter'
import TooltipComponent from './TooltipComponent'
import { mapCurveType } from './mapCurveType'
import { PlotCurveTypes } from '../../reducers/Charts'
import { Point, Tooltip } from './Model'
import { useCustomXDomain } from './effects/useCustomXDomain'
import { useCustomYDomain } from './effects/useCustomYDomain'

const abbreviate = require('number-abbreviate')

export interface Props {
  data: Array<{ x: number; y: number }>
  interpolation?: PlotCurveTypes
  range?: [number?, number?]
  timeRangeStart?: number
  // When true (with timeRangeStart set), centers "now" at the horizontal
  // midpoint instead of right-aligning to the latest data point.
  centerNow?: boolean
  color?: string
  // Overrides the axis/grid color that otherwise comes from the global MUI
  // theme (theme.palette.text.secondary/divider). Needed by callers that
  // force a dark background regardless of the app's light/dark theme
  // setting (the CMOM dashboard's TrendPanel) — without this, axis text can
  // render near-invisible (dark grey theme text on a near-black background).
  axisColor?: string
  gridColor?: string
  // Ring drawn around each point glyph when the trend line is on, so points
  // read as distinct dots on top of the (same-color) line instead of just a
  // thicker patch of it. Defaults to the MUI theme's paper background, but
  // callers forcing a non-MUI background (e.g. the CMOM dashboard's dark
  // cards) should pass their own card background color here to match.
  pointRingColor?: string
  // When true, the chart fills its container's actual height (tracked via
  // useResizeDetector, same mechanism already used for width) instead of
  // the fixed 150px default — for callers inside a user-resizable panel
  // (see dashboard/widgets/PanelGrid.tsx) where "drag the panel taller"
  // should visibly grow the chart. Off by default so every other existing
  // caller (the Explorer sidebar's ChartPanel, etc.) is unaffected.
  fillHeight?: boolean
}

const CHART_HEIGHT = 280
const MIN_FILL_HEIGHT = 80
const MAX_FILL_HEIGHT = 900
const CHART_MARGIN = { top: 10, right: 10, bottom: 30, left: 50 }

export default memo((props: Props) => {
  const theme = useTheme()
  const [tooltip, setTooltip] = React.useState<Tooltip | undefined>()
  const [hoveredPoint, setHoveredPoint] = React.useState<Point | undefined>()
  // Points only by default — a line drawn straight across a real gap in
  // reporting (device offline, etc.) reads as "here's what happened in
  // between," which is misleading. Opt-in per chart instance.
  const [showTrendLine, setShowTrendLine] = React.useState(false)
  // `observerOptions.box: 'border-box'` matters here specifically: the
  // measured div's *rendered* content (the XYChart <svg>, sized from this
  // same measurement) must never itself be able to influence what gets
  // measured next render, or a fillHeight chart in a panel whose height
  // resolution is even slightly indirect can spiral — each render's SVG
  // height nudges the observed box a hair taller, which raises next
  // render's height, which raises the SVG again. Pinning the observed box
  // to border-box (fixed by this element's own CSS height, never by its
  // children's layout) and hard-clamping the result below are both
  // independent guards against that: growth can never compound past
  // MAX_FILL_HEIGHT regardless of what's driving it.
  const { width = 300, height: measuredHeight, ref } = useResizeDetector({ observerOptions: { box: 'border-box' } })
  const chartHeight = props.fillHeight
    ? Math.min(Math.max(measuredHeight ?? CHART_HEIGHT, MIN_FILL_HEIGHT), MAX_FILL_HEIGHT)
    : CHART_HEIGHT
  const chartContainerRef = React.useRef<HTMLDivElement>(null)
  const plotClipId = React.useId()

  const hintFormatter = React.useCallback(
    (point: any) => [
      { title: <b>Time</b>, value: <DateFormatter timeFirst date={new Date(point.x)} /> },
      { title: <b>Value</b>, value: <NumberFormatter value={point.y} /> },
      { title: <b>Raw</b>, value: <span>{point.y}</span> },
    ],
    []
  )

  const onMouseLeave = React.useCallback(() => {
    setTooltip(undefined)
    setHoveredPoint(undefined)
  }, [])

  const showTooltip = React.useCallback(
    (point: Point, clientX?: number, clientY?: number) => {
      if (!chartContainerRef.current) {
        return
      }
      setHoveredPoint(point)
      setTooltip({ point, value: hintFormatter(point), element: chartContainerRef.current, clientX, clientY })
    },
    [hintFormatter]
  )

  // Resolves a series pointer-event's params to an absolute screen position
  // for the tooltip. `params.event` is the real pointer event, whose
  // clientX/clientY are already viewport-relative — use those directly.
  // (`params.svgPoint`, despite the name, is NOT a viewport position: visx's
  // localPoint() returns coordinates in the <svg>'s own local/user space, so
  // adding it to the container's getBoundingClientRect() produced a bogus
  // point — which is why the tooltip used to render pinned near the
  // top-left corner of the whole window instead of next to the cursor.)
  const resolveTooltipPosition = React.useCallback(
    (params: any): { clientX?: number; clientY?: number } => {
      const nativeEvent = params?.event as { clientX?: number; clientY?: number } | undefined
      return { clientX: nativeEvent?.clientX, clientY: nativeEvent?.clientY }
    },
    []
  )

  const paletteColor = theme.palette.mode === 'light' ? theme.palette.secondary.dark : theme.palette.primary.light
  const color = props.color ? props.color : paletteColor
  const axisColor = props.axisColor ?? theme.palette.text.secondary
  const gridColor = props.gridColor ?? theme.palette.divider

  const highlightSelectedPoint = useCallback(
    (point: Point) => {
      const highlight = hoveredPoint && hoveredPoint.x === point.x && hoveredPoint.y === point.y
      return highlight ? emphasize(color, 0.8) : color
    },
    [hoveredPoint, color]
  )

  const formatYAxis = useCallback((num: number) => abbreviate(num), [])

  // No seconds — at the zoom levels these charts are actually used at,
  // second-level precision isn't meaningful and the extra digits just eat
  // horizontal space between ticks.
  const formatXAxis = useCallback((timestamp: number) => {
    const date = new Date(timestamp)
    const hours = date.getHours().toString().padStart(2, '0')
    const minutes = date.getMinutes().toString().padStart(2, '0')
    return `${hours}:${minutes}`
  }, [])

  const autoXDomain = useCustomXDomain(props)
  const autoYDomain = useCustomYDomain(props)

  // Drag-to-pan: dragging the plot slides the x-axis window left/right and
  // (via the same gesture's vertical movement) the y-axis window up/down —
  // so a value sitting near the top/bottom edge can be dragged into view.
  // Both reset back to the auto-calculated domain whenever the selected time
  // range changes (new timeRangeStart/centerNow), the underlying data domain
  // changes, or on double-click.
  const [panDomain, setPanDomain] = React.useState<[number, number] | undefined>(undefined)
  const [panYDomain, setPanYDomain] = React.useState<[number, number] | undefined>(undefined)
  const dragState = React.useRef<{
    startClientX: number
    startClientY: number
    startDomain: [number, number]
    startYDomain: [number, number]
  } | null>(null)
  const [isDragging, setIsDragging] = React.useState(false)

  // Resets both pan/zoom windows together, but only on things that mean
  // "the user picked a different view" (time range, or an explicitly fixed
  // range prop changing) — never merely because new data arrived. Auto-
  // scaled charts (Velocity/Flow, unlike the range-pinned Level chart)
  // recompute autoYDomain on every incoming point, so resetting off of it
  // directly used to snap the Y pan back to the live edge on every message,
  // which read as "the Y axis won't stay where I dragged it."
  React.useEffect(() => {
    setPanDomain(undefined)
    setPanYDomain(undefined)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.timeRangeStart, props.centerNow, props.range?.[0], props.range?.[1]])

  const xDomain = panDomain ?? autoXDomain
  const yDomain = panYDomain ?? autoYDomain

  const plotWidth = Math.max((width || 300) - CHART_MARGIN.left - CHART_MARGIN.right, 1)
  const plotHeight = Math.max(chartHeight - CHART_MARGIN.top - CHART_MARGIN.bottom, 1)

  const onPanStart = React.useCallback(
    (clientX: number, clientY: number) => {
      if (!xDomain) {
        return
      }
      dragState.current = { startClientX: clientX, startClientY: clientY, startDomain: xDomain, startYDomain: yDomain }
      setIsDragging(true)
    },
    [xDomain, yDomain]
  )

  React.useEffect(() => {
    if (!isDragging) {
      return
    }

    const onMove = (event: MouseEvent) => {
      if (!dragState.current) {
        return
      }
      const { startClientX, startClientY, startDomain, startYDomain } = dragState.current
      const msPerPixel = (startDomain[1] - startDomain[0]) / plotWidth
      const deltaMs = -(event.clientX - startClientX) * msPerPixel
      setPanDomain([startDomain[0] + deltaMs, startDomain[1] + deltaMs])

      const yUnitsPerPixel = (startYDomain[1] - startYDomain[0]) / plotHeight
      // Screen Y grows downward, so dragging down (positive deltaY) should
      // move the visible window down too, i.e. subtract from the domain.
      const deltaY = (event.clientY - startClientY) * yUnitsPerPixel
      setPanYDomain([startYDomain[0] + deltaY, startYDomain[1] + deltaY])
    }

    const onUp = () => {
      dragState.current = null
      setIsDragging(false)
    }

    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
  }, [isDragging, plotWidth, plotHeight])

  // Scroll-wheel zoom, centered on the cursor's position in time — the time
  // range buttons (TimeRangeToggle) only offer fixed presets; this is the
  // actual "zoom in and adjust the timeline" interaction. Needs a native
  // (non-React) wheel listener with {passive:false}: React makes onWheel
  // passive by default, which silently no-ops preventDefault() and lets the
  // page/panel scroll underneath the chart instead of zooming it.
  React.useEffect(() => {
    const el = chartContainerRef.current
    if (!el) {
      return
    }

    const onWheel = (event: WheelEvent) => {
      event.preventDefault()

      // Shift+scroll zooms the Y axis (centered on the cursor's value)
      // instead of the X/time axis, so a value near the top/bottom edge can
      // be zoomed into view without disturbing the visible time window.
      if (event.shiftKey) {
        const domain = panYDomain ?? autoYDomain
        const rect = el.getBoundingClientRect()
        const cursorY = event.clientY - rect.top - CHART_MARGIN.top
        const fraction = Math.max(0, Math.min(1, cursorY / plotHeight))
        const [bottom, top] = domain
        // Screen Y grows downward, but the domain's low value is at the
        // bottom of the plot, so invert the fraction.
        const cursorValue = top - fraction * (top - bottom)

        const zoomFactor = event.deltaY > 0 ? 1.15 : 1 / 1.15
        const newBottom = cursorValue - (cursorValue - bottom) * zoomFactor
        const newTop = cursorValue + (top - cursorValue) * zoomFactor
        // Only guard against a fully collapsed/inverted window — no minimum
        // span, so zooming in keeps going as far as the user keeps scrolling.
        if (!(newTop > newBottom)) {
          return
        }
        setPanYDomain([newBottom, newTop])
        return
      }

      const domain = panDomain ?? autoXDomain
      if (!domain) {
        return
      }

      const rect = el.getBoundingClientRect()
      const cursorX = event.clientX - rect.left - CHART_MARGIN.left
      const fraction = Math.max(0, Math.min(1, cursorX / plotWidth))
      const [start, end] = domain
      const cursorTime = start + fraction * (end - start)

      // deltaY > 0 (scroll down) zooms out, < 0 (scroll up) zooms in.
      const zoomFactor = event.deltaY > 0 ? 1.15 : 1 / 1.15
      const newStart = cursorTime - (cursorTime - start) * zoomFactor
      const newEnd = cursorTime + (end - cursorTime) * zoomFactor
      // Only guard against a fully collapsed/inverted window (was previously
      // floored at a 1s span, which stopped the user from zooming in any
      // further) — no minimum otherwise, so zooming in keeps going as far as
      // the user keeps scrolling.
      if (!(newEnd > newStart)) {
        return
      }
      setPanDomain([newStart, newEnd])
    }

    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [panDomain, autoXDomain, plotWidth, panYDomain, autoYDomain, plotHeight])

  const { data } = props
  const hasData = data.length > 0
  const dummyDomain: [number, number] = [-1, 1]
  const dummyData = [{ x: -2, y: -2 }]

  const accessors = useMemo(
    () => ({
      xAccessor: (d: Point) => d.x,
      yAccessor: (d: Point) => d.y,
    }),
    []
  )

  // Splits the (time-sorted) data into segments wherever the gap between
  // consecutive points is unusually large relative to this series' own
  // typical spacing — a device that went offline for hours shouldn't get a
  // trend line drawn straight across the silence when the trend line is
  // turned on. Threshold is derived per-chart (median gap × 4, floored at
  // 1 minute) rather than a fixed constant, since "normal" spacing varies
  // hugely across topics (seconds vs. many minutes between readings).
  const lineSegments = useMemo(() => {
    if (!showTrendLine || data.length < 2) {
      return [] as Point[][]
    }
    const sorted = [...data].sort((a, b) => a.x - b.x)
    const gaps = sorted.slice(1).map((d, i) => d.x - sorted[i].x)
    const sortedGaps = [...gaps].sort((a, b) => a - b)
    const medianGap = sortedGaps[Math.floor(sortedGaps.length / 2)] ?? 0
    const gapThreshold = Math.max(medianGap * 4, 60000)

    const segments: Point[][] = [[sorted[0]]]
    for (let i = 1; i < sorted.length; i++) {
      if (sorted[i].x - sorted[i - 1].x > gapThreshold) {
        segments.push([])
      }
      segments[segments.length - 1].push(sorted[i])
    }
    return segments.filter(segment => segment.length > 1)
  }, [data, showTrendLine])

  return (
    <div style={props.fillHeight ? { height: '100%', maxHeight: MAX_FILL_HEIGHT, overflow: 'hidden' } : undefined}>
      <div
        ref={ref}
        style={{
          height: props.fillHeight ? '100%' : `${CHART_HEIGHT}px`,
          maxHeight: props.fillHeight ? MAX_FILL_HEIGHT : undefined,
          width: '100%',
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        {data.length === 0 ? <NoData /> : null}
        <div
          ref={chartContainerRef}
          onMouseDown={e => onPanStart(e.clientX, e.clientY)}
          onDoubleClick={() => {
            setPanDomain(undefined)
            setPanYDomain(undefined)
          }}
          title="Drag to pan (both axes), scroll to zoom time, shift+scroll to zoom value, double-click to reset"
          style={{ cursor: isDragging ? 'grabbing' : 'grab' }}
        >
          <XYChart
            width={width || 300}
            height={chartHeight}
            margin={CHART_MARGIN}
            xScale={{ type: 'time', domain: xDomain || dummyDomain }}
            yScale={{ type: 'linear', domain: hasData ? yDomain : dummyDomain }}
            onPointerOut={onMouseLeave}
          >
            <Grid rows columns={false} stroke={gridColor} strokeOpacity={0.3} />
            <Axis
              orientation="left"
              numTicks={5}
              tickFormat={formatYAxis}
              stroke={axisColor}
              tickStroke={axisColor}
              tickLabelProps={() => ({ fontSize: 11, fill: axisColor })}
            />
            <Axis
              orientation="bottom"
              numTicks={4}
              tickFormat={formatXAxis}
              stroke={axisColor}
              tickStroke={axisColor}
              tickLabelProps={() => ({ fontSize: 10, fill: axisColor, textAnchor: 'middle' })}
            />
            <defs>
              {/* Keeps the line/points from visibly spilling past the grid
                  edges (e.g. while panned/zoomed) — clips to the inner plot
                  rect, the same box the axes/grid are drawn in. */}
              <clipPath id={plotClipId}>
                <rect
                  x={CHART_MARGIN.left}
                  y={CHART_MARGIN.top}
                  width={plotWidth}
                  height={plotHeight}
                />
              </clipPath>
            </defs>
            <g clipPath={`url(#${plotClipId})`}>
              {/* One LineSeries per contiguous segment (see lineSegments) —
                  only rendered when the trend line is switched on, and never
                  spans a gap larger than this series' own typical spacing. */}
              {showTrendLine &&
                lineSegments.map((segment, i) => (
                  <LineSeries
                    key={i}
                    dataKey={`line-${i}`}
                    data={segment}
                    xAccessor={accessors.xAccessor}
                    yAccessor={accessors.yAccessor}
                    stroke={color}
                    strokeWidth={2}
                    curve={mapCurveType(props.interpolation)}
                    onPointerMove={params => {
                      const point = (params as any)?.datum as Point | undefined
                      if (point) {
                        const { clientX, clientY } = resolveTooltipPosition(params)
                        showTooltip(point, clientX, clientY)
                      }
                    }}
                  />
                ))}
              <GlyphSeries
                dataKey="points"
                data={hasData ? data : dummyData}
                xAccessor={accessors.xAccessor}
                yAccessor={accessors.yAccessor}
                onPointerMove={params => {
                  const point = (params as any)?.datum as Point | undefined
                  if (point) {
                    const { clientX, clientY } = resolveTooltipPosition(params)
                    showTooltip(point, clientX, clientY)
                  }
                }}
                onPointerOut={onMouseLeave}
                renderGlyph={glyphProps => {
                  const point = glyphProps.datum as Point
                  const pointColor = highlightSelectedPoint(point)
                  // The trend line is drawn in this same series color, so a
                  // point sitting exactly on the line (same x/y it was
                  // plotted from) used to be visually swallowed by the line
                  // underneath it — same color, barely poking out past the
                  // stroke width. A contrasting ring makes every point read
                  // as a distinct dot on top of the line rather than just a
                  // thicker patch of it.
                  return (
                    <circle
                      cx={glyphProps.x}
                      cy={glyphProps.y}
                      r={showTrendLine ? 3.5 : 3}
                      fill={pointColor}
                      stroke={showTrendLine ? props.pointRingColor ?? theme.palette.background.paper : 'none'}
                      strokeWidth={showTrendLine ? 1.5 : 0}
                    />
                  )
                }}
              />
            </g>
          </XYChart>
        </div>
        <label
          style={{
            position: 'absolute',
            top: 2,
            right: 4,
            fontSize: 10,
            opacity: 0.75,
            display: 'flex',
            alignItems: 'center',
            gap: 3,
            cursor: 'pointer',
            userSelect: 'none',
          }}
          title="Draw a connecting line between points (never across a large gap in reporting)"
        >
          <input
            type="checkbox"
            checked={showTrendLine}
            onChange={e => setShowTrendLine(e.target.checked)}
            style={{ margin: 0, cursor: 'pointer' }}
          />
          Trend line
        </label>
        {/* Custom tooltip outside of visx to maintain exact same appearance */}
        <TooltipComponent tooltip={tooltip} />
      </div>
    </div>
  )
})
