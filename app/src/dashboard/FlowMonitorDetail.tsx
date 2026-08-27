import * as React from 'react'
import * as q from '../../../backend/src/Model'
import TrendPanel from './TrendPanel'
import { ALL_TIME_VALUE } from './TimeRangeToggle'
import FlowTrendChart from './FlowTrendChart'
import { useSqlFlowBaseline } from './useSqlFlowBaseline'
import { useSqlFlowHistory } from './useSqlFlowHistory'
import { formatPortAttributes, useSqlFlowPortInfo } from './useSqlFlowPortInfo'
import { formatFlowPortInfo, extractDiameter, readPortsForNode } from './useFlowPortInfo'
import { flowChannels } from './config'
import { humanizeKey } from './useFlowSiteInfo'
import PipeGauge from './widgets/PipeGauge'
import PanelGrid, { PanelSpec } from './widgets/PanelGrid'

const HISTORY_RANGE_OPTIONS = [
  { label: '24h', hours: 24 },
  { label: '7d', hours: 24 * 7 },
  { label: '30d', hours: 24 * 30 },
]

// Flow monitor channel trend charts (Level/Velocity/Flow) default to a wider
// window than the pump-station default (30min) — these devices are watched
// over longer horizons — and drop the sub-hour presets that aren't useful here.
const FLOW_CHANNEL_TIME_RANGE_OPTIONS = [
  { label: '1hr', value: '1h' },
  { label: '2hr', value: '2h' },
  { label: '6hr', value: '6h' },
  { label: '24hr', value: '24h' },
  { label: 'All', value: ALL_TIME_VALUE },
]
const FLOW_CHANNEL_DEFAULT_TIME_RANGE = '2h'

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

  // site_info's field casing/naming isn't documented anywhere in this repo
  // (see useFlowSiteInfo), so these look for any key that reads as "name"/
  // "location" rather than assuming exact casing — same loose-match
  // approach the Flow Monitors card grid's subtitle already uses.
  const siteInfoKeys = Object.keys(siteInfo)
  const siteNameKey = siteInfoKeys.find(k => k.toLowerCase().includes('name'))
  const siteLocationKey = siteInfoKeys.find(k => k.toLowerCase().includes('location'))
  const siteName = siteNameKey ? siteInfo[siteNameKey] : undefined
  const siteLocation = siteLocationKey ? siteInfo[siteLocationKey] : undefined

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
      <h2 style={{ marginTop: 0, display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
        <span>
          Site ID: <span style={{ fontFamily: 'var(--cmom-font-mono, monospace)' }}>{deviceKey}</span>
        </span>
        {(siteName || siteLocation) && (
          <span style={{ fontSize: '0.55em', fontWeight: 400, opacity: 0.75, textAlign: 'right' }}>
            {[siteName, siteLocation].filter(Boolean).join(' — ')}
          </span>
        )}
      </h2>

      {(() => {
        // Row 1 (Pipe / Site Attributes / Trend vs. baseline) and row 2
        // (one equal-sized card per Level/Velocity/Flow channel) — three
        // equal columns each, matching the reference layout. Row heights are
        // shared constants (ROW1_H/ROW2_H) rather than per-panel numbers so
        // every row-1 card starts the same height as its row-1 siblings, and
        // likewise for row 2 — "each card the same size" by construction,
        // not by coincidence.
        const ROW1_H = 17
        const ROW2_H = 16
        // Bottom row in this fixed order (matching the reference image)
        // rather than flowChannels' own declaration order.
        const channelOrder = ['level', 'flow', 'velocity']
        const orderedChannels = [...channels].sort(
          (a, b) => channelOrder.indexOf(a.key) - channelOrder.indexOf(b.key)
        )

        const panels: PanelSpec[] = [
          {
            id: 'pipe',
            title: 'Pipe',
            defaultLayout: { x: 0, y: 0, w: 4, h: ROW1_H },
            content:
              pipeDiameterValue === undefined || levelReadingValue === undefined || Number.isNaN(levelReadingValue) ? (
                <div style={{ opacity: 0.7 }}>
                  {pipeDiameterValue === undefined
                    ? 'No pipe diameter published (ports topic) or configured in SQL for this site yet.'
                    : 'No Level reading yet.'}
                </div>
              ) : (
                <div style={{ height: '100%' }}>
                  <PipeGauge
                    title="Level"
                    diameterValue={pipeDiameterValue}
                    diameterUnit={pipeDiameterUnit}
                    levelValue={levelReadingValue}
                    levelUnit={levelChannelConfig?.unit || 'in'}
                  />
                </div>
              ),
          },
          {
            id: 'site-attributes',
            title: 'Site Attributes',
            defaultLayout: { x: 4, y: 0, w: 4, h: ROW1_H },
            autoHeight: true,
            content:
              attributeRows.length === 0 ? (
                <div style={{ opacity: 0.7 }}>No site attributes published yet.</div>
              ) : (
                <div className="cmom-device-card-details">
                  {attributeRows.map(row => (
                    <React.Fragment key={row.label}>
                      <span className="cmom-label">{row.label}:</span>
                      <span>{row.value}</span>
                    </React.Fragment>
                  ))}
                </div>
              ),
          },
          // One resizable panel per channel (rather than one "Level / Velocity
          // / Flow" panel holding all three charts in a fixed-size CSS grid)
          // so each chart's own card can be dragged/resized independently,
          // and the chart itself (via TrendPanel's fillHeight) grows to fill
          // whatever size that card is given — horizontally or vertically —
          // instead of staying a fixed content size inside a shared card.
          ...orderedChannels.map((c, i) => {
            const sqlChannel = sqlBaseline?.channels.find(ch => ch.channelId === c.id)
            const sqlBaselineText =
              sqlChannel && sqlChannel.baselineMean !== null
                ? `${sqlChannel.baselineMean.toFixed(2)}${
                    sqlChannel.baselineStdDev !== null ? ` ± ${sqlChannel.baselineStdDev.toFixed(2)}` : ''
                  }`
                : sqlBaseline?.configured
                  ? 'not available for this site'
                  : undefined
            const panel: PanelSpec = {
              id: `channel-${c.id}`,
              title: c.unit ? `${c.label} (${c.unit})` : c.label,
              defaultLayout: { x: (i % 3) * 4, y: ROW1_H + Math.floor(i / 3) * ROW2_H, w: 4, h: ROW2_H },
              content: (
                <TrendPanel
                  title={c.label}
                  node={c.node!}
                  dotPath="Value"
                  unit={c.unit}
                  sqlBaselineText={sqlBaselineText}
                  range={c.key === 'level' && pipeDiameterValue !== undefined ? [0, pipeDiameterValue] : undefined}
                  timeRangeOptions={FLOW_CHANNEL_TIME_RANGE_OPTIONS}
                  defaultTimeRange={FLOW_CHANNEL_DEFAULT_TIME_RANGE}
                  fillHeight
                  bare
                />
              ),
            }
            return panel
          }),
          {
            id: 'sql-history',
            title: 'Trend vs. CHA baseline (SQL history)',
            defaultLayout: { x: 8, y: 0, w: 4, h: ROW1_H },
            autoHeight: true,
            content: (
              <>
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
              </>
            ),
          },
        ]

        return <PanelGrid storageKey="cmom-layout-flow-monitor-detail" panels={panels} />
      })()}
    </div>
  )
}
