import * as React from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { severityColors, severityOrder } from './config'
import { CurrentAnomaly, DEVICE_TYPE_ROUTE_PREFIX } from './useAnomalyFeed'

interface Props {
  anomalies: CurrentAnomaly[]
}

function AnomalyCard({ anomaly }: { anomaly: CurrentAnomaly }) {
  const color = severityColors[anomaly.severity]
  return (
    <Link
      to={`${DEVICE_TYPE_ROUTE_PREFIX[anomaly.deviceType]}/${anomaly.deviceKey}`}
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
        <span className="cmom-label">{anomaly.deviceType}</span>
        {anomaly.lastUpdate !== undefined && (
          <span className="cmom-label">{new Date(anomaly.lastUpdate).toLocaleTimeString()}</span>
        )}
      </div>
      <div style={{ fontFamily: 'var(--cmom-font-mono)', fontWeight: 700, fontSize: 14, marginTop: 4 }}>{anomaly.deviceKey}</div>
      <div style={{ fontFamily: 'var(--cmom-font-mono)', fontSize: 11, opacity: 0.7, marginTop: 2 }}>{anomaly.anomalyType}</div>
      {anomaly.description && (
        <div style={{ fontSize: 12, marginTop: 4, lineHeight: 1.35 }}>{anomaly.description}</div>
      )}
      <div style={{ color, fontWeight: 700, fontSize: 13, marginTop: 6 }}>{anomaly.severity}</div>
    </Link>
  )
}

/**
 * Every anomaly currently at non-OK severity across the fleet, right now —
 * a live snapshot (see useCurrentAnomalies), not the session-scoped/capped
 * transition feed the old RecentAnomaliesWidget showed here. Worst severity
 * first, and never truncated: an operator glancing at Overview should never
 * be able to miss a currently-active CRITICAL because newer transitions
 * pushed it off a capped "recent" list.
 */
export default function CurrentAnomaliesWidget({ anomalies }: Props) {
  const navigate = useNavigate()
  const sorted = React.useMemo(
    () => [...anomalies].sort((a, b) => severityOrder.indexOf(b.severity) - severityOrder.indexOf(a.severity)),
    [anomalies]
  )

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 'var(--cmom-space-2)' }}>
        <h3 style={{ margin: 0 }}>Current Anomalies ({sorted.length})</h3>
        {sorted.length > 0 && (
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
      {sorted.length === 0 ? (
        <div style={{ opacity: 0.7, fontSize: 12 }}>No active anomalies right now.</div>
      ) : (
        <div className="cmom-device-grid">
          {sorted.map(a => (
            <AnomalyCard key={a.id} anomaly={a} />
          ))}
        </div>
      )}
    </div>
  )
}
