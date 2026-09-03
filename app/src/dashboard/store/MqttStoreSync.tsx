import * as React from 'react'
import { connect } from 'react-redux'
import { AppState } from '../../reducers'
import * as q from '../../../../backend/src/Model'
import { dashboardConfig, Severity, severityOrder } from '../config'
import { ChildTopic, useTopicChildren, useDeviceSeverities } from '../useTopicChildren'
import { useDiurnalDeviceSeverities } from '../useAnomalyFeed'
import { ConnectionHealth } from '../../reducers/Connection'
import { DeviceSnapshot, useMqttStore } from './mqttStore'

interface Props {
  tree?: q.Tree<any>
  connected: boolean
  health?: ConnectionHealth
  host?: string
}

function toSnapshotMap(
  devices: ChildTopic[],
  severities: Record<string, Severity>,
  secondarySeverities?: Record<string, Severity>
): Record<string, DeviceSnapshot> {
  const out: Record<string, DeviceSnapshot> = {}
  devices.forEach(d => {
    const severity = severities[d.key] ?? 'OK'
    const secondary = secondarySeverities?.[d.key] ?? 'OK'
    const worst = severityOrder.indexOf(secondary) > severityOrder.indexOf(severity) ? secondary : severity
    out[d.key] = { key: d.key, lastUpdate: d.node.lastUpdate, severity: worst }
  })
  return out
}

/**
 * Bridges the existing tree/topic-children plumbing into the zustand store —
 * the only place that writes to it. Mounted once, always, alongside the
 * Explorer pane (see DashboardTabs), so the store stays live regardless of
 * which tab is active. Every panel that only needs current values/severity
 * (Overview's tiles, the Flow Monitors/Pump Stations tables) reads from the
 * store instead of calling useTopicChildren/useDeviceSeverities itself.
 */
function MqttStoreSync({ tree, connected, health, host }: Props) {
  const flowDevices = useTopicChildren(tree, dashboardConfig.flowMonitors.topicPrefix, dashboardConfig.flowMonitors.metadataChildren)
  const pumpDevices = useTopicChildren(tree, dashboardConfig.pumpStations.topicPrefix)
  const diurnalDevices = useTopicChildren(tree, dashboardConfig.flowMonitors.diurnalTopicPrefix)
  const flowSeverities = useDeviceSeverities(flowDevices, dashboardConfig.flowMonitors.anomalyTopicPrefix)
  const pumpSeverities = useDeviceSeverities(pumpDevices)
  // diurnal_detector.py's hour-of-day engine is keyed by site number, same as
  // flowDevices, so its per-site worst severity merges directly into the
  // flow monitor snapshot (worst of the two detectors wins).
  const diurnalSeverities = useDiurnalDeviceSeverities(diurnalDevices)

  const setConnection = useMqttStore(s => s.setConnection)
  const setFlowMonitors = useMqttStore(s => s.setFlowMonitors)
  const setPumpStations = useMqttStore(s => s.setPumpStations)

  React.useEffect(() => {
    setConnection(connected, health, host)
  }, [connected, health, host, setConnection])

  React.useEffect(() => {
    setFlowMonitors(toSnapshotMap(flowDevices, flowSeverities, diurnalSeverities))
  }, [flowDevices, flowSeverities, diurnalSeverities, setFlowMonitors])

  React.useEffect(() => {
    setPumpStations(toSnapshotMap(pumpDevices, pumpSeverities))
  }, [pumpDevices, pumpSeverities, setPumpStations])

  return null
}

const mapStateToProps = (state: AppState) => ({
  tree: state.connection.tree,
  connected: state.connection.connected,
  health: state.connection.health,
  host: state.connection.host,
})

export default connect(mapStateToProps)(MqttStoreSync)
