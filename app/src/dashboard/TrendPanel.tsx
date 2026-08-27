import * as React from 'react'
import * as q from '../../../backend/src/Model'
import TopicPlot from '../components/TopicPlot'
import SeverityBadge from './SeverityBadge'
import TimeRangeToggle, { DEFAULT_TIME_RANGE, TimeRangeOption } from './TimeRangeToggle'
import { Severity, severityFromPayload } from './config'
import { hydrateMessageHistory } from '../helper/hydrateTopicHistory'
import { extractPayloadTimestamp } from '../helper/extractPayloadTimestamp'

// The default RingBuffer a fresh TreeNode is created with (see
// backend/src/Model/TreeNode.ts) caps at only 100 messages — fine for the
// live tree view, far too small for a trend chart. TopicChart.tsx (the
// sidebar chart panel) already works around this by cloning into a bigger
// buffer; dashboard panels read the node's buffer directly, so bump it in
// place instead.
const TREND_HISTORY_ITEMS = 2000
const TREND_HISTORY_BYTES = 2 * TREND_HISTORY_ITEMS * 10000

interface Props {
  title: string
  node: q.TreeNode<any>
  dotPath?: string
  unit?: string
  // Pulled via direct SQL query (see useSqlFlowBaseline), shown alongside the
  // MQTT-published baseline below — distinct source, so labeled separately.
  sqlBaselineText?: string
  // Fixes the Y axis to this range instead of auto-scaling to the visible
  // data's own min/max — used for the Level channel so its axis always
  // matches the pipe's real diameter (e.g. [0, 10]), rather than shrinking
  // to whatever narrow band of readings happens to be in view (which looks
  // wrong with sparse history: 1-2 points auto-scale to a near-arbitrary
  // range). Omit for channels that should keep auto-scaling (Velocity/Flow).
  range?: [number?, number?]
  // Overrides the shared 1min/5min/.../30min default and option list — used
  // by FlowMonitorDetail, which wants 1hr/2hr/6hr/24hr/All defaulting to 2hr
  // instead of the pump-station-oriented default below.
  timeRangeOptions?: TimeRangeOption[]
  defaultTimeRange?: string
  // When true, the card and its chart fill whatever height a resizable
  // parent panel gives them, instead of staying content-sized — see
  // dashboard/widgets/PanelGrid.tsx.
  fillHeight?: boolean
  // When true, skip this component's own card chrome (background/border)
  // and title row — for use as a PanelGrid panel's `content`, where
  // PanelGrid's own card + drag-handle title bar already provide both, so
  // rendering TrendPanel's normally would double them up (nested card
  // border, title shown twice).
  bare?: boolean
}

function currentValueText(node: q.TreeNode<any>, dotPath?: string): string | undefined {
  const message = node.message
  const payload = message?.payload?.toUnicodeString()
  if (!message || !payload) {
    return undefined
  }

  if (!dotPath) {
    return payload
  }

  try {
    const json = JSON.parse(payload)
    return json[dotPath] !== undefined ? String(json[dotPath]) : payload
  } catch {
    return payload
  }
}

/**
 * One chart card: title + severity (from a sibling `.../anomaly` topic, if
 * published), a 1h/24h/1w/1m/1y toggle, the trend itself, and a baseline
 * readout (from a sibling `.../baseline` topic, if published). Sized to a
 * quarter of the row rather than the full width.
 */
