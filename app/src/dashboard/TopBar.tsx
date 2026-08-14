import * as React from 'react'
import { useMqttStore } from './store/mqttStore'

/**
 * Top bar mirroring TopBar.qml: app title, pulsing broker connection dot,
 * broker host, and device counts — separated by 1px vertical dividers.
 * The reference also shows UPTIME/LATENCY/role/logout, but we have no real
 * data behind those (no session uptime tracking, no per-message latency
 * measurement, no auth/role system in this app), so they're omitted rather
 * than faked.
 */
export default function TopBar() {
  const connected = useMqttStore(s => s.connected)
  const health = useMqttStore(s => s.health)
  const host = useMqttStore(s => s.host)
  const flowCount = useMqttStore(s => Object.keys(s.flowMonitors).length)
  const pumpCount = useMqttStore(s => Object.keys(s.pumpStations).length)

  return (
    <div className="cmom-dashboard cmom-topbar">
      <div className="cmom-topbar-title">CMOM Flow Monitoring Dashboard</div>
      <div className="cmom-topbar-spacer" />

      <div className="cmom-topbar-item">
        <span
          className={connected ? 'cmom-status-dot cmom-status-dot--pulse' : 'cmom-status-dot'}
          style={{ backgroundColor: connected ? 'var(--cmom-status-online)' : 'var(--cmom-status-offline)' }}
        />
        <span style={{ fontWeight: 700, color: connected ? 'var(--cmom-status-online)' : 'var(--cmom-status-offline)' }}>
          {connected ? 'CONNECTED' : health === 'connecting' ? 'CONNECTING' : 'DISCONNECTED'}
        </span>
      </div>

      <div className="cmom-topbar-divider" />

      <div className="cmom-topbar-item">
        <span className="cmom-label">Broker:</span>
        <span style={{ color: 'var(--cmom-text-primary)', fontWeight: 700 }}>{host || '—'}</span>
      </div>

      <div className="cmom-topbar-divider" />

      <div className="cmom-topbar-item">
        <span className="cmom-label">Flow Monitors:</span>
        <span style={{ color: 'var(--cmom-text-primary)', fontWeight: 700 }}>{flowCount}</span>
      </div>

      <div className="cmom-topbar-item">
        <span className="cmom-label">Pump Stations:</span>
        <span style={{ color: 'var(--cmom-text-primary)', fontWeight: 700 }}>{pumpCount}</span>
      </div>
    </div>
  )
}
