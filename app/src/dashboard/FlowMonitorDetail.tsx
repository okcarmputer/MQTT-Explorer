import * as React from 'react'
import * as q from '../../../backend/src/Model'
import TrendPanel from './TrendPanel'
import { ALL_TIME_VALUE } from './TimeRangeToggle'
import DiurnalGaugeCard from './widgets/DiurnalGaugeCard'
import { useSqlFlowBaseline } from './useSqlFlowBaseline'
import { formatPortAttributes, useSqlFlowPortInfo } from './useSqlFlowPortInfo'
import { formatFlowPortInfo, extractDiameter, readPortsForNode } from './useFlowPortInfo'
import { flowChannels } from './config'
import { DiurnalMeasurementType, useDiurnalAnomaly } from './useDiurnalAnomalies'
import { humanizeKey } from './useFlowSiteInfo'
import { useManholeInfo } from './useManholeInfo'
import PipeGauge from './widgets/PipeGauge'
import ManholeGauge from './widgets/ManholeGauge'
import ManholeInfoCard from './widgets/ManholeInfoCard'
import PanelGrid, { PanelSpec } from './widgets/PanelGrid'
import { useFitRowHeight } from './widgets/useFitRowHeight'

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
  tree?: q.Tree<any>
  onBack: () => void
}

