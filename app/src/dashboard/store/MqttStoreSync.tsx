import * as React from 'react'
import { connect } from 'react-redux'
import { AppState } from '../../reducers'
import * as q from '../../../../backend/src/Model'
import { dashboardConfig, Severity } from '../config'
import { ChildTopic, useTopicChildren, useDeviceSeverities } from '../useTopicChildren'
import { ConnectionHealth } from '../../reducers/Connection'
import { DeviceSnapshot, useMqttStore } from './mqttStore'

interface Props {
  tree?: q.Tree<any>
  connected: boolean
  health?: ConnectionHealth
  host?: string
}

function toSnapshotMap(devices: ChildTopic[], severities: Record<string, Severity>): Record<string, DeviceSnapshot> {
  const out: Record<string, DeviceSnapshot> = {}
  devices.forEach(d => {
    out[d.key] = { key: d.key, lastUpdate: d.node.lastUpdate, severity: severities[d.key] ?? 'OK' }
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
  const flowSeverities = useDeviceSeverities(flowDevices)
  const pumpSeverities = useDeviceSeverities(pumpDevices)

  const setConnection = useMqttStore(s => s.setConnection)
  const setFlowMonitors = useMqttStore(s => s.setFlowMonitors)
  const setPumpStations = useMqttStore(s => s.setPumpStations)

  React.useEffect(() => {
    setConnection(connected, health, host)
  }, [connected, health, host, setConnection])

  React.useEffect(() => {
    setFlowMonitors(toSnapshotMap(flowDevices, flowSeverities))
  }, [flowDevices, flowSeverities, setFlowMonitors])

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
