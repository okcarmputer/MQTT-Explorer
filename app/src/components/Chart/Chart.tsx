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
}

const CHART_HEIGHT = 150
const CHART_MARGIN = { top: 10, right: 10, bottom: 30, left: 50 }

export default memo((props: Props) => {
  const theme = useTheme()
  const [tooltip, setTooltip] = React.useState<Tooltip | undefined>()
  const [hoveredPoint, setHoveredPoint] = React.useState<Point | undefined>()
  const { width = 300, ref } = useResizeDetector()
  const chartContainerRef = React.useRef<HTMLDivElement>(null)

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

  const formatXAxis = useCallback((timestamp: number) => {
    const date = new Date(timestamp)
    const hours = date.getHours().toString().padStart(2, '0')
    const minutes = date.getMinutes().toString().padStart(2, '0')
    const seconds = date.getSeconds().toString().padStart(2, '0')
    return `${hours}:${minutes}:${seconds}`
  }, [])

  const autoXDomain = useCustomXDomain(props)
  const yDomain = useCustomYDomain(props)

  // Drag-to-pan: dragging the plot slides the x-axis window left/right.
  // Resets back to the auto-calculated domain whenever the selected time
  // range changes (new timeRangeStart/centerNow) or on double-click.
  const [panDomain, setPanDomain] = React.useState<[number, number] | undefined>(undefined)
  const dragState = React.useRef<{ startClientX: number; startDomain: [number, number] } | null>(null)
  const [isDragging, setIsDragging] = React.useState(false)

  React.useEffect(() => {
    setPanDomain(undefined)
  }, [props.timeRangeStart, props.centerNow])

  const xDomain = panDomain ?? autoXDomain

  const plotWidth = Math.max((width || 300) - CHART_MARGIN.left - CHART_MARGIN.right, 1)

  const onPanStart = React.useCallback(
    (clientX: number) => {
      if (!xDomain) {
        return
      }
      dragState.current = { startClientX: clientX, startDomain: xDomain }
      setIsDragging(true)
    },
    [xDomain]
  )

  React.useEffect(() => {
    if (!isDragging) {
      return
    }

    const onMove = (event: MouseEvent) => {
      if (!dragState.current) {
        return
      }
      const { startClientX, startDomain } = dragState.current
      const msPerPixel = (startDomain[1] - startDomain[0]) / plotWidth
      const deltaMs = -(event.clientX - startClientX) * msPerPixel
      setPanDomain([startDomain[0] + deltaMs, startDomain[1] + deltaMs])
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
  }, [isDragging, plotWidth])

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

  return (
    <div>
      <div ref={ref} style={{ height: `${CHART_HEIGHT}px`, width: '100%', position: 'relative' }}>
        {data.length === 0 ? <NoData /> : null}
        <div
          ref={chartContainerRef}
          onMouseDown={e => onPanStart(e.clientX)}
          onDoubleClick={() => setPanDomain(undefined)}
          title="Drag to pan, double-click to reset"
          style={{ cursor: isDragging ? 'grabbing' : 'grab' }}
        >
          <XYChart
            width={width || 300}
            height={CHART_HEIGHT}
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
            <LineSeries
              dataKey="line"
              data={hasData ? data : dummyData}
              xAccessor={accessors.xAccessor}
              yAccessor={accessors.yAccessor}
              stroke={color}
              strokeWidth={2}
              curve={mapCurveType(props.interpolation)}
              onPointerMove={datum => {
                if (datum && (datum as any).datum) {
                  const point = (datum as any).datum as Point
                  const nativeEvent = (datum as any).event as React.PointerEvent | undefined
                  showTooltip(point, nativeEvent?.clientX, nativeEvent?.clientY)
                }
              }}
            />
            <GlyphSeries
              dataKey="points"
              data={hasData ? data : dummyData}
              xAccessor={accessors.xAccessor}
              yAccessor={accessors.yAccessor}
              renderGlyph={glyphProps => {
                const point = glyphProps.datum as Point
                const pointColor = highlightSelectedPoint(point)
                return <circle cx={glyphProps.x} cy={glyphProps.y} r={3} fill={pointColor} />
              }}
            />
          </XYChart>
        </div>
        {/* Custom tooltip outside of visx to maintain exact same appearance */}
        <TooltipComponent tooltip={tooltip} />
      </div>
    </div>
  )
})
