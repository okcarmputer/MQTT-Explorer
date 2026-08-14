import * as React from 'react'
import { connect } from 'react-redux'
import { useNavigate } from 'react-router-dom'
import { AppState } from '../reducers'
import * as q from '../../../backend/src/Model'
import { Severity, severityColors, severityOrder } from './config'
import { useFleetAnomalySeverities } from './useTopicChildren'
import { useAnomalyFeed } from './useAnomalyFeed'
import { DeviceSnapshot, useMqttStore } from './store/mqttStore'
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

/**
 * Live device grid section — one DeviceCard per tracked device, worst
 * severity first, capped to `limit` since a fleet can run to 150+ sites and
 * this is an at-a-glance view, not the full list (that's what the Flow
 * Monitors / Pump Stations tabs are for, linked via each card's "View
 * Details" and the section's "View all" link).
 */
function LiveDeviceSection({
  title,
  devices,
  deviceType,
  linkPrefix,
  viewAllTo,
  limit = 8,
}: {
  title: string
  devices: DeviceSnapshot[]
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
  const shown = sorted.slice(0, limit)

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
            View all ({devices.length}) →
          </button>
        )}
      </div>
      {devices.length === 0 ? (
        <div style={{ opacity: 0.7, fontSize: 12 }}>No devices seen on this topic prefix yet.</div>
      ) : (
        <div className="cmom-device-grid">
          {shown.map(d => (
            <DeviceCard
              key={d.key}
              deviceKey={d.key}
              deviceType={deviceType}
              severity={d.severity}
              lastUpdate={d.lastUpdate}
              details={[]}
              linkTo={`${linkPrefix}/${d.key}`}
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
  const flowRows = React.useMemo(() => Object.values(flowMonitors), [flowMonitors])
  const pumpRows = React.useMemo(() => Object.values(pumpStations), [pumpStations])

  return (
    <div style={{ padding: 'var(--cmom-space-5)', display: 'flex', flexDirection: 'column', gap: 'var(--cmom-space-5)' }}>
      <div className="cmom-stat-grid">
        <StatTile
          label="Broker"
          value={connected ? 'UP' : health === 'connecting' ? '…' : 'DOWN'}
          color={connected ? 'var(--cmom-status-online)' : 'var(--cmom-status-offline)'}
          subtitle={connected ? 'connected' : health === 'connecting' ? 'connecting' : 'disconnected'}
        />
        <StatTile label="Flow Monitors" value={flowRows.length} subtitle="tracked" />
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
