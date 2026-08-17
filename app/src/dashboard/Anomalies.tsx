import * as React from 'react'
import { connect } from 'react-redux'
import { Link } from 'react-router-dom'
import { AppState } from '../reducers'
import * as q from '../../../backend/src/Model'
import { Severity, severityColors, severityOrder } from './config'
import { DeviceType, DEVICE_TYPE_ROUTE_PREFIX, useAnomalyFeed } from './useAnomalyFeed'
import DashboardGrid, { GridPanelDef } from './DashboardGrid'

interface Props {
  tree?: q.Tree<any>
}

function SeverityDot({ severity }: { severity: Severity }) {
  return (
    <span
      style={{
        display: 'inline-block',
        width: 10,
        height: 10,
        borderRadius: '50%',
        backgroundColor: severityColors[severity],
        marginRight: 8,
      }}
    />
  )
}

function FiltersPanel({
  deviceTypeFilter,
  setDeviceTypeFilter,
  severityFilter,
  setSeverityFilter,
}: {
  deviceTypeFilter: DeviceType | 'All'
  setDeviceTypeFilter: (v: DeviceType | 'All') => void
  severityFilter: Severity | 'All'
  setSeverityFilter: (v: Severity | 'All') => void
}) {
  return (
    <div style={{ display: 'flex', gap: 'var(--cmom-space-3, 12px)', flexWrap: 'wrap' }}>
      <select value={deviceTypeFilter} onChange={e => setDeviceTypeFilter(e.target.value as any)}>
        <option value="All">All device types</option>
        <option value="Flow Monitor">Flow Monitor</option>
        <option value="Pump Station">Pump Station</option>
      </select>
      <select value={severityFilter} onChange={e => setSeverityFilter(e.target.value as any)}>
        <option value="All">All severities</option>
        {severityOrder.map(s => (
          <option key={s} value={s}>
            {s}
          </option>
        ))}
      </select>
    </div>
  )
}

function FeedPanel({ filtered }: { filtered: ReturnType<typeof useAnomalyFeed>['events'] }) {
  return filtered.length === 0 ? (
    <div style={{ opacity: 0.7 }}>No anomaly transitions observed yet this session.</div>
  ) : (
    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
      <thead>
        <tr style={{ textAlign: 'left', borderBottom: '1px solid var(--cmom-border-strong, rgba(128,128,128,0.4))' }}>
          <th style={{ padding: '6px 8px' }}>Time</th>
          <th style={{ padding: '6px 8px' }}>Device</th>
          <th style={{ padding: '6px 8px' }}>ID</th>
          <th style={{ padding: '6px 8px' }}>Anomaly Type</th>
          <th style={{ padding: '6px 8px' }}>Transition</th>
        </tr>
      </thead>
      <tbody>
        {filtered.map(e => (
          <tr key={e.id} style={{ borderBottom: '1px solid var(--cmom-border, rgba(128,128,128,0.15))' }}>
            <td style={{ padding: '6px 8px', opacity: 0.7 }}>{new Date(e.time).toLocaleTimeString()}</td>
            <td style={{ padding: '6px 8px' }}>{e.deviceType}</td>
            <td style={{ padding: '6px 8px', fontFamily: 'monospace' }}>
              <Link to={`${DEVICE_TYPE_ROUTE_PREFIX[e.deviceType]}/${e.deviceKey}`} style={{ color: 'var(--cmom-accent)' }}>
                {e.deviceKey}
              </Link>
            </td>
            <td style={{ padding: '6px 8px', fontFamily: 'monospace' }}>{e.anomalyType}</td>
            <td style={{ padding: '6px 8px' }}>
              <SeverityDot severity={e.previousSeverity} />
              {e.previousSeverity}
              {' -> '}
              <SeverityDot severity={e.severity} />
              {e.severity}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function Anomalies({ tree }: Props) {
  const { events } = useAnomalyFeed(tree)
  const [deviceTypeFilter, setDeviceTypeFilter] = React.useState<DeviceType | 'All'>('All')
  const [severityFilter, setSeverityFilter] = React.useState<Severity | 'All'>('All')

  const filtered = events.filter(
    e => (deviceTypeFilter === 'All' || e.deviceType === deviceTypeFilter) && (severityFilter === 'All' || e.severity === severityFilter)
  )

  const panels: GridPanelDef[] = [
    {
      id: 'anomaly-filters',
      title: 'Filters',
      defaultLayout: { x: 0, y: 0, w: 12, h: 1, minW: 4, minH: 1 },
      render: () => (
        <FiltersPanel
          deviceTypeFilter={deviceTypeFilter}
          setDeviceTypeFilter={setDeviceTypeFilter}
          severityFilter={severityFilter}
          setSeverityFilter={setSeverityFilter}
        />
      ),
    },
    {
      id: 'anomaly-feed',
      title: 'Anomaly Transitions',
      defaultLayout: { x: 0, y: 1, w: 12, h: 6, minW: 4, minH: 2 },
      render: () => <FeedPanel filtered={filtered} />,
    },
  ]

  return <DashboardGrid storageKey="dashboard.grid.anomalies" panels={panels} />
}

const mapStateToProps = (state: AppState) => ({
  tree: state.connection.tree,
})

export default connect(mapStateToProps)(Anomalies)
