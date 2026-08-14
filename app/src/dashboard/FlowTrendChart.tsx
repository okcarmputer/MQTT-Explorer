import * as React from 'react'
import { ComposedChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Dot } from 'recharts'
import { FlowMonitorHistoryPoint } from '../../../events/EventsV2'
import { Severity, severityColors, severityOrder } from './config'

// Alarm ladder is high-side-only: 1/2/3 SD above the CHA baseline mean maps
// to LOW/MODERATE/CRITICAL (see skill docs) — alarmLevel 0..3 lines up
// directly with severityOrder's OK..CRITICAL index.
function alarmLevelToSeverity(level: 0 | 1 | 2 | 3 | null | undefined): Severity {
  return severityOrder[level ?? 0] ?? 'OK'
}

interface ChannelKeys {
  value: 'flow' | 'level' | 'velocity'
  mean: 'flowMean' | 'levelMean' | 'velocityMean'
  stdDev: 'flowStdDev' | 'levelStdDev' | 'velocityStdDev'
  alarm: 'flowAlarm' | 'levelAlarm' | 'velocityAlarm'
}

interface Props {
  title: string
  unit?: string
  points: FlowMonitorHistoryPoint[]
  channel: ChannelKeys
}

interface ChartRow {
  time: number
  value: number | null
  mean: number | null
  low: number | null
  moderate: number | null
  critical: number | null
  severity: Severity
}

function buildRows(points: FlowMonitorHistoryPoint[], channel: ChannelKeys): ChartRow[] {
  return points.map(p => {
    const mean = p[channel.mean]
    const sd = p[channel.stdDev]
    return {
      time: new Date(p.comparedAt).getTime(),
      value: p[channel.value],
      mean,
      low: mean !== null && sd !== null ? mean + sd : null,
      moderate: mean !== null && sd !== null ? mean + 2 * sd : null,
      critical: mean !== null && sd !== null ? mean + 3 * sd : null,
      severity: alarmLevelToSeverity(p[channel.alarm]),
    }
  })
}

function ValueDot(props: any) {
  const { cx, cy, payload } = props
  if (cx === undefined || cy === undefined) return null
  return <Dot cx={cx} cy={cy} r={3} fill={severityColors[(payload as ChartRow).severity]} stroke="none" />
}

/**
 * Per-site trend chart: observed value vs. the CHA baseline mean and the
 * high-side-only LOW/MODERATE/CRITICAL bounds (mean + 1/2/3 SD), with each
 * observed point colored by that cycle's actual alarm level so the chart
 * matches the same ladder used everywhere else in the dashboard.
 */
export default function FlowTrendChart({ title, unit, points, channel }: Props) {
  const rows = React.useMemo(() => buildRows(points, channel), [points, channel])

  if (rows.length === 0) {
    return (
      <div style={{ opacity: 0.7, fontSize: 12 }}>No SQL history for {title.toLowerCase()} in this window yet.</div>
    )
  }

  return (
    <div style={{ width: '100%', height: 220, minWidth: 0 }}>
      <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {title}
        {unit ? ` (${unit})` : ''}
      </div>
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={rows} margin={{ top: 4, right: 8, left: 0, bottom: 4 }}>
          <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
          <XAxis
            dataKey="time"
            type="number"
            domain={['dataMin', 'dataMax']}
            tickFormatter={t => new Date(t).toLocaleTimeString([], { month: 'numeric', day: 'numeric', hour: '2-digit' })}
            tick={{ fontSize: 11 }}
          />
          <YAxis tick={{ fontSize: 11 }} width={48} />
          <Tooltip
            labelFormatter={t => new Date(t as number).toLocaleString()}
            formatter={(v: number) => (v === null || v === undefined ? '—' : v.toFixed(2))}
          />
          <Legend wrapperStyle={{ fontSize: 11 }} />
          <Line
            type="monotone"
            dataKey="mean"
            name="CHA baseline mean"
            stroke="rgba(128,128,128,0.6)"
            strokeDasharray="4 3"
            dot={false}
            isAnimationActive={false}
          />
          <Line
            type="monotone"
            dataKey="low"
            name="LOW threshold (+1 SD)"
            stroke={severityColors.LOW}
            strokeDasharray="4 3"
            dot={false}
            isAnimationActive={false}
          />
          <Line
            type="monotone"
            dataKey="moderate"
            name="MODERATE threshold (+2 SD)"
            stroke={severityColors.MODERATE}
            strokeDasharray="4 3"
            dot={false}
            isAnimationActive={false}
          />
          <Line
            type="monotone"
            dataKey="critical"
            name="CRITICAL threshold (+3 SD)"
            stroke={severityColors.CRITICAL}
            strokeDasharray="4 3"
            dot={false}
            isAnimationActive={false}
          />
          <Line
            type="monotone"
            dataKey="value"
            name="Observed"
            stroke="#1976d2"
            strokeWidth={2}
            dot={<ValueDot />}
            isAnimationActive={false}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  )
}
