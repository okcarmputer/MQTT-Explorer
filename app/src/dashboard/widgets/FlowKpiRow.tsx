import * as React from 'react'
import { Severity, severityColors, severityOrder, gpmToMgd, GPM_TO_MGD } from '../config'
import { freshnessFromLastUpdate, freshnessColors, FLOW_MONITOR_FRESHNESS_THRESHOLDS } from './dataFreshness'

export interface FlowKpiMetric {
  key: string
  label: string
  unit: string
  value: number | undefined
  monthlySeverity: Severity
  // Undefined (not 'OK') when the diurnal detector hasn't published for this
  // site/measurement type yet — omitted from the chip rather than shown as a
  // false "OK".
  diurnalSeverity: Severity | undefined
  // The device's own reading time (parsed out of the payload) vs. when this
  // app actually received the message — see FlowMonitorDetail's comment on
  // why both are carried separately rather than collapsed into one.
  measuredAt: Date | undefined
  lastReceivedAt: Date | undefined
}

export interface SiteHealthIssue {
  metric: string
  detector: 'Monthly' | 'Diurnal'
  severity: Severity
}

function worstOf(a: Severity, b: Severity | undefined): Severity {
  if (b === undefined) return a
  return severityOrder.indexOf(b) > severityOrder.indexOf(a) ? b : a
}

function worstSeverity(issues: SiteHealthIssue[]): Severity {
  return issues.reduce<Severity>((worst, issue) => worstOf(worst, issue.severity), 'OK')
}

interface Props {
  metrics: FlowKpiMetric[]
  issues: SiteHealthIssue[]
}

/**
 * Fixed, non-draggable KPI strip for the Flow Monitor Detail page — lives in
 * the title area (see DeviceHeader's `kpiRow` slot), not the PanelGrid below
 * it, since this is meant to always be visible and in the same place, not
 * something a person can drag away or resize down. Visually distinct from
 * the draggable .cmom-card panels (flat chip + colored top accent, no
 * drag-handle chrome) so it doesn't read as just another movable widget.
 */
export default function FlowKpiRow({ metrics, issues }: Props) {
  const worstHealth = worstSeverity(issues)

  return (
    <div className="cmom-kpi-row">
      {metrics.map(m => {
        const accent = severityColors[worstOf(m.monthlySeverity, m.diurnalSeverity)]
        const freshness = freshnessFromLastUpdate(m.lastReceivedAt?.getTime(), FLOW_MONITOR_FRESHNESS_THRESHOLDS)
        const measuredTitle = m.measuredAt ? `Last measured at ${m.measuredAt.toLocaleString()}` : 'No measurement time available'
        // Flow's raw reading is GPM, but the diurnal baselines it's judged
        // against (Flow_Monitor_Diurnal_Anomalies' AvgDiurnal/NormDiurnal,
        // see config.ts's gpmToMgd comment) are MGD — show the MGD value
        // right on the chip, with the exact conversion on hover, instead of
        // making someone go find it on the Diurnal comparison card.
        const isFlow = m.key === 'flow'
        const mgdValue = isFlow && m.value !== undefined && !Number.isNaN(m.value) ? gpmToMgd(m.value) : undefined
        const mgdTitle =
          mgdValue !== undefined ? `${m.value} gpm × ${GPM_TO_MGD.toFixed(6)} (1440 ÷ 1,000,000) = ${mgdValue.toFixed(6)} MGD` : undefined
        return (
          <div key={m.key} className="cmom-kpi-chip" style={{ ['--chip-accent' as any]: accent }}>
            <div className="cmom-kpi-chip__label">{m.label}</div>
            <div className="cmom-kpi-chip__value">
              {m.value !== undefined && !Number.isNaN(m.value) ? `${m.value} ${m.unit}` : '—'}
            </div>
            {mgdValue !== undefined && (
              <div className="cmom-kpi-chip__value" style={{ fontSize: 11, opacity: 0.75 }} title={mgdTitle}>
                {mgdValue.toFixed(3)} MGD
              </div>
            )}
            <div className="cmom-kpi-chip__badges">
              <span className="cmom-badge" style={{ color: severityColors[m.monthlySeverity] }} title="Monthly SD-baseline detector">
                Monthly: {m.monthlySeverity}
              </span>
              {m.diurnalSeverity !== undefined && (
                <span className="cmom-badge" style={{ color: severityColors[m.diurnalSeverity] }} title="Hour-of-day diurnal detector">
                  Diurnal: {m.diurnalSeverity}
                </span>
              )}
              {/* Hover for the exact last-measured time — the dot itself
                  just says whether the reading is current (LIVE/STALE/
                  OFFLINE), same three-state freshness used elsewhere. */}
              <span className="cmom-badge" style={{ color: freshnessColors[freshness] }} title={measuredTitle}>
                {freshness}
              </span>
            </div>
          </div>
        )
      })}
      <div
        className="cmom-kpi-chip"
        style={{ ['--chip-accent' as any]: severityColors[worstHealth] }}
        title={issues.map(issue => `${issue.severity} — ${issue.metric} (${issue.detector})`).join('\n') || 'No active issues'}
      >
        <div className="cmom-kpi-chip__label">Site Health</div>
        <div className="cmom-kpi-chip__value" style={{ color: severityColors[worstHealth] }}>
          {issues.length === 0 ? 'Normal' : `${issues.length} ${issues.length === 1 ? 'issue' : 'issues'}`}
        </div>
      </div>
    </div>
  )
}
