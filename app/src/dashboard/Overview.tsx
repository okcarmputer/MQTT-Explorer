import * as React from 'react'
import { connect } from 'react-redux'
import { useNavigate } from 'react-router-dom'
import { AppState } from '../reducers'
import * as q from '../../../backend/src/Model'
import { Severity, severityColors, severityOrder } from './config'
import { useFleetAnomalySeverities } from './useTopicChildren'
import { useAnomalyFeed } from './useAnomalyFeed'
import { useMqttStore } from './store/mqttStore'
import { useFlowMeasurements } from './useFlowMeasurements'
import DeviceCard from './DeviceCard'

interface Props {
  tree?: q.Tree<any>
}

const severityRank: Record<Severity, number> = { CRITICAL: 0, MODERATE: 1, LOW: 2, OK: 3 }

function countBySeverity(severities: Severity[]): Record<Severity, number> {
  const counts: Record<Severity, number> = { OK: 0, LOW: 0, MODERATE: 0, CRITICAL: 0 }
  severities.forEach(s => {
    counts[s] += 1
  })
  return counts
}

function StatTile({ label, value, color, subtitle }: { label: string; value: React.ReactNode; color?: string; subtitle: string }) {
  return (
    <div className="cmom-card cmom-stat-tile">
      <div className="cmom-label">{label}</div>
      <div className="cmom-stat-tile-value" style={color ? { color } : undefined}>
        {value}
      </div>
      <div className="cmom-stat-tile-subtitle">{subtitle}</div>
    </div>
  )
}

function RecentEventsPanel({ events }: { events: ReturnType<typeof useAnomalyFeed>['events'] }) {
  const recentEvents = events.slice(0, 8)
  return recentEvents.length === 0 ? (
    <div style={{ opacity: 0.7, fontSize: 12 }}>No transitions yet this session.</div>
  ) : (
    <ul style={{ listStyle: 'none', padding: 0, margin: 0, fontSize: 12 }}>
      {recentEvents.map(e => (
        <li
          key={e.id}
          style={{
            padding: '6px 0',
            borderBottom: '1px solid var(--cmom-border)',
            display: 'flex',
            flexWrap: 'wrap',
            gap: 8,
            overflowWrap: 'anywhere',
          }}
        >
          <span className="cmom-label">{new Date(e.time).toLocaleTimeString()}</span>
          <span>{e.deviceType}</span>
          <span style={{ fontFamily: 'var(--cmom-font-mono)' }}>{e.deviceKey}</span>
          <span style={{ fontFamily: 'var(--cmom-font-mono)', opacity: 0.7 }}>({e.anomalyType})</span>
          <span style={{ color: severityColors[e.severity], fontWeight: 700 }}>
            {e.previousSeverity} → {e.severity}
          </span>
        </li>
      ))}
    </ul>
  )
}

interface LiveDeviceRow {
  key: string
  severity: Severity
  lastUpdate: number
  details: { label: string; value: React.ReactNode }[]
  stale?: boolean
}

/**
 * Live device grid section — one DeviceCard per device. `limit` caps how
 * many show (worst severity first) with a "View all" link to the full tab;
 * omit it to always show every row passed in (used for Flow Monitors, since
 * the caller already filters out sites with no measurements — see Overview
 * below — so everything left here is meant to be shown).
 */
