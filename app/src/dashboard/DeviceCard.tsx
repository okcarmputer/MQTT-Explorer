import * as React from 'react'
import { Link } from 'react-router-dom'
import { Severity, severityColors } from './config'

interface DetailRow {
  label: string
  value: React.ReactNode
}

interface Props {
  deviceKey: string
  deviceType: string
  severity: Severity
  lastUpdate: number
  details: DetailRow[]
  linkTo: string
  // True when the site has published no measurements at all — distinct
  // from severity, which only means something once there's a reading to
  // score. A stale card renders a neutral grey "NOT UPDATED" state instead
  // of a severity color/badge, and lastUpdate is meaningless (never shown).
  stale?: boolean
  // Extra fields (site_info: name, location, ...) shown behind a collapsed
  // disclosure rather than always-visible rows, so a card with a lot of
  // published attributes doesn't crowd out the measurements that matter.
  attributes?: DetailRow[]
}

/**
 * Card mirroring DeviceCard.qml: pulsing status dot, id/type header,
 * severity badge, a key/value detail grid, and a bottom "view details"
 * link. Severity here plays the role the reference's online/offline dot
 * played — OK renders as the online/green state, anything else as an
 * alert state, using the existing shared severityColors map.
 */
export default function DeviceCard({ deviceKey, deviceType, severity, lastUpdate, details, linkTo, stale, attributes }: Props) {
  const color = stale ? 'var(--cmom-text-tertiary)' : severityColors[severity]
  const isOk = !stale && severity === 'OK'

  return (
    <div className="cmom-card cmom-device-card">
      <div className="cmom-device-card-header">
        <span
          className={isOk ? 'cmom-status-dot cmom-status-dot--pulse' : 'cmom-status-dot'}
          style={{ backgroundColor: color }}
        />
        <span className="cmom-device-card-id" title={deviceKey}>
          {deviceKey}
        </span>
        <span className="cmom-badge" style={{ color }}>
          {stale ? 'NOT UPDATED' : severity}
        </span>
      </div>
      <div className="cmom-label">{deviceType}</div>
      <div className="cmom-device-card-details">
        {!stale && (
          <>
            <span className="cmom-label">Last seen:</span>
            <span>{new Date(lastUpdate).toLocaleTimeString()}</span>
          </>
        )}
        {details.map(d => (
          <React.Fragment key={d.label}>
            <span className="cmom-label">{d.label}:</span>
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.value}</span>
          </React.Fragment>
        ))}
      </div>
      {attributes && attributes.length > 0 && (
        <details className="cmom-device-card-attrs">
          <summary>Attributes ({attributes.length})</summary>
          <div className="cmom-device-card-details">
            {attributes.map(a => (
              <React.Fragment key={a.label}>
                <span className="cmom-label">{a.label}:</span>
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.value}</span>
              </React.Fragment>
            ))}
          </div>
        </details>
      )}
      <Link to={linkTo} className="cmom-device-card-action">
        View Details
      </Link>
    </div>
  )
}
