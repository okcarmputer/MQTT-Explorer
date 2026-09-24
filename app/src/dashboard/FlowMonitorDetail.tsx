import * as React from 'react'
import { useSearchParams } from 'react-router-dom'
import * as q from '../../../backend/src/Model'
import TrendPanel from './TrendPanel'
import DeviceHeader from './DeviceHeader'
import DiurnalGaugeCard from './widgets/DiurnalGaugeCard'
import { useSqlFlowBaseline } from './useSqlFlowBaseline'
import { useSqlFlowDiurnalAnomalies } from './useSqlFlowDiurnalAnomalies'
import { formatPortAttributes, useSqlFlowPortInfo } from './useSqlFlowPortInfo'
import { formatFlowPortInfo, extractDiameter, readPortsForNode } from './useFlowPortInfo'
import { flowChannels, severityFromDiurnalLevel, severityFromPayload, gpmToMgd } from './config'
import { DiurnalMeasurementType, useDiurnalAnomaly, worstDiurnalAnomalyLevel } from './useDiurnalAnomalies'
import FlowKpiRow, { FlowKpiMetric, SiteHealthIssue } from './widgets/FlowKpiRow'
import { humanizeKey } from './useFlowSiteInfo'
import { useManholeInfo } from './useManholeInfo'
import PipeGauge from './widgets/PipeGauge'
import ManholeGauge from './widgets/ManholeGauge'
import ManholeInfoCard from './widgets/ManholeInfoCard'
import PanelGrid, { PanelSpec } from './widgets/PanelGrid'
import { useFitRowHeight } from './widgets/useFitRowHeight'
import { extractPayloadTimestamp } from '../helper/extractPayloadTimestamp'
import { SegmentedControl } from './widgets/Controls'
import HachLiveCharts from './HachLiveCharts'

// Flow monitor channel trend charts (Level/Velocity/Flow) are fixed to the
// last 24 hours with no user-adjustable toggle — "All time" and other wide
// windows packed too many points into the chart to read at a glance, and
// deeper historical/trend analysis for these sites happens against SQL
// directly (see FlowMonitorDetail's "Diurnal Anomaly History (SQL)" panel),
// not by widening these charts' own window.
const FLOW_CHANNEL_DEFAULT_TIME_RANGE = '24h'

interface Props {
  deviceKey: string
  deviceNode: q.TreeNode<any>
  tree?: q.Tree<any>
  onBack: () => void
}

