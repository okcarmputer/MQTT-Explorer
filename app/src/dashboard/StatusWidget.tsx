import * as React from 'react'

interface Props {
  label: string
  value: React.ReactNode
  subtitle: string
  color?: string
  // Visually calls this widget out (glow) when something in it needs
  // attention right now — e.g. the Alarms widget when CRITICAL count > 0.
  emphasis?: boolean
}

/**
 * The generic "big number + label" card every Overview stat tile is built
 * from (Flow Monitors count, Pump Stations count, Not Reporting, and the
 * severity breakdown inside AlarmsWidget) — one shared component so the
 * type hierarchy (label -> big value -> subtitle) and hover behavior stay
 * consistent instead of being re-styled per widget.
 */
export default function StatusWidget({ label, value, subtitle, color, emphasis }: Props) {
  return (
    <div className={`cmom-card cmom-stat-tile${emphasis ? ' cmom-stat-tile--emphasis' : ''}`}>
      <div className="cmom-label">{label}</div>
      <div className="cmom-stat-tile-value" style={color ? { color } : undefined}>
        {value}
      </div>
      <div className="cmom-stat-tile-subtitle">{subtitle}</div>
    </div>
  )
}
