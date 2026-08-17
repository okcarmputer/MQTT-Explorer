import * as React from 'react'
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
        {ALARM_SEVERITIES.map(severity => (
          <div key={severity} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
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
          </div>
        ))}
      </div>
    </div>
  )
}
