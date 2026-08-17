import * as React from 'react'
import { connect } from 'react-redux'
import { Routes, Route, useLocation, useNavigate, useParams } from 'react-router-dom'
import { AppState } from '../reducers'
import * as q from '../../../backend/src/Model'
import { dashboardConfig } from './config'
import { useTopicChildren, ChildTopic } from './useTopicChildren'
import SimpleDeviceGrid from './SimpleDeviceGrid'
import SimpleDeviceCard from './SimpleDeviceCard'
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

/**
 * Flow Monitors: a filterable card grid — each card links to that site's
 * own full device dashboard (FlowMonitorDetail, with the pipe-fill gauge,
 * trends, and attributes) rather than showing device state inline here.
 */
function FlowMonitors({ tree }: Props) {
  // The detail route needs the actual tree node (for TopicPlot history etc),
  // so it still reads through useTopicChildren. The grid takes
  // severity/lastUpdate straight from the shared store.
  const devices = useTopicChildren(tree, dashboardConfig.flowMonitors.topicPrefix)
  const flowMonitors = useMqttStore(s => s.flowMonitors)
  const rows = React.useMemo(() => Object.values(flowMonitors), [flowMonitors])

  // This component stays mounted at all times (DashboardTabs just toggles
  // display:none) so its state survives switching tabs — but <Routes>
  // itself doesn't know that, and logs a "No routes matched" warning every
  // time the URL is on a different tab's path. Skipping the match attempt
  // entirely while this tab isn't the active route removes that noise
  // without changing DashboardTabs' always-mounted design.
  const location = useLocation()
  if (!location.pathname.startsWith('/flow-monitors')) {
    return null
  }

  return (
    <Routes>
      <Route
        path="/flow-monitors"
        element={
          <SimpleDeviceGrid
            devices={rows}
            keyLabel="Site"
            renderCard={row => (
              <SimpleDeviceCard
                key={row.key}
                deviceKey={row.key}
                deviceType="Flow Monitor"
                severity={row.severity}
                lastUpdate={row.lastUpdate}
                linkTo={`/flow-monitors/${row.key}`}
              />
            )}
          />
        }
      />
      <Route path="/flow-monitors/:siteId" element={<FlowMonitorDetailRoute devices={devices} />} />
    </Routes>
  )
}

const mapStateToProps = (state: AppState) => ({
  tree: state.connection.tree,
})

export default connect(mapStateToProps)(FlowMonitors)
