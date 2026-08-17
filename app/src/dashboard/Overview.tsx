import * as React from 'react'
import { connect } from 'react-redux'
import { AppState } from '../reducers'
import * as q from '../../../backend/src/Model'
import { Severity } from './config'
import { useFleetAnomalySeverities } from './useTopicChildren'
import { useAnomalyFeed, useCurrentAnomalies } from './useAnomalyFeed'
import { useMqttStore } from './store/mqttStore'
import { useFlowMeasurements } from './useFlowMeasurements'
import StatusWidget from './StatusWidget'
import AlarmsWidget from './AlarmsWidget'
import StaleDevicesWidget from './StaleDevicesWidget'
import CurrentAnomaliesWidget from './CurrentAnomaliesWidget'
import ConnectionHealthBadge from './ConnectionHealthBadge'

interface Props {
  tree?: q.Tree<any>
}

function countBySeverity(severities: Severity[]): Record<Severity, number> {
  const counts: Record<Severity, number> = { OK: 0, LOW: 0, MODERATE: 0, CRITICAL: 0 }
  severities.forEach(s => {
    counts[s] += 1
  })
  return counts
}

/**
 * Status-summary landing page: a widget row (fleet size, alarm breakdown,
 * staleness) over a compact recent-anomalies feed, plus a connection health
 * indicator — no per-device cards here anymore (those live in the Flow
 * Monitors / Pump Stations tabs); this tab is meant to answer "is anything
 * wrong right now" at a glance, not to browse individual devices.
 */
function Overview({ tree }: Props) {
  const { flowDevices, pumpDevices } = useAnomalyFeed(tree)
  // All currently-active anomalies, not just the ones that transitioned
  // recently in this session — see useCurrentAnomalies for why this
  // replaced the old capped/session-scoped "Recent Anomalies" feed here.
  const currentAnomalies = useCurrentAnomalies(flowDevices, pumpDevices)

  // Fleet-wide rollup across every anomaly type (channel/input) on every
  // device — devices themselves carry no severity to roll up from (see
  // config.ts). Per-anomaly-type, not per-device, so sourced from the tree
  // directly rather than the store's per-device severity rollup.
  const flowSeverities = useFleetAnomalySeverities(flowDevices)
  const pumpSeverities = useFleetAnomalySeverities(pumpDevices)
  const alarmCounts = countBySeverity([...flowSeverities, ...pumpSeverities])

  const flowMonitors = useMqttStore(s => s.flowMonitors)
  const pumpStations = useMqttStore(s => s.pumpStations)

  // Live Level/Velocity/Flow readings per site — "active" flow monitor here
  // means it has published at least one measurement, same convention
  // hasMeasurements/"stale" convention used elsewhere in the dashboard.
  const flowMeasurements = useFlowMeasurements(flowDevices)
  const activeFlowCount = React.useMemo(
    () => Object.keys(flowMonitors).filter(key => Object.keys(flowMeasurements[key]?.readings ?? {}).length > 0).length,
    [flowMonitors, flowMeasurements]
  )
  const pumpStationCount = Object.keys(pumpStations).length

  // Combined flow + pump last-update timestamps for the "Not Reporting"
  // widget — a fleet-wide count, not split by device type.
  const allDeviceLastUpdates = React.useMemo(
    () => [
      ...Object.values(flowMonitors).map(d => ({ key: d.key, lastUpdate: flowMeasurements[d.key]?.lastUpdate ?? d.lastUpdate })),
      ...Object.values(pumpStations).map(d => ({ key: d.key, lastUpdate: d.lastUpdate })),
    ],
    [flowMonitors, pumpStations, flowMeasurements]
  )

  return (
    <div style={{ padding: 'var(--cmom-space-5)', display: 'flex', flexDirection: 'column', gap: 'var(--cmom-space-5)' }}>
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <ConnectionHealthBadge />
      </div>

      <div className="cmom-stat-grid">
        <StatusWidget label="Flow Monitors" value={activeFlowCount} subtitle="reporting measurements" />
        <StatusWidget label="Pump Stations" value={pumpStationCount} subtitle="tracked on broker" />
        <AlarmsWidget counts={alarmCounts} />
        <StaleDevicesWidget devices={allDeviceLastUpdates} />
      </div>

      <CurrentAnomaliesWidget anomalies={currentAnomalies} />
    </div>
  )
}

const mapStateToProps = (state: AppState) => ({
  tree: state.connection.tree,
})

export default connect(mapStateToProps)(Overview)
