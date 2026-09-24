import * as React from 'react'
import * as q from '../../../../backend/src/Model'
import { Severity, severityColors, severityOrder, severityFromPayload } from '../config'
import { freshnessFromLastUpdate, freshnessColors, freshnessText } from './dataFreshness'
import { PumpStationSummary } from '../usePumpStationSummary'

interface Props {
  summary: PumpStationSummary
  currentLevelFt: number | null | undefined
  wetWellDepthFt: number | null | undefined
  levelSeverity: Severity
  // Read straight off ACPower/BatteryState/Temperature's own leaf topics
  // (see PumpStationDetail) — these used to be their own "Power &
  // Temperature" PanelGrid card; that card is gone now that they live here.
  acPowerVolts: unknown
  batteryVolts: unknown
  temperature: unknown
}

function worstOf(list: Severity[]): Severity {
  return list.reduce<Severity>((worst, s) => (severityOrder.indexOf(s) > severityOrder.indexOf(worst) ? s : worst), 'OK')
}

function pumpRuntimeFor(summary: PumpStationSummary, n: 1 | 2) {
  return summary.pumpRuntimes.find(r => r.key.includes(String(n)) || r.label.includes(String(n)))
}

function runStatusDiFor(summary: PumpStationSummary, n: 1 | 2) {
  const re = new RegExp(`pump\\s*${n}\\b`, 'i')
  return summary.digitalInputs.find(d => re.test(d.label) && /run/i.test(d.label))
}

/**
 * Fixed, non-draggable KPI strip for Pump Station Detail — Wet Well / Pump 1
 * / Pump 2 / Alarms — same treatment as FlowKpiRow (title-area chips, not
 * PanelGrid panels). Pump stations have no diurnal SQL table, so each chip's
 * second badge is Data Freshness (this station's own last-message age)
 * instead of a diurnal severity.
 */
export default function PumpKpiRow({
  summary,
  currentLevelFt,
  wetWellDepthFt,
  levelSeverity,
  acPowerVolts,
  batteryVolts,
  temperature,
}: Props) {
  const freshness = freshnessFromLastUpdate(summary.lastUpdate)
  const freshnessLabel = freshnessText(summary.lastUpdate)

  const percentFull =
    currentLevelFt !== null && currentLevelFt !== undefined && wetWellDepthFt ? Math.round((currentLevelFt / wetWellDepthFt) * 100) : undefined

  const pump1Runtime = pumpRuntimeFor(summary, 1)
  const pump2Runtime = pumpRuntimeFor(summary, 2)
  const pump1RunDi = runStatusDiFor(summary, 1)
  const pump2RunDi = runStatusDiFor(summary, 2)
  const pump1Running = pump1RunDi?.alarm
  const pump2Running = pump2RunDi?.alarm
  const pump1Severity = severityFromNode(pump1Runtime?.node)
  const pump2Severity = severityFromNode(pump2Runtime?.node)

  // "Alarms" excludes the two run-status inputs above — those describe pump
  // state, not an alarm condition — so this only counts inputs whose own
  // severity (ps_mqtt.py's classify_di_severity()) is non-OK: High Wet Well,
  // Utility Power Failure, Over Temperature, etc.
  const alarmInputs = summary.digitalInputs.filter(d => d !== pump1RunDi && d !== pump2RunDi && d.severity !== 'OK')
  const alarmSeverity = worstOf(alarmInputs.map(a => a.severity))

  return (
    <div className="cmom-kpi-row">
      {[
        { label: 'AC Power', value: acPowerVolts, unit: 'V' },
        { label: 'Battery', value: batteryVolts, unit: 'V' },
        { label: 'Temperature', value: temperature, unit: '°' },
      ].map(reading => (
        <div key={reading.label} className="cmom-kpi-chip" style={{ ['--chip-accent' as any]: 'var(--cmom-text-muted)' }}>
          <div className="cmom-kpi-chip__label">{reading.label}</div>
          <div className="cmom-kpi-chip__value">
            {reading.value !== undefined && reading.value !== null ? `${reading.value} ${reading.unit}` : '—'}
          </div>
          <div className="cmom-kpi-chip__badges">
            <span className="cmom-badge" style={{ color: freshnessColors[freshness] }} title={freshnessLabel}>
              {freshness}
            </span>
          </div>
        </div>
      ))}

      <div className="cmom-kpi-chip" style={{ ['--chip-accent' as any]: severityColors[levelSeverity] }}>
        <div className="cmom-kpi-chip__label">Wet Well</div>
        <div className="cmom-kpi-chip__value">
          {currentLevelFt !== null && currentLevelFt !== undefined ? `${currentLevelFt.toFixed(2)} ft` : '—'}
          {percentFull !== undefined && <span style={{ fontWeight: 400, opacity: 0.7 }}> ({percentFull}%)</span>}
        </div>
        <div className="cmom-kpi-chip__badges">
          <span className="cmom-badge" style={{ color: severityColors[levelSeverity] }} title="Monthly SD-baseline detector">
            Monthly: {levelSeverity}
          </span>
          <span className="cmom-badge" style={{ color: freshnessColors[freshness] }} title={freshnessLabel}>
            {freshness}
          </span>
        </div>
      </div>

      {[
        { n: 1 as const, runtime: pump1Runtime, running: pump1Running, severity: pump1Severity },
        { n: 2 as const, runtime: pump2Runtime, running: pump2Running, severity: pump2Severity },
      ].map(pump => (
        <div
          key={pump.n}
          className="cmom-kpi-chip"
          style={{ ['--chip-accent' as any]: severityColors[pump.severity] }}
          title={pump.runtime ? `Runtime today ${pump.runtime.today} · Starts ${pump.runtime.hourlyStart ?? '—'}` : undefined}
        >
          <div className="cmom-kpi-chip__label">Pump {pump.n}</div>
          <div className="cmom-kpi-chip__value" style={{ color: pump.running ? '#4caf50' : undefined }}>
            {pump.running === undefined ? '—' : pump.running ? 'Running' : 'Not Running'}
          </div>
          <div className="cmom-kpi-chip__badges">
            <span className="cmom-badge" style={{ color: severityColors[pump.severity] }} title="Monthly SD-baseline detector">
              Monthly: {pump.severity}
            </span>
            <span className="cmom-badge" style={{ color: freshnessColors[freshness] }} title={freshnessLabel}>
              {freshness}
            </span>
          </div>
        </div>
      ))}

      <div
        className="cmom-kpi-chip"
        style={{ ['--chip-accent' as any]: severityColors[alarmSeverity] }}
        title={alarmInputs.map(a => `${a.severity} — ${a.label}`).join('\n') || 'All normal'}
      >
        <div className="cmom-kpi-chip__label">Alarms</div>
        <div className="cmom-kpi-chip__value" style={{ color: severityColors[alarmSeverity] }}>
          {alarmInputs.length === 0 ? 'All normal' : `${alarmInputs.length} active`}
        </div>
        <div className="cmom-kpi-chip__badges">
          <span className="cmom-badge" style={{ color: freshnessColors[freshness] }} title={freshnessLabel}>
            {freshness}
          </span>
        </div>
      </div>
    </div>
  )
}

function severityFromNode(node: q.TreeNode<any> | undefined): Severity {
  return severityFromPayload(node?.edges['anomaly']?.target?.message?.payload?.toUnicodeString())
}
