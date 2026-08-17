import * as React from 'react'
import { Link } from 'react-router-dom'
import { Severity, severityColors } from './config'

interface Props {
  deviceKey: string
  deviceType: string
  severity: Severity
  lastUpdate: number
  linkTo: string
  // One extra line of context, e.g. a pump station's UnitStatus
  // Description/Location — kept to a single line, not the full attribute
  // dump (that's what clicking through to the detail page is for).
  subtitle?: string
  stale?: boolean
}

/**
 * Compact, clickable device card — same visual language as
 * RecentAnomaliesWidget's cards (severity-colored top border, device type,
 * key, one line of context), reused here for the Flow Monitors/Pump
 * Stations lists so both feel like the same app. Clicking goes straight to
 * that device's full detail page, same as before.
 */
export default function SimpleDeviceCard({ deviceKey, deviceType, severity, lastUpdate, linkTo, subtitle, stale }: Props) {
  const color = stale ? 'var(--cmom-text-tertiary)' : severityColors[severity]

  return (
    <Link
      to={linkTo}
      className="cmom-card"
      style={{
        display: 'block',
        padding: 'var(--cmom-space-3)',
        textDecoration: 'none',
        color: 'inherit',
        borderTop: `2px solid ${color}`,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <span className="cmom-label">{deviceType}</span>
        <span className="cmom-label" style={{ color }}>
          {stale ? 'NOT UPDATED' : severity}
        </span>
      </div>
      <div
        style={{
          fontFamily: 'var(--cmom-font-mono)',
          fontWeight: 700,
          fontSize: 15,
          marginTop: 4,
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
        }}
      >
        {deviceKey}
      </div>
      {subtitle && (
        <div
          style={{
            fontSize: 11,
            opacity: 0.7,
            marginTop: 2,
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          {subtitle}
        </div>
      )}
      {!stale && (
        <div className="cmom-label" style={{ marginTop: 6 }}>
          {new Date(lastUpdate).toLocaleTimeString()}
        </div>
      )}
    </Link>
  )
}
