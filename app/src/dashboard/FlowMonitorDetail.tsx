import * as React from 'react'
import * as q from '../../../backend/src/Model'
import TrendPanel from './TrendPanel'
import FlowTrendChart from './FlowTrendChart'
import { useSqlFlowBaseline } from './useSqlFlowBaseline'
import { useSqlFlowHistory } from './useSqlFlowHistory'
import { formatPortAttributes, useSqlFlowPortInfo } from './useSqlFlowPortInfo'
import { formatFlowPortInfo, extractDiameter, readPortsForNode } from './useFlowPortInfo'
import { flowChannels } from './config'
import { humanizeKey } from './useFlowSiteInfo'
import PipeGauge from './widgets/PipeGauge'

const HISTORY_RANGE_OPTIONS = [
  { label: '24h', hours: 24 },
  { label: '7d', hours: 24 * 7 },
  { label: '30d', hours: 24 * 30 },
]

interface Props {
  deviceKey: string
  deviceNode: q.TreeNode<any>
  onBack: () => void
}

export default function FlowMonitorDetail({ deviceKey, deviceNode, onBack }: Props) {
  const [tick, setTick] = React.useState(0)

  React.useEffect(() => {
    const rerender = () => setTick(t => t + 1)
    const siteInfoNode = deviceNode.edges['site_info']?.target
    const portsGroup = deviceNode.edges['ports']?.target
    const levelChannelConfig = flowChannels.find(c => c.key === 'level')
    const levelNode = levelChannelConfig ? deviceNode.edges[levelChannelConfig.id]?.target : undefined
    deviceNode.onEdgesChange.subscribe(rerender)
    siteInfoNode?.onMessage.subscribe(rerender)
    portsGroup?.onEdgesChange.subscribe(rerender)
    levelNode?.onMessage.subscribe(rerender)
    const portUnsubs = (portsGroup?.edgeArray ?? []).map(edge => {
      edge.target.onMessage.subscribe(rerender)
      return () => edge.target.onMessage.unsubscribe(rerender)
    })
    return () => {
      deviceNode.onEdgesChange.unsubscribe(rerender)
      siteInfoNode?.onMessage.unsubscribe(rerender)
      portsGroup?.onEdgesChange.unsubscribe(rerender)
      levelNode?.onMessage.unsubscribe(rerender)
      portUnsubs.forEach(unsub => unsub())
    }
  }, [deviceNode])

  // Only channels this site actually publishes — "only relevant values".
  const channels = flowChannels.map(c => ({ ...c, node: deviceNode.edges[c.id]?.target })).filter(c => c.node)

  // Every field this site's retained site_info payload actually carries —
  // the detail view is the one place all of it shows, unlike the Overview/
  // Flow Monitors cards, which keep it collapsed or hidden entirely.
  const siteInfoNode = deviceNode.edges['site_info']?.target
  // Re-derives whenever this site_info node receives a new message (the
  // effect above subscribes to its onMessage for exactly this reason).
  const siteInfo = React.useMemo(() => {
    const payload = siteInfoNode?.message?.payload?.toUnicodeString()
    if (!payload) return {}
    try {
      const json = JSON.parse(payload)
      const out: Record<string, string> = {}
      Object.keys(json).forEach(key => {
        const value = json[key]
        if (value !== null && typeof value !== 'object') {
          out[key] = String(value)
        }
      })
      return out
    } catch {
      return {}
    }
  }, [siteInfoNode?.message])

  // Pulled directly via SQL (bypasses MQTT entirely) — see
  // Anomaly_Detection/DASHBOARD_INTEGRATION_INSTRUCTIONS.md Part 1 for the
  // source query. Unavailable (undefined) when SQL_SERVER isn't configured
  // server-side or in Electron desktop mode — that's expected, not an error.
  const sqlBaseline = useSqlFlowBaseline(deviceKey)

  const [historyHours, setHistoryHours] = React.useState(HISTORY_RANGE_OPTIONS[0].hours)
  const history = useSqlFlowHistory(deviceKey, historyHours)

  // Pipe/port shape + dimension, straight from the live MQTT
  // flow_monitors/{site}/ports/{port_id} topic fm_mqtt.py already publishes
  // (see useFlowPortInfo) — this is the primary source, since it's always
  // on and doesn't depend on SQL being configured for this process.
  const mqttPorts = React.useMemo(() => readPortsForNode(deviceNode), [deviceNode, tick])
  const mqttPortAttributes = React.useMemo(() => formatFlowPortInfo(mqttPorts), [mqttPorts])
  const diameter = React.useMemo(() => extractDiameter(mqttPorts), [mqttPorts])

  // Same dimension, also fetched via direct SQL (dbo.hach_port_info) as a
  // fallback for whatever the MQTT ports topic doesn't carry — degrades to
  // unavailable rather than erroring (see useSqlFlowBaseline). Kept
  // alongside the MQTT source rather than replacing it, in case the two
  // ever diverge (e.g. SQL has a dimension MQTT hasn't been given yet).
  const portInfo = useSqlFlowPortInfo(deviceKey)
  const sqlPortAttributes = React.useMemo(() => formatPortAttributes(portInfo?.ports ?? []), [portInfo])
  const attributeRows = [
    ...Object.entries(siteInfo).map(([k, v]) => ({ label: humanizeKey(k), value: v })),
    ...mqttPortAttributes,
    ...sqlPortAttributes,
  ]

  const levelChannel = channels.find(c => c.key === 'level')
  const levelReadingValue = React.useMemo(() => {
    const payload = levelChannel?.node?.message?.payload?.toUnicodeString()
    if (!payload) return undefined
    try {
      const json = JSON.parse(payload)
      return json.Value !== undefined ? Number(json.Value) : undefined
    } catch {
      return undefined
    }
  }, [levelChannel?.node?.message, tick])

  // Pipe diameter: the real, physical dimension — MQTT ports topic first,
  // then SQL, then config.ts's flat assumption. Deriving this from the
  // Level chart's own auto-scaled Y max (tried in an earlier pass) turned
  // out to degenerate badly with sparse history: with only 1-2 readings so
  // far, the computed max is essentially just the current reading itself,
  // making the pipe always render ~100% full regardless of the real level.
  // Real dimension data doesn't have that problem. The Level chart's own
  // axis is instead fixed to [0, this value] below, so the pipe and the
  // graph still agree on what "full" means — just sourced correctly.
  const levelChannelConfig = flowChannels.find(c => c.key === 'level')
  const sqlDiameter = portInfo?.ports.find(p => p.dimensionValue !== null)
  const pipeDiameterValue = diameter?.value ?? sqlDiameter?.dimensionValue ?? levelChannelConfig?.gaugeMaxInches
  const pipeDiameterUnit = diameter?.unit ?? sqlDiameter?.dimensionUnits ?? 'in'

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

      <h3>Pipe</h3>
      {pipeDiameterValue === undefined || levelReadingValue === undefined || Number.isNaN(levelReadingValue) ? (
        <div style={{ opacity: 0.7, marginBottom: 20 }}>
          {pipeDiameterValue === undefined
            ? 'No pipe diameter published (ports topic) or configured in SQL for this site yet.'
            : 'No Level reading yet.'}
        </div>
      ) : (
        <div className="cmom-card-row" style={{ marginBottom: 20 }}>
          <PipeGauge
            title="Level"
            diameterValue={pipeDiameterValue}
            diameterUnit={pipeDiameterUnit}
            levelValue={levelReadingValue}
            levelUnit={levelChannelConfig?.unit || 'in'}
          />
        </div>
      )}

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
                range={c.key === 'level' && pipeDiameterValue !== undefined ? [0, pipeDiameterValue] : undefined}
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

      {attributeRows.length > 0 && (
        <div className="cmom-card" style={{ padding: 'var(--cmom-space-3, 12px)', marginTop: 'var(--cmom-space-4, 16px)' }}>
          <div className="cmom-label" style={{ marginBottom: 'var(--cmom-space-2, 8px)' }}>
            Site Attributes
          </div>
          <div className="cmom-device-card-details">
            {attributeRows.map(row => (
              <React.Fragment key={row.label}>
                <span className="cmom-label">{row.label}:</span>
                <span>{row.value}</span>
              </React.Fragment>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
