import * as React from 'react'
import { connect } from 'react-redux'
import { Routes, Route, useNavigate, useParams } from 'react-router-dom'
import { AppState } from '../reducers'
import * as q from '../../../backend/src/Model'
import { dashboardConfig } from './config'
import { useTopicChildren, ChildTopic } from './useTopicChildren'
import DeviceTable from './DeviceTable'
import FlowMonitorDetail from './FlowMonitorDetail'
import { useMqttStore } from './store/mqttStore'

interface Props {
  tree?: q.Tree<any>
}

function FlowMonitorDetailRoute({ devices }: { devices: ChildTopic[] }) {
  const { siteId } = useParams<{ siteId: string }>()
  const navigate = useNavigate()
  const device = devices.find(d => d.key === siteId)

  if (!device) {
    return (
      <div style={{ padding: 16 }}>
        <button type="button" onClick={() => navigate('/flow-monitors')} style={{ marginBottom: 12 }}>
          &larr; Back
        </button>
        <div style={{ opacity: 0.7 }}>Site &quot;{siteId}&quot; hasn&apos;t been seen on the broker yet.</div>
      </div>
    )
  }

  return (
    <FlowMonitorDetail
      deviceKey={device.key}
      deviceNode={device.node}
      onBack={() => navigate('/flow-monitors')}
    />
  )
}

function FlowMonitors({ tree }: Props) {
  // The detail route needs the actual tree node (for TopicPlot history etc),
  // so it still reads through useTopicChildren. The table only needs the
  // current-value/severity snapshot, so it reads that from the shared store
  // instead — decoupled from the Explorer tree component.
  const devices = useTopicChildren(tree, dashboardConfig.flowMonitors.topicPrefix)
  const flowMonitors = useMqttStore(s => s.flowMonitors)
  const rows = React.useMemo(() => Object.values(flowMonitors), [flowMonitors])

  return (
    <Routes>
      <Route
        path="/flow-monitors"
        element={<DeviceTable devices={rows} keyLabel="Site ID" linkTo={key => `/flow-monitors/${key}`} />}
      />
      <Route path="/flow-monitors/:siteId" element={<FlowMonitorDetailRoute devices={devices} />} />
    </Routes>
  )
}

const mapStateToProps = (state: AppState) => ({
  tree: state.connection.tree,
})

export default connect(mapStateToProps)(FlowMonitors)
