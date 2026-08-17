import * as React from 'react'
import { severityColors } from '../config'

/**
 * Small, self-contained visual widgets for the different "kinds" of value a
 * device card shows, replacing plain label/value text rows for the cases
 * where a shape communicates the reading faster than a number does:
 *  - NumericReading: flow/velocity/generic analog — the number is the point,
 *    just made bigger and colored.
 *  - AlarmIndicator: a digital input — a lit/unlit dot, red when active,
 *    green when clear, plus its alarm text.
 *  - RuntimeClock: a pump runtime — a clock glyph next to the run time, with
 *    a starts badge alongside it.
 * All read their color from config.ts's severityColors / cmom CSS vars, so
 * they stay visually consistent with the rest of the dashboard.
 */

const ALARM_COLOR = severityColors.CRITICAL
const CLEAR_COLOR = '#2ea043' // var(--cmom-status-online) — literal fallback since widgets can render outside .cmom-dashboard's cascade in isolated contexts (e.g. Storybook-style previews)

export function NumericReading({ value, unit }: { value: string; unit?: string }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'baseline', gap: 4 }}>
      <span style={{ fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{value}</span>
      {unit && <span style={{ fontSize: 10, opacity: 0.7 }}>{unit}</span>}
    </span>
  )
}

export function AlarmIndicator({ active, text }: { active: boolean; text?: string }) {
  const color = active ? ALARM_COLOR : CLEAR_COLOR
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
      <span
        style={{
          width: 9,
          height: 9,
          borderRadius: '50%',
          backgroundColor: color,
          boxShadow: active ? `0 0 6px ${color}` : 'none',
          flex: '0 0 auto',
          animation: active ? 'cmom-pulse 1.2s ease-in-out infinite' : undefined,
        }}
      />
      <span style={{ color, fontWeight: 700, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.03em' }}>
        {active ? text || 'ALARM' : 'OK'}
      </span>
    </span>
  )
}

function ClockGlyph({ color }: { color: string }) {
  return (
    <svg width={14} height={14} viewBox="0 0 14 14" style={{ flex: '0 0 auto' }}>
      <circle cx={7} cy={7} r={6} fill="none" stroke={color} strokeWidth={1.4} />
      <line x1={7} y1={7} x2={7} y2={3.2} stroke={color} strokeWidth={1.4} strokeLinecap="round" />
      <line x1={7} y1={7} x2={9.6} y2={8.4} stroke={color} strokeWidth={1.4} strokeLinecap="round" />
    </svg>
  )
}

export function RuntimeClock({ label, minutes, starts }: { label: string; minutes: string; starts?: string }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
      <ClockGlyph color="var(--cmom-text-muted, #8b949e)" />
      <span title={label}>{minutes}</span>
      {starts !== undefined && (
        <span
          style={{
            fontSize: 10,
            fontWeight: 700,
            padding: '1px 5px',
            borderRadius: 3,
            border: '1px solid var(--cmom-border-strong, #3a424c)',
            color: 'var(--cmom-text-muted, #8b949e)',
          }}
        >
          {starts} starts
        </span>
      )}
    </span>
  )
}
