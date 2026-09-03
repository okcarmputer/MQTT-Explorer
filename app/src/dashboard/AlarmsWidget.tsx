import * as React from 'react'
import { Link } from 'react-router-dom'
import { Severity, severityColors } from './config'
import SeverityBadge from './SeverityBadge'

interface Props {
  // Per-severity counts across every anomaly type (flow channel + pump
  // station input) fleet-wide — same counts Overview already derives via
  // useFleetAnomalySeverities, just rendered as one widget instead of three
  // separate stat tiles.
  counts: Record<Severity, number>
}

const ALARM_SEVERITIES: Severity[] = ['CRITICAL', 'MODERATE', 'LOW']

/**
 * One widget, not three — LOW/MODERATE/CRITICAL counts stacked with
 * SeverityBadge so the color convention matches every other panel exactly.
 * CRITICAL gets a glow via StatusWidget's --emphasis styling (reused here
 * directly, not through StatusWidget itself, since this widget needs three
 * rows in one card rather than three separate cards) whenever its count > 0
 * — the thing a shift operator should see first.
 */
export default function AlarmsWidget({ counts }: Props) {
  const hasCritical = counts.CRITICAL > 0

  return (
    <div className={`cmom-card cmom-stat-tile${hasCritical ? ' cmom-stat-tile--emphasis' : ''}`}>
      <div className="cmom-label">Alarms</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 4 }}>
        {/* Each row is its own link to the Anomalies tab, pre-filtered to
            that severity (Anomalies.tsx reads the ?severity= query param on
            mount) — a shift operator clicking "3 CRITICAL" lands straight on
            just those 3, not the full unfiltered feed. */}
        {ALARM_SEVERITIES.map(severity => (
          <Link
            key={severity}
            to={`/anomalies?severity=${severity}`}
            className="cmom-alarm-row-link"
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 8,
              textDecoration: 'none',
              color: 'inherit',
              borderRadius: 'var(--cmom-radius-sm, 4px)',
              padding: '2px 4px',
              margin: '-2px -4px',
            }}
          >
            <SeverityBadge severity={severity} />
            <span
              style={{
                fontFamily: 'var(--cmom-font-mono)',
                fontWeight: 800,
                fontSize: severity === 'CRITICAL' ? 22 : 16,
                color: counts[severity] > 0 ? severityColors[severity] : 'var(--cmom-text-muted)',
              }}
            >
              {counts[severity]}
            </span>
          </Link>
        ))}
      </div>
    </div>
  )
}
