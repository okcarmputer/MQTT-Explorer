import * as React from 'react'
import * as q from '../../../backend/src/Model'
import TrendPanel from './TrendPanel'
import FlowTrendChart from './FlowTrendChart'
import { useSqlFlowBaseline } from './useSqlFlowBaseline'
import { useSqlFlowHistory } from './useSqlFlowHistory'

const HISTORY_RANGE_OPTIONS = [
  { label: '24h', hours: 24 },
  { label: '7d', hours: 24 * 7 },
  { label: '30d', hours: 24 * 30 },
]

// Hach data-channel IDs, confirmed against hachAPI/getSiteMeasurements.py's
// CHANNEL_ALLOW_LIST (the site poller only ever fetches these three) and the
// project readme ("Type 7=Level, 11=Velocity, 15=Flow"). The topic segment
// under a site is this literal channel id, e.g. flow_monitors/{site}/7.
const FLOW_CHANNELS = [
  { id: '7', label: 'Level', unit: 'inches' },
  { id: '11', label: 'Velocity', unit: 'fps' },
  { id: '15', label: 'Flow', unit: 'gpm' },
]

interface Props {
  deviceKey: string
  deviceNode: q.TreeNode<any>
  onBack: () => void
}

export default function FlowMonitorDetail({ deviceKey, deviceNode, onBack }: Props) {
  const [, setTick] = React.useState(0)

  React.useEffect(() => {
    const rerender = () => setTick(t => t + 1)
    deviceNode.onEdgesChange.subscribe(rerender)
    return () => deviceNode.onEdgesChange.unsubscribe(rerender)
  }, [deviceNode])

  // Only channels this site actually publishes — "only relevant values".
  const channels = FLOW_CHANNELS.map(c => ({ ...c, node: deviceNode.edges[c.id]?.target })).filter(c => c.node)

  // Pulled directly via SQL (bypasses MQTT entirely) — see
  // Anomaly_Detection/DASHBOARD_INTEGRATION_INSTRUCTIONS.md Part 1 for the
  // source query. Unavailable (undefined) when SQL_SERVER isn't configured
  // server-side or in Electron desktop mode — that's expected, not an error.
  const sqlBaseline = useSqlFlowBaseline(deviceKey)

  const [historyHours, setHistoryHours] = React.useState(HISTORY_RANGE_OPTIONS[0].hours)
  const history = useSqlFlowHistory(deviceKey, historyHours)

  return (
    <div style={{ padding: 'var(--cmom-space-4, 16px)', height: '100%', overflow: 'auto' }}>
      <button
        type="button"
        onClick={onBack}
        style={{
          marginBottom: 'var(--cmom-space-3, 12px)',
          padding: '4px 12px',
          borderRadius: 'var(--cmom-radius-sm, 4px)',
          border: '1px solid var(--cmom-border-strong, rgba(128,128,128,0.4))',
          background: 'transparent',
          color: 'inherit',
          cursor: 'pointer',
        }}
      >
        &larr; Back
      </button>
      <h2 style={{ marginTop: 0 }}>
        Site ID: <span style={{ fontFamily: 'var(--cmom-font-mono, monospace)' }}>{deviceKey}</span>
      </h2>

      {channels.length === 0 ? (
        <div style={{ opacity: 0.7 }}>No Level/Velocity/Flow channels seen for this site yet.</div>
      ) : (
        <div className="cmom-trend-grid">
          {channels.map(c => {
            const sqlChannel = sqlBaseline?.channels.find(ch => ch.channelId === c.id)
            const sqlBaselineText =
              sqlChannel && sqlChannel.baselineMean !== null
                ? `${sqlChannel.baselineMean.toFixed(2)}${
                    sqlChannel.baselineStdDev !== null ? ` ± ${sqlChannel.baselineStdDev.toFixed(2)}` : ''
                  }`
                : sqlBaseline?.configured
                  ? 'not available for this site'
                  : undefined
            return (
              <TrendPanel
                key={c.id}
                title={c.label}
                node={c.node!}
                dotPath="Value"
                unit={c.unit}
                sqlBaselineText={sqlBaselineText}
              />
            )
          })}
        </div>
      )}

      <h3>Trend vs. CHA baseline (SQL history)</h3>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 8 }}>
        {HISTORY_RANGE_OPTIONS.map(opt => (
          <button
            key={opt.hours}
            type="button"
            onClick={() => setHistoryHours(opt.hours)}
            style={{
              padding: '2px 10px',
              fontSize: 12,
              borderRadius: 'var(--cmom-radius-sm, 4px)',
              border: '1px solid var(--cmom-border-strong, rgba(128,128,128,0.4))',
              backgroundColor: opt.hours === historyHours ? 'var(--cmom-accent, #1976d2)' : 'transparent',
              color: opt.hours === historyHours ? '#fff' : 'inherit',
              cursor: 'pointer',
            }}
          >
            {opt.label}
          </button>
        ))}
      </div>
      {history && !history.configured ? (
        <div style={{ opacity: 0.7, fontSize: 13 }}>SQL reporting isn&apos;t configured on this server.</div>
      ) : (
        <div className="cmom-trend-grid">
          <div className="cmom-card" style={{ padding: 'var(--cmom-space-2, 8px)', minWidth: 0 }}>
            <FlowTrendChart
              title="Flow"
              unit="MGD"
              points={history?.points ?? []}
              channel={{ value: 'flow', mean: 'flowMean', stdDev: 'flowStdDev', alarm: 'flowAlarm' }}
            />
          </div>
          <div className="cmom-card" style={{ padding: 'var(--cmom-space-2, 8px)', minWidth: 0 }}>
            <FlowTrendChart
              title="Level"
              unit="in"
              points={history?.points ?? []}
              channel={{ value: 'level', mean: 'levelMean', stdDev: 'levelStdDev', alarm: 'levelAlarm' }}
            />
          </div>
          <div className="cmom-card" style={{ padding: 'var(--cmom-space-2, 8px)', minWidth: 0 }}>
            <FlowTrendChart
              title="Velocity"
              unit="fps"
              points={history?.points ?? []}
              channel={{ value: 'velocity', mean: 'velocityMean', stdDev: 'velocityStdDev', alarm: 'velocityAlarm' }}
            />
          </div>
        </div>
      )}
    </div>
  )
}
