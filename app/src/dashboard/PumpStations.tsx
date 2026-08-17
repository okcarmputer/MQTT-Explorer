import * as React from 'react'
import { connect } from 'react-redux'
import { Routes, Route, useLocation, useNavigate, useParams } from 'react-router-dom'
import { AppState } from '../reducers'
import * as q from '../../../backend/src/Model'
import { dashboardConfig, Severity } from './config'
import { useTopicChildren, ChildTopic } from './useTopicChildren'
import SimpleDeviceGrid from './SimpleDeviceGrid'
import SimpleDeviceCard from './SimpleDeviceCard'
import PumpStationDetail from './PumpStationDetail'
import { usePumpStationSummary } from './usePumpStationSummary'
import { useMqttStore } from './store/mqttStore'

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

interface PumpStationRow {
  key: string
  severity: Severity
  lastUpdate: number
  node: q.TreeNode<any>
}

/**
 * One card, as its own component (not inlined in the .map below) because it
 * calls usePumpStationSummary per station to build the UnitStatus subtitle —
 * a hook can't be called conditionally inside a loop, but it's fine as one
 * call per mounted card instance.
 */
function PumpStationGridCard({ row }: { row: PumpStationRow }) {
  const summary = usePumpStationSummary(row.node)
  const description = summary.unitStatus['Description']
  const location = summary.unitStatus['Location']
  const subtitle = [description, location].filter(Boolean).join(' — ') || undefined

  return (
    <SimpleDeviceCard
      deviceKey={row.key}
      deviceType="Pump Station"
      severity={row.severity}
      lastUpdate={row.lastUpdate}
      linkTo={`/pump-stations/${row.key}`}
      subtitle={subtitle}
    />
  )
}

/**
 * Pump Stations: a filterable card grid — each card links to that
 * station's own full device dashboard (PumpStationDetail, which has all
 * Unit Status fields, not just the Description/Location shown here).
 */
function PumpStations({ tree }: Props) {
  // The detail route needs the actual tree node (for TopicPlot history
  // etc), so it still reads through useTopicChildren. The grid takes
  // severity/lastUpdate from the shared store, same split as FlowMonitors.tsx.
  const devices = useTopicChildren(tree, dashboardConfig.pumpStations.topicPrefix)
  const pumpStations = useMqttStore(s => s.pumpStations)

  const rows = React.useMemo<PumpStationRow[]>(
    () =>
      devices.map(d => {
        const snapshot = pumpStations[d.key]
        return {
          key: d.key,
          severity: snapshot?.severity ?? 'OK',
          lastUpdate: snapshot?.lastUpdate ?? d.node.lastUpdate,
          node: d.node,
        }
      }),
    [devices, pumpStations]
  )

  // This component stays mounted at all times (DashboardTabs just toggles
  // display:none) so its state survives switching tabs — but <Routes>
  // itself doesn't know that, and logs a "No routes matched" warning every
  // time the URL is on a different tab's path. Skipping the match attempt
  // entirely while this tab isn't the active route removes that noise
  // without changing DashboardTabs' always-mounted design.
  const location = useLocation()
  if (!location.pathname.startsWith('/pump-stations')) {
    return null
  }

  return (
    <Routes>
      <Route
        path="/pump-stations"
        element={<SimpleDeviceGrid devices={rows} keyLabel="Serial" renderCard={row => <PumpStationGridCard key={row.key} row={row} />} />}
      />
      <Route path="/pump-stations/:serial" element={<PumpStationDetailRoute devices={devices} />} />
    </Routes>
  )
}

const mapStateToProps = (state: AppState) => ({
  tree: state.connection.tree,
})

export default connect(mapStateToProps)(PumpStations)
