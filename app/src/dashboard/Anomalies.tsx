import * as React from 'react'
import { connect } from 'react-redux'
import { Link, useSearchParams } from 'react-router-dom'
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

// "-3..4" raw diurnal levels (see AnomalyEvent's own comment) rendered as
// their own labeled lines rather than folded into `description`'s free
// text — only diurnal events carry these, and either can be absent on its
// own (the detector doesn't always publish both), so each line only shows
// up when its value is actually present.
function DiurnalAnomalyValues({ e }: { e: ReturnType<typeof useAnomalyFeed>['events'][number] }) {
  if (e.normalAnomalyLevel === undefined && e.avgAnomalyLevel === undefined) {
    return null
  }
  return (
    <div style={{ fontSize: 12, opacity: 0.8, marginBottom: 6 }}>
      {e.normalAnomalyLevel !== undefined && <div>Normal Anomaly Val: {e.normalAnomalyLevel}</div>}
      {e.avgAnomalyLevel !== undefined && <div>Average Anomaly Value: {e.avgAnomalyLevel}</div>}
    </div>
  )
}

/**
 * Whole card is the link (matches SimpleDeviceCard, used the same way on
 * the Flow Monitors/Pump Stations tabs) — clicking anywhere on it, not just
 * the device id, goes to that device's detail page.
 */
function AnomalyCard({ e }: { e: ReturnType<typeof useAnomalyFeed>['events'][number] }) {
  return (
    <Link
      to={`${DEVICE_TYPE_ROUTE_PREFIX[e.deviceType]}/${e.deviceKey}`}
      className="cmom-card"
      style={{
        display: 'block',
        padding: 'var(--cmom-space-3, 12px)',
        textDecoration: 'none',
        color: 'inherit',
        borderLeft: `3px solid ${severityColors[e.severity]}`,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 6 }}>
        <span style={{ fontFamily: 'var(--cmom-font-mono)', fontWeight: 700, fontSize: 14, overflowWrap: 'break-word' }}>
          {e.deviceKey}
        </span>
        <span style={{ fontSize: 11, opacity: 0.7, flexShrink: 0 }}>{e.deviceType}</span>
      </div>
      <div style={{ fontSize: 12, fontFamily: 'var(--cmom-font-mono)', opacity: 0.85, marginBottom: 6, overflowWrap: 'break-word' }}>
        {e.anomalyType}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 4, marginBottom: 6, fontSize: 13 }}>
        <SeverityDot severity={e.previousSeverity} />
        {e.previousSeverity}
        <span style={{ opacity: 0.5, margin: '0 2px' }}>&#8594;</span>
        <SeverityDot severity={e.severity} />
        <strong>{e.severity}</strong>
      </div>
      <DiurnalAnomalyValues e={e} />
      {/* For a diurnal event, `description` is just "vs. hour avg X, vs.
          normal shape Y" in prose — the same two numbers DiurnalAnomalyValues
          above already shows as labeled lines, so showing both said the same
          thing twice. Only non-diurnal events (which have no normal/avg
          anomaly level) still show their description here. */}
      {e.description && e.normalAnomalyLevel === undefined && e.avgAnomalyLevel === undefined && (
        <div style={{ fontSize: 12, opacity: 0.8, marginBottom: 6, overflowWrap: 'break-word' }}>{e.description}</div>
      )}
      <div style={{ fontSize: 11, opacity: 0.6 }}>{new Date(e.time).toLocaleString()}</div>
    </Link>
  )
}

function FeedPanel({ filtered }: { filtered: ReturnType<typeof useAnomalyFeed>['events'] }) {
  return filtered.length === 0 ? (
    <div style={{ opacity: 0.7 }}>No anomaly transitions observed yet this session.</div>
  ) : (
    // Wider min column than the default .cmom-card-grid (140px) — these
    // cards carry a device id, anomaly type, severity transition, and
    // sometimes two extra value lines, which read as cramped/cut-off at the
    // default width.
    <div className="cmom-card-grid" style={{ ['--cmom-grid-min' as any]: '300px' }}>
      {filtered.map(e => (
        <AnomalyCard key={e.id} e={e} />
      ))}
    </div>
  )
}

// Only a real Severity value counts — anything else in the query string
// (missing, misspelled, tampered with) falls back to 'All' rather than
// silently filtering to nothing.
function severityFromQueryParam(value: string | null): Severity | 'All' {
  return value && (severityOrder as string[]).includes(value) ? (value as Severity) : 'All'
}

function Anomalies({ tree }: Props) {
  const { events } = useAnomalyFeed(tree)
  const [searchParams] = useSearchParams()
  const [deviceTypeFilter, setDeviceTypeFilter] = React.useState<DeviceType | 'All'>('All')
  // Seeded from ?severity=... (AlarmsWidget's per-severity links on
  // Overview land here already filtered) — read once on mount, same as any
  // other initial-state seed; the Filters panel's own dropdown takes over
  // from here for the rest of the session.
  const [severityFilter, setSeverityFilter] = React.useState<Severity | 'All'>(() =>
    severityFromQueryParam(searchParams.get('severity'))
  )
  // Anomalies stays mounted the whole session (DashboardTabs toggles it via
  // CSS display, not conditional render — see its own paneStyle comment),
  // so the lazy useState initializer above only ever fires once on the very
  // first visit. A second click on a different Overview severity button
  // changes the URL without remounting this component, so re-apply the
  // filter whenever the query param itself changes too.
  React.useEffect(() => {
    const fromUrl = searchParams.get('severity')
    if (fromUrl) {
      setSeverityFilter(severityFromQueryParam(fromUrl))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams.get('severity')])

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
      // Taller default than the old h:6 (540px) — cards were wrapping to
      // several rows and needing an inner scroll to see the rest even with
      // a modest number of anomalies. Panel is still user-resizable.
      defaultLayout: { x: 0, y: 1, w: 12, h: 12, minW: 4, minH: 3 },
      render: () => <FeedPanel filtered={filtered} />,
    },
  ]

  return <DashboardGrid storageKey="dashboard.grid.anomalies" panels={panels} />
}

const mapStateToProps = (state: AppState) => ({
  tree: state.connection.tree,
})

export default connect(mapStateToProps)(Anomalies)