function LiveDeviceSection({
  title,
  devices,
  deviceType,
  linkPrefix,
  viewAllTo,
  limit,
}: {
  title: string
  devices: LiveDeviceRow[]
  deviceType: string
  linkPrefix: string
  viewAllTo: string
  limit?: number
}) {
  const navigate = useNavigate()
  const sorted = React.useMemo(
    () => [...devices].sort((a, b) => severityRank[a.severity] - severityRank[b.severity]),
    [devices]
  )
  const shown = limit ? sorted.slice(0, limit) : sorted

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
        <h3 style={{ margin: 0 }}>{title}</h3>
        {devices.length > 0 && (
          <button
            type="button"
            onClick={() => navigate(viewAllTo)}
            className="cmom-label"
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--cmom-accent)' }}
          >
            {limit && devices.length > limit ? `View all (${devices.length}) →` : `Open full view →`}
          </button>
        )}
      </div>
      {devices.length === 0 ? (
        <div style={{ opacity: 0.7, fontSize: 12 }}>No sites with measurements yet.</div>
      ) : (
        <div className="cmom-device-grid">
          {shown.map(d => (
            <DeviceCard
              key={d.key}
              deviceKey={d.key}
              deviceType={deviceType}
              severity={d.severity}
              lastUpdate={d.lastUpdate}
              details={d.details}
              linkTo={`${linkPrefix}/${d.key}`}
              stale={d.stale}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function Overview({ tree }: Props) {
  const { events, flowDevices, pumpDevices } = useAnomalyFeed(tree)
  // Fleet-wide rollup across every anomaly type (channel/input) on every
  // device — devices themselves carry no severity to roll up from. This is
  // a per-anomaly-type count, not per-device, so it stays sourced from the
  // tree directly rather than the store's per-device severity rollup.
  const flowSeverities = useFleetAnomalySeverities(flowDevices)
  const pumpSeverities = useFleetAnomalySeverities(pumpDevices)
  const counts = countBySeverity([...flowSeverities, ...pumpSeverities])

  // Broker connection status and per-device snapshots are simple
  // current-value state, so this reads them from the shared MQTT store
  // (populated by MqttStoreSync) instead of the tree/redux directly — it
  // updates independently of the Explorer tab.
  const connected = useMqttStore(s => s.connected)
  const health = useMqttStore(s => s.health)
  const flowMonitors = useMqttStore(s => s.flowMonitors)
  const pumpStations = useMqttStore(s => s.pumpStations)

  // Live Level/Velocity/Flow readings + each site's actual last-reading
  // time, read straight from the channel nodes (see useFlowMeasurements) —
  // the store snapshot only carries severity + the site node's own lastUpdate.
  const flowMeasurements = useFlowMeasurements(flowDevices)

  // A site with no Level/Velocity/Flow reading yet hasn't actually
  // published anything meaningful — treated as "not updated" rather than
  // OK, and left out of the Overview grid entirely (it'll appear here as
  // soon as it publishes a first reading; the full Flow Monitors tab still
  // lists it, with a toggle to hide/show these). Overview intentionally
  // shows only site, last-reading time, and measurements — no site_info
  // attributes (name/location/etc); those live behind "View Details" and
  // the Flow Monitors tab's own attributes dropdown, not here.
  const flowRows = React.useMemo<LiveDeviceRow[]>(() => {
    const rows: LiveDeviceRow[] = []
    Object.values(flowMonitors).forEach(row => {
      const measurement = flowMeasurements[row.key]
      const readings = measurement?.readings ?? {}
      if (Object.keys(readings).length === 0) {
        return
      }
      const details = (['level', 'velocity', 'flow'] as const)
        .filter(k => readings[k])
        .map(k => ({ label: `${readings[k]!.label} (${readings[k]!.unit})`, value: readings[k]!.value }))
      rows.push({
        key: row.key,
        severity: row.severity,
        lastUpdate: measurement?.lastUpdate ?? row.lastUpdate,
        details,
      })
    })
    return rows
  }, [flowMonitors, flowMeasurements])
  const pumpRows = React.useMemo<LiveDeviceRow[]>(
    () => Object.values(pumpStations).map(row => ({ key: row.key, severity: row.severity, lastUpdate: row.lastUpdate, details: [] })),
    [pumpStations]
  )

  return (
    <div style={{ padding: 'var(--cmom-space-5)', display: 'flex', flexDirection: 'column', gap: 'var(--cmom-space-5)' }}>
      <div className="cmom-stat-grid">
        <StatTile
          label="Broker"
          value={connected ? 'UP' : health === 'connecting' ? '…' : 'DOWN'}
          color={connected ? 'var(--cmom-status-online)' : 'var(--cmom-status-offline)'}
          subtitle={connected ? 'connected' : health === 'connecting' ? 'connecting' : 'disconnected'}
        />
        <StatTile label="Flow Monitors" value={flowRows.length} subtitle="with readings" />
        <StatTile label="Pump Stations" value={pumpRows.length} subtitle="tracked" />
        {severityOrder.map(s => (
          <StatTile key={s} label={s} value={counts[s]} color={severityColors[s]} subtitle="anomaly types" />
        ))}
      </div>

      <LiveDeviceSection
        title="Flow Monitors"
        devices={flowRows}
        deviceType="Flow Monitor"
        linkPrefix="/flow-monitors"
        viewAllTo="/flow-monitors"
      />

      <LiveDeviceSection
        title="Pump Stations"
        devices={pumpRows}
        deviceType="Pump Station"
        linkPrefix="/pump-stations"
        viewAllTo="/pump-stations"
        limit={8}
      />

      <div>
        <h3 style={{ margin: 0 }}>Most Recent Anomaly Transitions</h3>
        <div className="cmom-card" style={{ padding: 'var(--cmom-space-3)' }}>
          <RecentEventsPanel events={events} />
        </div>
      </div>
    </div>
  )
}

const mapStateToProps = (state: AppState) => ({
  tree: state.connection.tree,
})

export default connect(mapStateToProps)(Overview)