export default function TrendPanel({
  title,
  node,
  dotPath,
  unit,
  sqlBaselineText,
  range,
  timeRangeOptions,
  defaultTimeRange,
  fillHeight,
  bare,
}: Props) {
  const [timeRange, setTimeRange] = React.useState(defaultTimeRange ?? DEFAULT_TIME_RANGE)
  const [, setTick] = React.useState(0)

  React.useEffect(() => {
    node.messageHistory.setCapacity(TREND_HISTORY_ITEMS, TREND_HISTORY_BYTES)
    let cancelled = false
    hydrateMessageHistory(node, node.path()).then(added => {
      if (added && !cancelled) {
        setTick(t => t + 1)
      }
    })
    return () => {
      cancelled = true
    }
  }, [node])

  React.useEffect(() => {
    const anomalyNode = node.edges['anomaly']?.target
    const baselineNode = node.edges['baseline']?.target
    const rerender = () => setTick(t => t + 1)

    node.onMessage.subscribe(rerender)
    anomalyNode?.onMessage.subscribe(rerender)
    baselineNode?.onMessage.subscribe(rerender)

    return () => {
      node.onMessage.unsubscribe(rerender)
      anomalyNode?.onMessage.unsubscribe(rerender)
      baselineNode?.onMessage.unsubscribe(rerender)
    }
  }, [node])

  const anomalyNode = node.edges['anomaly']?.target
  const baselineNode = node.edges['baseline']?.target
  const severity: Severity = anomalyNode
    ? severityFromPayload(anomalyNode.message?.payload?.toUnicodeString())
    : 'OK'
  const baselineText = baselineNode?.message?.payload?.toUnicodeString()
  const valueText = currentValueText(node, dotPath)
  // "Last seen" is when this app received the message; "Measurement" is when
  // the device itself says it took the reading (parsed out of the payload,
  // if it publishes one) — these can diverge on a replayed/delayed message,
  // so both are shown rather than only the ambiguous single timestamp this
  // used to render.
  const lastSeenText = node.message?.received ? node.message.received.toLocaleString() : undefined
  const measurementText = React.useMemo(() => {
    const payload = node.message?.payload?.toUnicodeString()
    if (!payload) {
      return undefined
    }
    try {
      const measured = extractPayloadTimestamp(JSON.parse(payload))
      return measured?.toLocaleString()
    } catch {
      return undefined
    }
  }, [node.message])

  const bareStyle: React.CSSProperties = fillHeight
    ? { minWidth: 0, height: '100%', display: 'flex', flexDirection: 'column' }
    : { minWidth: 0 }

  return (
    <div
      className={bare ? undefined : 'cmom-card'}
      style={
        bare
          ? bareStyle
          : fillHeight
            ? { padding: 'var(--cmom-space-2, 8px)', ...bareStyle }
            : { padding: 'var(--cmom-space-2, 8px)', minWidth: 0 }
      }
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4, gap: 8 }}>
        {bare ? (
          <span />
        ) : (
          <strong style={{ fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {title}
            {unit ? ` (${unit})` : ''}
          </strong>
        )}
        <SeverityBadge severity={severity} />
      </div>
      <TimeRangeToggle value={timeRange} onChange={setTimeRange} options={timeRangeOptions} />
      <div style={fillHeight ? { marginTop: 4, flex: '1 1 auto', minHeight: 0 } : { marginTop: 4 }}>
        <TopicPlot
          node={node}
          history={node.messageHistory}
          dotPath={dotPath}
          timeInterval={timeRange || undefined}
          centerNow
          axisColor="#8b949e"
          gridColor="#2a3139"
          pointRingColor="#1c2229"
          range={range}
          fillHeight={fillHeight}
        />
      </div>
      <div className="cmom-value" style={{ marginTop: 4 }}>
        {valueText !== undefined ? `${valueText}${unit ? ` ${unit}` : ''}` : 'No reading yet'}
        {measurementText && (
          <span style={{ fontSize: '0.55em', fontWeight: 400, opacity: 0.6 }}> — measured {measurementText}</span>
        )}
      </div>
      {lastSeenText && (
        <div style={{ fontSize: 11, opacity: 0.6, marginTop: 2 }}>Last seen: {lastSeenText}</div>
      )}
      <div style={{ fontSize: 11, opacity: 0.6, marginTop: 2 }}>Baseline (MQTT): {baselineText || 'not available yet'}</div>
      {sqlBaselineText !== undefined && (
        <div style={{ fontSize: 11, opacity: 0.6, marginTop: 2 }}>Baseline (SQL): {sqlBaselineText}</div>
      )}
    </div>
  )
}
