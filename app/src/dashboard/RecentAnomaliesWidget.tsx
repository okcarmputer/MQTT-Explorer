import * as React from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { severityColors } from './config'
import { AnomalyEvent, DEVICE_TYPE_ROUTE_PREFIX } from './useAnomalyFeed'

interface Props {
  // Reuses useAnomalyFeed's own event list (see Overview.tsx / Anomalies.tsx)
  // rather than re-implementing transition tracking here — this widget is
  // purely a compact, newest-first rendering of it.
  events: AnomalyEvent[]
  limit?: number
}

function AnomalyCard({ event }: { event: AnomalyEvent }) {
  const color = severityColors[event.severity]
  return (
    <Link
      to={`${DEVICE_TYPE_ROUTE_PREFIX[event.deviceType]}/${event.deviceKey}`}
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
        <span className="cmom-label">{event.deviceType}</span>
        <span className="cmom-label">{new Date(event.time).toLocaleTimeString()}</span>
      </div>
      <div style={{ fontFamily: 'var(--cmom-font-mono)', fontWeight: 700, fontSize: 14, marginTop: 4 }}>{event.deviceKey}</div>
      <div style={{ fontFamily: 'var(--cmom-font-mono)', fontSize: 11, opacity: 0.7, marginTop: 2 }}>{event.anomalyType}</div>
      <div style={{ color, fontWeight: 700, fontSize: 13, marginTop: 6 }}>
        {event.previousSeverity} → {event.severity}
      </div>
    </Link>
  )
}

/**
 * Compact "Recent Anomalies" feed for Overview — same transitions the
 * Anomalies tab's full table shows, capped to the most recent few, each as
 * its own clickable card (rather than a text list row) linking straight to
 * that device's real detail page, same as Flow Monitors/Pump Stations.
 */
export default function RecentAnomaliesWidget({ events, limit = 10 }: Props) {
  const navigate = useNavigate()
  const recent = events.slice(0, limit)

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 'var(--cmom-space-2)' }}>
        <h3 style={{ margin: 0 }}>Recent Anomalies</h3>
        {events.length > 0 && (
          <button
            type="button"
            onClick={() => navigate('/anomalies')}
            className="cmom-label"
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--cmom-accent)' }}
          >
            Open full feed →
          </button>
        )}
      </div>
      {recent.length === 0 ? (
        <div style={{ opacity: 0.7, fontSize: 12 }}>No transitions yet this session.</div>
      ) : (
        <div className="cmom-device-grid">
          {recent.map(e => (
            <AnomalyCard key={e.id} event={e} />
          ))}
        </div>
      )}
    </div>
  )
}
