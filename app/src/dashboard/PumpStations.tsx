import * as React from 'react'
import { connect } from 'react-redux'
import { Routes, Route, useNavigate, useParams } from 'react-router-dom'
import { AppState } from '../reducers'
import * as q from '../../../backend/src/Model'
import { dashboardConfig } from './config'
import { useTopicChildren, ChildTopic } from './useTopicChildren'
import DeviceTable from './DeviceTable'
import PumpStationDetail from './PumpStationDetail'
import { DeviceSnapshot, useMqttStore } from './store/mqttStore'

interface Props {
  tree?: q.Tree<any>
}

function PumpStationDetailRoute({ devices }: { devices: ChildTopic[] }) {
  const { serial } = useParams<{ serial: string }>()
  const navigate = useNavigate()
  const device = devices.find(d => d.key === serial)

  if (!device) {
    return (
      <div style={{ padding: 16 }}>
        <button type="button" onClick={() => navigate('/pump-stations')} style={{ marginBottom: 12 }}>
          &larr; Back
        </button>
        <div style={{ opacity: 0.7 }}>Serial &quot;{serial}&quot; hasn&apos;t been seen on the broker yet.</div>
      </div>
    )
  }

  return (
    <PumpStationDetail
      deviceKey={device.key}
      deviceNode={device.node}
      onBack={() => navigate('/pump-stations')}
    />
  )
}

function PumpStationsTable({ devices }: { devices: DeviceSnapshot[] }) {
  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div style={{ padding: '8px 16px 0', fontSize: 12, opacity: 0.7 }}>
        Reading from topic prefix <code>{dashboardConfig.pumpStations.topicPrefix}</code> (config:{' '}
        <code>app/src/dashboard/config.ts</code>). Click a serial to see status, digital input alarms, and analog
        trends.
      </div>
      <DeviceTable devices={devices} keyLabel="Serial" linkTo={key => `/pump-stations/${key}`} />
    </div>
  )
}

function PumpStations({ tree }: Props) {
  // Detail route still needs the tree node; the table reads current-value/
  // severity snapshots from the shared store instead (see FlowMonitors.tsx
  // for the same split).
  const devices = useTopicChildren(tree, dashboardConfig.pumpStations.topicPrefix)
  const pumpStations = useMqttStore(s => s.pumpStations)
  const rows = React.useMemo(() => Object.values(pumpStations), [pumpStations])

  return (
    <Routes>
      <Route path="/pump-stations" element={<PumpStationsTable devices={rows} />} />
      <Route path="/pump-stations/:serial" element={<PumpStationDetailRoute devices={devices} />} />
    </Routes>
  )
}

const mapStateToProps = (state: AppState) => ({
  tree: state.connection.tree,
})

export default connect(mapStateToProps)(PumpStations)
