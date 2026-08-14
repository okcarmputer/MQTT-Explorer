import * as React from 'react'
import * as q from '../../../backend/src/Model'
import TopicPlot from '../components/TopicPlot'
import SeverityBadge from './SeverityBadge'
import TimeRangeToggle, { DEFAULT_TIME_RANGE } from './TimeRangeToggle'
import { Severity, severityFromPayload } from './config'

interface Props {
  title: string
  node: q.TreeNode<any>
  dotPath?: string
  unit?: string
  // Pulled via direct SQL query (see useSqlFlowBaseline), shown alongside the
  // MQTT-published baseline below — distinct source, so labeled separately.
  sqlBaselineText?: string
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
export default function TrendPanel({ title, node, dotPath, unit, sqlBaselineText }: Props) {
  const [timeRange, setTimeRange] = React.useState(DEFAULT_TIME_RANGE)
  const [, setTick] = React.useState(0)

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
  const timeText = node.message?.received ? node.message.received.toLocaleString() : undefined

  return (
    <div className="cmom-card" style={{ padding: 'var(--cmom-space-2, 8px)', minWidth: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4, gap: 8 }}>
        <strong style={{ fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {title}
          {unit ? ` (${unit})` : ''}
        </strong>
        <SeverityBadge severity={severity} />
      </div>
      <TimeRangeToggle value={timeRange} onChange={setTimeRange} />
      <div style={{ marginTop: 4 }}>
        <TopicPlot node={node} history={node.messageHistory} dotPath={dotPath} timeInterval={timeRange} centerNow />
      </div>
      <div className="cmom-value" style={{ marginTop: 4 }}>
        {valueText !== undefined ? `${valueText}${unit ? ` ${unit}` : ''}` : 'No reading yet'}
        {timeText && (
          <span style={{ fontSize: '0.55em', fontWeight: 400, opacity: 0.6 }}> — {timeText}</span>
        )}
      </div>
      <div style={{ fontSize: 11, opacity: 0.6, marginTop: 2 }}>Baseline (MQTT): {baselineText || 'not available yet'}</div>
      {sqlBaselineText !== undefined && (
        <div style={{ fontSize: 11, opacity: 0.6, marginTop: 2 }}>Baseline (SQL): {sqlBaselineText}</div>
      )}
    </div>
  )
}