export default function FlowMonitorDetail({ deviceKey, deviceNode, tree, onBack }: Props) {
  const [tick, setTick] = React.useState(0)
  const [manholeView, setManholeView] = React.useState(false)

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

  // The manhole/flow-meter table (published by the anomaly-detection repo to
  // flow_monitors/manhole_info, see useManholeInfo.ts) joins on flowmeterid,
  // which lines up with site_info's own "NAME" field (e.g. "FM250-16") —
  // NOT this site's MQTT key/deviceKey (e.g. "15223"), an internal ID the
  // table has no concept of. "NAME" specifically, not the same loose
  // "includes('name')" match siteNameKey above uses, since some sites also
  // publish a "CustomerName" field that would otherwise win that match
  // first. deviceKey is still passed as a second candidate in case a site's
  // key happens to already be in the table's site-number format.
  const flowMeterNameKey = siteInfoKeys.find(k => k.toLowerCase() === 'name')
  const manholeInfo = useManholeInfo([flowMeterNameKey ? siteInfo[flowMeterNameKey] : undefined, deviceKey])

  // diurnal_detector.py's hour-of-day engine — a separate detector/topic tree
  // from the monthly flow_monitors/{site}/{channel}/anomaly one already read
  // via TrendPanel's own node.edges['anomaly'] lookup (see useDiurnalAnomalies.ts).
  // One hook call per fixed measurement type (not per-channel in a .map) since
  // hooks can't be called conditionally/in a loop.
  const diurnalFlow = useDiurnalAnomaly(tree, deviceKey, 'Flow')
  const diurnalLevel = useDiurnalAnomaly(tree, deviceKey, 'Level')
  const diurnalVelocity = useDiurnalAnomaly(tree, deviceKey, 'Velocity')
  const diurnalByType: Record<DiurnalMeasurementType, ReturnType<typeof useDiurnalAnomaly>> = {
    Flow: diurnalFlow,
    Level: diurnalLevel,
    Velocity: diurnalVelocity,
  }
  function diurnalText(measurementType: DiurnalMeasurementType): string | undefined {
    const d = diurnalByType[measurementType]
    if (!d) return undefined
    const parts = [`vs. hour avg ${d.avgAnomalyLevel ?? '?'}`, `vs. normal shape ${d.normalAnomalyLevel ?? '?'}`]
    return parts.join(', ')
  }

  // Pulled directly via SQL (bypasses MQTT entirely) — see
  // Anomaly_Detection/DASHBOARD_INTEGRATION_INSTRUCTIONS.md Part 1 for the
  // source query. Unavailable (undefined) when SQL_SERVER isn't configured
  // server-side or in Electron desktop mode — that's expected, not an error.
  const sqlBaseline = useSqlFlowBaseline(deviceKey)

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

  // Row 1: Pipe | Site Attributes | Manhole Info | Diurnal comparison — four
  // equal-width columns, all sharing ROW1_H. Row 2 is one equal-sized card
  // per Level/Velocity/Flow channel, three equal columns. Hoisted above the
  // panels IIFE below (rather than declared inside it) so totalRows can feed
  // useFitRowHeight — the two need to agree on the same row math.
  const ROW1_H = 17
  const ROW2_H = 16
  const channelOrder = ['level', 'flow', 'velocity']
  const orderedChannels = [...channels].sort((a, b) => channelOrder.indexOf(a.key) - channelOrder.indexOf(b.key))
  const chartRows = Math.max(1, Math.ceil(orderedChannels.length / 3))
  const totalRows = ROW1_H + ROW2_H * chartRows
  // Scales PanelGrid's rowHeight so this page's default layout fills
  // whatever vertical space is actually available instead of a fixed
  // 32px/row layout that may run taller than the viewport — see
  // useFitRowHeight's own comment. `fitRef` goes on the flex:1 wrapper below
  // (not the outer padded div), so its measured height is the real
  // post-header, post-padding budget.
  const { ref: fitRef, rowHeight } = useFitRowHeight(totalRows, 32)

  return (
    <div style={{ padding: 'var(--cmom-space-4, 16px)', height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
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
          <span style={{ fontSize: '0.75em', fontWeight: 700, opacity: 0.95, textAlign: 'right' }}>
            {[siteName, siteLocation].filter(Boolean).join(' — ')}
          </span>
        )}
      </h2>

      <div ref={fitRef} style={{ flex: '1 1 auto', minHeight: 0, overflow: 'auto' }}>
      {(() => {
        // if/else rather than a chained ternary — a 3-way ternary here reads
        // worse than the equivalent explicit branches.
        let pipeContent: React.ReactNode
        if (manholeView) {
          pipeContent = (
            <ManholeGauge
              title="Level"
              manholeDepthFt={manholeInfo?.manholeDepthFt ?? null}
              pipeDiameterValue={pipeDiameterValue ?? null}
              pipeDiameterUnit={pipeDiameterUnit}
              levelValue={levelReadingValue ?? null}
              levelUnit={levelChannelConfig?.unit || 'in'}
            />
          )
        } else if (pipeDiameterValue !== undefined && levelReadingValue !== undefined && !Number.isNaN(levelReadingValue)) {
          pipeContent = (
            <PipeGauge
              title="Level"
              diameterValue={pipeDiameterValue}
              diameterUnit={pipeDiameterUnit}
              levelValue={levelReadingValue}
              levelUnit={levelChannelConfig?.unit || 'in'}
            />
          )
        } else {
          pipeContent = (
            <div style={{ opacity: 0.7 }}>
              {pipeDiameterValue === undefined
                ? 'No pipe diameter published (ports topic) or configured in SQL for this site yet.'
                : 'No Level reading yet.'}
            </div>
          )
        }

        const panels: PanelSpec[] = [
          {
            id: 'pipe',
            title: 'Pipe',
            defaultLayout: { x: 0, y: 0, w: 3, h: ROW1_H },
            content: (
              <div style={{ height: '100%', position: 'relative' }}>
                {/* Top-right toggle between the plain pipe-fill view and the
                    "Man Hole View" (pipe drawn to scale inside the manhole
                    it sits in) — the level sensor reads from the top of the
                    manhole, not the pipe, so a level past the pipe's own
                    diameter is a real, above-pipe reading (surcharge), which
                    PipeGauge's percent-of-pipe view can't show. */}
                <button
                  type="button"
                  onClick={() => setManholeView(v => !v)}
                  style={{
                    position: 'absolute',
                    top: 4,
                    right: 4,
                    zIndex: 1,
                    padding: '2px 8px',
                    fontSize: 11,
                    borderRadius: 'var(--cmom-radius-sm, 4px)',
                    border: '1px solid var(--cmom-border-strong, rgba(128,128,128,0.4))',
                    background: 'var(--cmom-surface-elevated, #1c2229)',
                    color: 'inherit',
                    cursor: 'pointer',
                  }}
                >
                  {manholeView ? 'Pipe View' : 'Man Hole View'}
                </button>

                {pipeContent}
              </div>
            ),
          },
          {
            id: 'site-attributes',
            title: 'Site Attributes',
            defaultLayout: { x: 3, y: 0, w: 3, h: ROW1_H },
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
          {
            id: 'manhole-info',
            title: 'Manhole Info',
            defaultLayout: { x: 6, y: 0, w: 3, h: ROW1_H },
            autoHeight: true,
            content: <ManholeInfoCard info={manholeInfo} />,
          },
          {
            id: 'sql-history',
            title: 'Diurnal comparison (current hour/month)',
            defaultLayout: { x: 9, y: 0, w: 3, h: ROW1_H },
            autoHeight: true,
            content: <DiurnalGaugeCard diurnalByType={diurnalByType} pipeDiameterValue={pipeDiameterValue} />,
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
                  diurnalText={diurnalText(c.label as DiurnalMeasurementType)}
                  diurnalAvgLevel={diurnalByType[c.label as DiurnalMeasurementType]?.avgAnomalyLevel}
                  diurnalNormalLevel={diurnalByType[c.label as DiurnalMeasurementType]?.normalAnomalyLevel}
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
        ]

        // Bumped from "...-v2" — row 1 is now four equal columns (Diurnal
        // comparison moved out of a stacked-under-Site-Attributes layout
        // into its own column) and PanelGrid's saved layout otherwise wins
        // over new defaultLayout values for any panel id a user's browser
        // already has a stored position for.
        return <PanelGrid storageKey="cmom-layout-flow-monitor-detail-v3" panels={panels} rowHeight={rowHeight} />
      })()}
      </div>
    </div>
  )
}
