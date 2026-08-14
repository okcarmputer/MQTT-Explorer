import * as React from 'react'
import { connect } from 'react-redux'
import { Routes, Route, useNavigate, useParams } from 'react-router-dom'
import { AppState } from '../reducers'
import * as q from '../../../backend/src/Model'
import { dashboardConfig } from './config'
import { useTopicChildren, ChildTopic } from './useTopicChildren'
import FlowMonitorBoard from './FlowMonitorBoard'
import FlowMonitorDetail from './FlowMonitorDetail'
import { useMqttStore } from './store/mqttStore'
import { useFlowMeasurements } from './useFlowMeasurements'
import { useFlowSiteInfo } from './useFlowSiteInfo'

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
  // so it still reads through useTopicChildren. The board only needs the
  // current-value/severity snapshot plus live measurements/site info.
  const devices = useTopicChildren(tree, dashboardConfig.flowMonitors.topicPrefix)
  const flowMonitors = useMqttStore(s => s.flowMonitors)
  // Level/Velocity/Flow readings + each site's actual last-reading time,
  // read straight from the channel nodes (see useFlowMeasurements) — the
  // store only carries severity + the site node's own lastUpdate. Site info
  // (name/location/etc) comes from the retained .../site_info topic.
  const measurements = useFlowMeasurements(devices)
  const siteInfo = useFlowSiteInfo(devices)

  const rows = React.useMemo(
    () =>
      Object.values(flowMonitors).map(row => {
        const measurement = measurements[row.key]
        return {
          key: row.key,
          severity: row.severity,
          lastUpdate: measurement?.lastUpdate ?? row.lastUpdate,
          readings: measurement?.readings ?? {},
          siteInfo: siteInfo[row.key] ?? {},
        }
      }),
    [flowMonitors, measurements, siteInfo]
  )

  return (
    <Routes>
      <Route path="/flow-monitors" element={<FlowMonitorBoard devices={rows} linkTo={key => `/flow-monitors/${key}`} />} />
      <Route path="/flow-monitors/:siteId" element={<FlowMonitorDetailRoute devices={devices} />} />
    </Routes>
  )
}

const mapStateToProps = (state: AppState) => ({
  tree: state.connection.tree,
})

export default connect(mapStateToProps)(FlowMonitors)
