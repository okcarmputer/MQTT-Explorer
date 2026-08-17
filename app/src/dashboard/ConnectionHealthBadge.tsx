import * as React from 'react'
import { useMqttStore } from './store/mqttStore'

/**
 * Small broker connection indicator for the top of a tab. Reads the shared
 * MQTT store (store/mqttStore.ts), which MqttStoreSync already keeps in
 * sync from the app's own connection state (state.connection.connected/
 * health/host in the Redux tree, via ConnectionManager) — no new
 * subscription, just a compact rendering of state that already exists.
 */
export default function ConnectionHealthBadge() {
  const connected = useMqttStore(s => s.connected)
  const health = useMqttStore(s => s.health)
  const host = useMqttStore(s => s.host)

  const label = connected ? 'Connected' : health === 'connecting' ? 'Connecting…' : 'Disconnected'
  const color = connected ? 'var(--cmom-status-online)' : health === 'connecting' ? 'var(--cmom-status-warning)' : 'var(--cmom-status-offline)'

  return (
    <div
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 8,
        padding: '5px 12px',
        borderRadius: 999,
        background: 'var(--cmom-surface-elevated)',
        border: '1px solid rgba(255, 255, 255, 0.06)',
      }}
      title={host || undefined}
    >
      <span
        className={connected ? 'cmom-status-dot cmom-status-dot--pulse' : 'cmom-status-dot'}
        style={{ backgroundColor: color }}
      />
      <span className="cmom-label" style={{ color }}>
        {label}
      </span>
      {host && (
        <span className="cmom-label" style={{ color: 'var(--cmom-text-tertiary)' }}>
          {host}
        </span>
      )}
    </div>
  )
}