export default function FlowMonitorDetail({ deviceKey, deviceNode, tree, onBack }: Props) {
  const [tick, setTick] = React.useState(0)
  const [manholeView, setManholeView] = React.useState(false)
  // Site overview (this page's own panels) vs. the embedded Hach live charts.
  // Kept in the URL (?view=live) rather than local state so it survives
  // switching between sites and can be linked to directly.
  const [searchParams, setSearchParams] = useSearchParams()
  const view: 'overview' | 'live' = searchParams.get('view') === 'live' ? 'live' : 'overview'
  const setView = (next: 'overview' | 'live') => {
    setSearchParams(next === 'live' ? { view: 'live' } : {}, { replace: true })
  }

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

  // diurnal_detector.py's own SQL table (dbo.Flow_Monitor_Diurnal_Anomalies,
  // dev server today) — history/trend source for this site's diurnal
  // detector, separate from both the live MQTT diurnal reading above (which
  // only ever holds the latest cycle) and sqlBaseline above (the monthly/CHA
  // detector's own SQL table). Undefined/unconfigured the same way every
  // other useSql* hook degrades — see useSqlFlowDiurnalAnomalies.ts.
  const diurnalHistory = useSqlFlowDiurnalAnomalies(deviceKey, 7 * 24)

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
  const ROW3_H = 12
  const channelOrder = ['level', 'flow', 'velocity']
  const orderedChannels = [...channels].sort((a, b) => channelOrder.indexOf(a.key) - channelOrder.indexOf(b.key))
  const chartRows = Math.max(1, Math.ceil(orderedChannels.length / 3))
  const totalRows = ROW1_H + ROW2_H * chartRows + ROW3_H

  // Current value + both detectors' severities, per channel — read the same
  // way TrendPanel reads its own node (payload.Value / sibling .../anomaly
  // topic), just gathered once here so the KPI row and Site Health can share
  // one pass over the three channels instead of each re-deriving it.
  const kpiMetrics: FlowKpiMetric[] = orderedChannels.map(c => {
    const payload = c.node?.message?.payload?.toUnicodeString()
    let value: number | undefined
    let measuredAt: Date | undefined
    if (payload) {
      try {
        const json = JSON.parse(payload)
        value = json.Value !== undefined ? Number(json.Value) : undefined
        measuredAt = extractPayloadTimestamp(json)
      } catch {
        value = undefined
      }
    }
    const anomalyNode = c.node?.edges['anomaly']?.target
    const monthlySeverity = severityFromPayload(anomalyNode?.message?.payload?.toUnicodeString())
    const diurnal = diurnalByType[c.label as DiurnalMeasurementType]
    const diurnalLevel = worstDiurnalAnomalyLevel(diurnal)
    const diurnalSeverity = diurnalLevel === undefined ? undefined : severityFromDiurnalLevel(diurnalLevel)
    return {
      key: c.key,
      label: c.label,
      unit: c.unit,
      value,
      monthlySeverity,
      diurnalSeverity,
      // measuredAt (the device's own reading time, parsed out of the
      // payload) drives the tooltip; lastReceivedAt (when this app actually
      // got the message) drives the LIVE/STALE/OFFLINE dot itself — same
      // "measured vs. seen" split TrendPanel already makes for the same
      // reason (a replayed/delayed message shouldn't read as freshly live).
      measuredAt,
      lastReceivedAt: c.node?.message?.received,
    }
  })

  // Keyed by the diurnal engine's own measurement-type vocabulary (matches
  // kpiMetrics' `label`, since flowChannels' labels are already "Flow" /
  // "Level" / "Velocity") — feeds DiurnalGaugeCard's measurement bar so it
  // always compares the *current* live reading against the normalized/
  // average diurnal bars, not the diurnal detector's own last-evaluated
  // measurementValue (see that component's comment for why those can differ).
  // Flow specifically needs a unit conversion first: the live channel reads
  // GPM (flowChannels' own 'gpm' unit) but AvgDiurnal/NormDiurnal are MGD
  // (see gpmToMgd's comment in config.ts) — without this, the "measurement"
  // bar would plot a GPM number on the same axis as two MGD ones, off by a
  // factor of ~1440000.
  const liveValueByType = Object.fromEntries(
    kpiMetrics.map(m => [m.label, m.value === undefined ? undefined : m.label === 'Flow' ? gpmToMgd(m.value) : m.value])
  ) as Record<DiurnalMeasurementType, number | undefined>
  const liveMeasuredAtByType = Object.fromEntries(kpiMetrics.map(m => [m.label, m.measuredAt])) as Record<
    DiurnalMeasurementType,
    Date | undefined
  >

  const siteHealthIssues: SiteHealthIssue[] = kpiMetrics.flatMap(c => {
    const issues: SiteHealthIssue[] = []
    if (c.monthlySeverity !== 'OK') issues.push({ metric: c.label, detector: 'Monthly', severity: c.monthlySeverity })
    if (c.diurnalSeverity !== undefined && c.diurnalSeverity !== 'OK') {
      issues.push({ metric: c.label, detector: 'Diurnal', severity: c.diurnalSeverity })
    }
    return issues
  })
  // Scales PanelGrid's rowHeight so this page's default layout fills
  // whatever vertical space is actually available instead of a fixed
  // 32px/row layout that may run taller than the viewport — see
  // useFitRowHeight's own comment. `fitRef` goes on the flex:1 wrapper below
  // (not the outer padded div), so its measured height is the real
  // post-header, post-padding budget.
  const { ref: fitRef, rowHeight } = useFitRowHeight(totalRows, 32)

  return (
    <div style={{ padding: 'var(--cmom-space-4, 16px)', height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <DeviceHeader
        titleParts={[siteLocation, siteName]}
        identifier={deviceKey}
        onBack={onBack}
        kpiRow={<FlowKpiRow metrics={kpiMetrics} issues={siteHealthIssues} />}
        actions={
          <SegmentedControl
            ariaLabel="Site view"
            value={view}
            onChange={setView}
            options={[
              { label: 'Site overview', value: 'overview' },
              { label: 'Live Charts', value: 'live' },
            ]}
          />
        }
      />

      <div ref={fitRef} style={{ flex: '1 1 auto', minHeight: 0, overflow: 'auto' }}>
      {view === 'live' ? <HachLiveCharts siteNumber={deviceKey} /> : (() => {
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
            content: (
              <DiurnalGaugeCard
                diurnalByType={diurnalByType}
                pipeDiameterValue={pipeDiameterValue}
                liveValueByType={liveValueByType}
                liveMeasuredAtByType={liveMeasuredAtByType}
              />
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
                  diurnalText={diurnalText(c.label as DiurnalMeasurementType)}
                  diurnalAvgLevel={diurnalByType[c.label as DiurnalMeasurementType]?.avgAnomalyLevel}
                  diurnalNormalLevel={diurnalByType[c.label as DiurnalMeasurementType]?.normalAnomalyLevel}
                  range={c.key === 'level' && pipeDiameterValue !== undefined ? [0, pipeDiameterValue] : undefined}
                  defaultTimeRange={FLOW_CHANNEL_DEFAULT_TIME_RANGE}
                  hideTimeRangeToggle
                  fillHeight
                  bare
                />
              ),
            }
            return panel
          }),
          {
            id: 'diurnal-anomaly-history',
            title: 'Diurnal Anomaly History (SQL, last 7 days)',
            defaultLayout: { x: 0, y: ROW1_H + ROW2_H * chartRows, w: 12, h: ROW3_H },
            autoHeight: true,
            content: (() => {
              if (!diurnalHistory?.configured) {
                return <div style={{ opacity: 0.7 }}>SQL diurnal-anomaly reporting isn't configured for this app instance.</div>
              }
              if (diurnalHistory.rows.length === 0) {
                return <div style={{ opacity: 0.7 }}>No flagged diurnal anomalies for this site in the last 7 days.</div>
              }
              return (
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                    <thead>
                      <tr style={{ textAlign: 'left', opacity: 0.7 }}>
                        <th style={{ padding: '4px 8px' }}>Time</th>
                        <th style={{ padding: '4px 8px' }}>Measurement</th>
                        <th style={{ padding: '4px 8px' }}>Compared To</th>
                        <th style={{ padding: '4px 8px' }}>Value</th>
                        {/* Signed — negative means below baseline, not "less severe";
                            see FlowMonitorDiurnalAnomalyRow's own comment. */}
                        <th style={{ padding: '4px 8px' }}>Anomaly Value</th>
                        <th style={{ padding: '4px 8px' }}>Avg Diurnal</th>
                        <th style={{ padding: '4px 8px' }}>Norm Diurnal</th>
                      </tr>
                    </thead>
                    <tbody>
                      {diurnalHistory.rows.map(row => (
                        <tr key={row.anomalyId} style={{ borderTop: '1px solid var(--cmom-border, rgba(128,128,128,0.2))' }}>
                          <td style={{ padding: '4px 8px' }}>{new Date(row.measurementTime).toLocaleString()}</td>
                          <td style={{ padding: '4px 8px' }}>{row.measurementType}</td>
                          <td style={{ padding: '4px 8px' }}>{row.anomalyType}</td>
                          <td style={{ padding: '4px 8px' }}>{row.measurementValue ?? '—'}</td>
                          <td style={{ padding: '4px 8px' }}>{row.anomalyValue}</td>
                          <td style={{ padding: '4px 8px' }}>{row.avgDiurnal ?? '—'}</td>
                          <td style={{ padding: '4px 8px' }}>{row.normDiurnal ?? '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )
            })(),
          },
        ]

        // Bumped from "...-v2" — row 1 is now four equal columns (Diurnal
        // comparison moved out of a stacked-under-Site-Attributes layout
        // into its own column) and PanelGrid's saved layout otherwise wins
        // over new defaultLayout values for any panel id a user's browser
        // already has a stored position for. The Flow/Level/Velocity/Site
        // Health KPI summary lives in DeviceHeader's fixed kpiRow slot
        // instead of PanelGrid — it's meant to always be visible in the same
        // spot, not draggable/resizable/hideable like everything else here.
        return <PanelGrid storageKey="cmom-layout-flow-monitor-detail-v3" panels={panels} rowHeight={rowHeight} />
      })()}
      </div>
    </div>
  )
}
