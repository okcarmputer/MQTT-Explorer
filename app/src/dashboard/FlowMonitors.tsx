import * as React from 'react'
import { connect } from 'react-redux'
import { Routes, Route, useLocation, useNavigate, useParams } from 'react-router-dom'
import { AppState } from '../reducers'
import * as q from '../../../backend/src/Model'
import { dashboardConfig, flowChannels } from './config'
import { useTopicChildren, ChildTopic } from './useTopicChildren'
import SimpleDeviceGrid from './SimpleDeviceGrid'
import SimpleDeviceCard from './SimpleDeviceCard'
import FlowMonitorDetail from './FlowMonitorDetail'
import DataChannelTypes from './DataChannelTypes'
import FlowMonitorMissingAttributes from './FlowMonitorMissingAttributes'
import { useFlowSiteInfo } from './useFlowSiteInfo'
import { useFlowPortInfo, extractDiameter, FlowPortInfo } from './useFlowPortInfo'
import PipeGauge from './widgets/PipeGauge'
import { useMqttStore, DeviceSnapshot } from './store/mqttStore'

interface Props {
  tree?: q.Tree<any>
}

function FlowMonitorDetailRoute({ devices, tree }: { devices: ChildTopic[]; tree?: q.Tree<any> }) {
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
      tree={tree}
      onBack={() => navigate('/flow-monitors')}
    />
  )
}

interface FlowMonitorRow extends DeviceSnapshot {
  node?: q.TreeNode<any>
  searchText: string
}

const levelChannelConfig = flowChannels.find(c => c.key === 'level')

/**
 * Compact live-level preview gauge for one card — subscribes directly to
 * the site's Level channel node (same flowChannels/config.ts source
 * FlowMonitorDetail's own full-size PipeGauge reads) so the reading updates
 * without needing to click into the site's detail page.
 */
function FlowMonitorLevelGauge({ node, ports }: { node: q.TreeNode<any>; ports: FlowPortInfo[] }) {
  const [, setTick] = React.useState(0)
  const levelNode = levelChannelConfig ? node.edges[levelChannelConfig.id]?.target : undefined

  React.useEffect(() => {
    if (!levelNode) return
    const rerender = () => setTick(t => t + 1)
    levelNode.onMessage.subscribe(rerender)
    return () => levelNode.onMessage.unsubscribe(rerender)
  }, [levelNode])

  const levelValue = React.useMemo(() => {
    const payload = levelNode?.message?.payload?.toUnicodeString()
    if (!payload) return undefined
    try {
      const json = JSON.parse(payload)
      return json.Value !== undefined ? Number(json.Value) : undefined
    } catch {
      return undefined
    }
  }, [levelNode?.message])

  const diameter = extractDiameter(ports)
  const diameterValue = diameter?.value ?? levelChannelConfig?.gaugeMaxInches
  const diameterUnit = diameter?.unit ?? 'in'

  if (levelValue === undefined || Number.isNaN(levelValue) || diameterValue === undefined) {
    return null
  }

  return (
    <PipeGauge
      compact
      title="Level"
      diameterValue={diameterValue}
      diameterUnit={diameterUnit}
      levelValue={levelValue}
      levelUnit={levelChannelConfig?.unit || 'in'}
    />
  )
}

