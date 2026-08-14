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
}

/**
 * Card mirroring DeviceCard.qml: pulsing status dot, id/type header,
 * severity badge, a key/value detail grid, and a bottom "view details"
 * link. Severity here plays the role the reference's online/offline dot
 * played — OK renders as the online/green state, anything else as an
 * alert state, using the existing shared severityColors map.
 */
export default function DeviceCard({ deviceKey, deviceType, severity, lastUpdate, details, linkTo }: Props) {
  const color = severityColors[severity]
  const isOk = severity === 'OK'

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
          {severity}
        </span>
      </div>
      <div className="cmom-label">{deviceType}</div>
      <div className="cmom-device-card-details">
        <span className="cmom-label">Last seen:</span>
        <span>{new Date(lastUpdate).toLocaleTimeString()}</span>
        {details.map(d => (
          <React.Fragment key={d.label}>
            <span className="cmom-label">{d.label}:</span>
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.value}</span>
          </React.Fragment>
        ))}
      </div>
      <Link to={linkTo} className="cmom-device-card-action">
        View Details
      </Link>
    </div>
  )
}
