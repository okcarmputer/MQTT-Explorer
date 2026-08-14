import * as React from 'react'
import DashboardIcon from '@mui/icons-material/Dashboard'
import WaterIcon from '@mui/icons-material/Water'
import SettingsInputComponentIcon from '@mui/icons-material/SettingsInputComponent'
import WarningIcon from '@mui/icons-material/Warning'
import AccountTreeIcon from '@mui/icons-material/AccountTree'
import { useMqttStore } from './store/mqttStore'

export interface NavItem {
  label: string
  icon: React.ReactNode
}

export const navItems: NavItem[] = [
  { label: 'Overview', icon: <DashboardIcon /> },
  { label: 'Flow Monitors', icon: <WaterIcon /> },
  { label: 'Pump Stations', icon: <SettingsInputComponentIcon /> },
  { label: 'Anomalies', icon: <WarningIcon /> },
  { label: 'Explorer', icon: <AccountTreeIcon /> },
]

interface Props {
  activeIndex: number
  onSelect: (index: number) => void
}

/**
 * Left navigation rail, mirroring the reference app's Sidebar.qml: logo
 * mark, nav list with a left-accent bar on the active item, and a bottom
 * "system status" mini-card. Unlike the reference (a hardcoded "All Systems
 * OK"), the status card here reflects the real broker connection from
 * useMqttStore — no fabricated state.
 */
export default function Sidebar({ activeIndex, onSelect }: Props) {
  const connected = useMqttStore(s => s.connected)
  const health = useMqttStore(s => s.health)

  const statusLabel = connected ? 'Broker Connected' : health === 'connecting' ? 'Connecting…' : 'Broker Offline'

  return (
    <div className="cmom-dashboard cmom-sidebar">
      <div className="cmom-sidebar-logo">
        <div className="cmom-sidebar-logo-mark">C</div>
        <div className="cmom-sidebar-logo-text">
          CMOM
          <br />
          DASHBOARD
        </div>
      </div>
      <nav className="cmom-nav">
        {navItems.map((item, index) => (
          <button
            key={item.label}
            type="button"
            className={`cmom-nav-item${index === activeIndex ? ' cmom-nav-item--active' : ''}`}
            onClick={() => onSelect(index)}
          >
            <span className="cmom-nav-icon">{item.icon}</span>
            {item.label}
          </button>
        ))}
      </nav>
      <div className="cmom-sidebar-status">
        <div className="cmom-label">System Status</div>
        <div className="cmom-sidebar-status-row">
          <span
            className={connected ? 'cmom-status-dot cmom-status-dot--pulse' : 'cmom-status-dot'}
            style={{ backgroundColor: connected ? 'var(--cmom-status-online)' : 'var(--cmom-status-offline)' }}
          />
          <span style={{ fontSize: 12, color: 'var(--cmom-text-muted)' }}>{statusLabel}</span>
        </div>
      </div>
    </div>
  )
}