function FlowMonitorsGrid({ rows, siteInfo, ports }: { rows: FlowMonitorRow[]; siteInfo: ReturnType<typeof useFlowSiteInfo>; ports: Record<string, FlowPortInfo[]> }) {
  const navigate = useNavigate()

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div style={{ padding: 'var(--cmom-space-4) var(--cmom-space-4) 0' }}>
        <button
          type="button"
          onClick={() => navigate('/flow-monitors/data-channel-types')}
          style={{
            padding: '4px 12px',
            borderRadius: 'var(--cmom-radius-sm)',
            border: '1px solid var(--cmom-border-strong)',
            background: 'transparent',
            color: 'inherit',
            cursor: 'pointer',
          }}
        >
          Data Channel Types
        </button>
      </div>
      <div style={{ flex: 1, minHeight: 0 }}>
        <SimpleDeviceGrid
          devices={rows}
          keyLabel="Site"
          searchLabel="site ID, name, description, or location"
          renderCard={row => {
            // site_info's field casing isn't documented anywhere in this
            // repo (see useFlowSiteInfo), so this looks for any key that
            // reads as "location" rather than assuming exact casing.
            const info = siteInfo[row.key] ?? {}
            const locationKey = Object.keys(info).find(k => k.toLowerCase().includes('location'))
            return (
              <SimpleDeviceCard
                key={row.key}
                deviceKey={row.key}
                deviceType="Flow Monitor"
                severity={row.severity}
                lastUpdate={row.lastUpdate}
                linkTo={`/flow-monitors/${row.key}`}
                subtitle={locationKey ? info[locationKey] : undefined}
              >
                {row.node && <FlowMonitorLevelGauge node={row.node} ports={ports[row.key] ?? []} />}
              </SimpleDeviceCard>
            )
          }}
          headerActions={
            <button
              type="button"
              onClick={() => navigate('/flow-monitors/missing-attributes')}
              style={{
                padding: '4px 12px',
                borderRadius: 'var(--cmom-radius-sm)',
                border: '1px solid var(--cmom-border-strong)',
                background: 'transparent',
                color: 'inherit',
                cursor: 'pointer',
              }}
            >
              Missing Attributes
            </button>
          }
        />
      </div>
    </div>
  )
}

/**
 * Flow Monitors: a filterable card grid — each card links to that site's
 * own full device dashboard (FlowMonitorDetail, with the pipe-fill gauge,
 * trends, and attributes) rather than showing device state inline here.
 * data_channel_types (a reference catalog, not a site — see config.ts) gets
 * its own button/route instead of appearing in the grid.
 */
function FlowMonitors({ tree }: Props) {
  // The detail route needs the actual tree node (for TopicPlot history etc),
  // so it still reads through useTopicChildren. The grid takes
  // severity/lastUpdate straight from the shared store.
  const devices = useTopicChildren(tree, dashboardConfig.flowMonitors.topicPrefix, dashboardConfig.flowMonitors.metadataChildren)
  const flowMonitors = useMqttStore(s => s.flowMonitors)
  // Site name/location/etc from the retained .../site_info topic — same
  // source FlowMonitorDetail's Site Attributes card reads, just surfaced as
  // a one-line subtitle on the card here (mirrors Pump Stations' UnitStatus
  // Description/Location subtitle), and now also as search text.
  const siteInfo = useFlowSiteInfo(devices)
  // Batched across every device at once (not one hook call per card) —
  // needed for the compact list-card pipe gauge's diameter.
  const ports = useFlowPortInfo(devices)

  const rows = React.useMemo<FlowMonitorRow[]>(
    () =>
      Object.values(flowMonitors).map(snapshot => {
        const info = siteInfo[snapshot.key] ?? {}
        const searchText = [snapshot.key, ...Object.values(info).filter((v): v is string => typeof v === 'string')]
          .join(' ')
          .toLowerCase()
        return {
          ...snapshot,
          node: devices.find(d => d.key === snapshot.key)?.node,
          searchText,
        }
      }),
    [flowMonitors, devices, siteInfo]
  )

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
      <Route path="/flow-monitors" element={<FlowMonitorsGrid rows={rows} siteInfo={siteInfo} ports={ports} />} />
      <Route path="/flow-monitors/data-channel-types" element={<DataChannelTypes />} />
      <Route path="/flow-monitors/missing-attributes" element={<FlowMonitorMissingAttributes />} />
      <Route path="/flow-monitors/:siteId" element={<FlowMonitorDetailRoute devices={devices} tree={tree} />} />
    </Routes>
  )
}

const mapStateToProps = (state: AppState) => ({
  tree: state.connection.tree,
})

export default connect(mapStateToProps)(FlowMonitors)
