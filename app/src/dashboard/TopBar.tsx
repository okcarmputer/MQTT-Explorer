import * as React from 'react'
import { connect } from 'react-redux'
import { bindActionCreators } from 'redux'
import { connectionActions } from '../actions'
import { AppState } from '../reducers'
import { toMqttConnection, ConnectionOptions } from '../model/ConnectionOptions'
import PauseButton from '../components/Layout/PauseButton'
import { useMqttStore } from './store/mqttStore'

interface Props {
  selectedConnection?: ConnectionOptions
  connected: boolean
  actions: {
    connection: typeof connectionActions
  }
}

interface TopBarProps {
  onAskClick?: () => void
}

/**
 * Connect/Disconnect toggle — moved here from the old TitleBar banner
 * (removed; this dashboard header is now the only place these live). Uses
 * the same connect(mqttOptions, connectionId) call ConnectionItem's own
 * "double-click to connect" does, against whichever connection is
 * currently selected in the connection manager.
 */
function ConnectionControls({ selectedConnection, connected, actions }: Props) {
  if (connected) {
    return (
      <button type="button" className="cmom-topbar-button cmom-topbar-button--danger" onClick={() => actions.connection.disconnect()}>
        Disconnect
      </button>
    )
  }

  const handleConnect = () => {
    if (!selectedConnection) return
    const mqttOptions = toMqttConnection(selectedConnection)
    if (mqttOptions) {
      actions.connection.connect(mqttOptions, selectedConnection.id)
    }
  }

  return (
    <button type="button" className="cmom-topbar-button" onClick={handleConnect} disabled={!selectedConnection}>
      Connect
    </button>
  )
}

const ConnectedConnectionControls = connect(
  (state: AppState) => ({
    selectedConnection: state.connectionManager.selected ? state.connectionManager.connections[state.connectionManager.selected] : undefined,
    connected: state.connection.connected,
  }),
  (dispatch: any) => ({
    actions: { connection: bindActionCreators(connectionActions, dispatch) },
  })
)(ConnectionControls)

/**
 * Top bar mirroring TopBar.qml: app title, pulsing broker connection dot,
 * broker host, device counts, and (moved here from the removed TitleBar
 * banner) pause/connect/disconnect controls — separated by 1px vertical
 * dividers. The reference also shows UPTIME/LATENCY/role/logout, but we
 * have no real data behind those (no session uptime tracking, no
 * per-message latency measurement, no auth/role system), so they're
 * omitted rather than faked.
 */
export default function TopBar({ onAskClick }: TopBarProps) {
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

      <div className="cmom-topbar-divider" />

      <div className="cmom-topbar-item" style={{ color: 'var(--cmom-text-muted)' }}>
        <PauseButton />
      </div>

      {onAskClick && (
        <>
          <div className="cmom-topbar-divider" />
          <button type="button" className="cmom-topbar-button" onClick={onAskClick}>
            Ask the Fleet
          </button>
        </>
      )}

      <ConnectedConnectionControls />
    </div>
  )
}
