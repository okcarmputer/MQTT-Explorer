import { useEffect, useState } from 'react'
import * as q from '../../../backend/src/Model'
import { Severity, digitalInputSeverity } from './config'
import { readGroupFields } from './pumpStationLeaf'

export interface DigitalInputSummary {
  key: string
  label: string
  description: string
  alarmDescription: string
  severity: Severity
}

export interface AnalogInputSummary {
  key: string
  label: string
  value: string
  unit: string
  // The AnalogInput{n} group node itself — callers that need to subscribe
  // to/read the live ScaledValue leaf directly (e.g. WetWellGauge's level
  // reading in PumpStationDetail) rather than just this summary's snapshot.
  node: q.TreeNode<any>
}

export interface PumpRuntimeSummary {
  key: string
  label: string
  today: string
  yesterday: string
  // The only per-hour counter-shaped field logger.py's NODE_TREE publishes
  // for a PumpRuntime leaf — shown as a "starts" count in the UI. There's
  // no explicit start-count field in the schema, so this is a best-effort
  // stand-in; undefined (not shown) if the payload doesn't carry it.
  hourlyStart?: string
}

export interface PumpStationSummary {
  unitStatus: Record<string, unknown>
  digitalInputs: DigitalInputSummary[]
  analogInputs: AnalogInputSummary[]
  pumpRuntimes: PumpRuntimeSummary[]
  lastUpdate?: number
}

// "Configured" the same way PumpStationDetail already treats a
// digital/analog input as worth showing — a real, non-"spare" Description.
// PulseFlows/PumpRuntimes leaves have no Description field at all (see
// logger.py's NODE_TREE), so those are instead considered "nonempty" when
// they've actually published a non-zero Today/Yesterday/HourlyTotal value.
function hasDescription(json: any): boolean {
  const desc = (json.Description || '').trim().toLowerCase()
  return desc !== '' && desc !== 'spare'
}

function isNonZero(value: unknown): boolean {
  return value !== undefined && value !== null && value !== '' && value !== 0 && value !== '0'
}

function buildSummary(deviceNode: q.TreeNode<any>): PumpStationSummary {
  const unitStatusNode = deviceNode.edges['UnitStatus']?.target
  const unitStatus = readGroupFields(unitStatusNode)

  const digitalGroup = deviceNode.edges['DigitalInputs']?.target
  const digitalInputs: DigitalInputSummary[] = (digitalGroup?.edgeArray ?? [])
    .map(edge => ({ key: edge.name, json: readGroupFields(edge.target) }))
    .filter(d => hasDescription(d.json))
    .map(d => ({
      key: d.key,
      label: d.json.Description,
      description: d.json.Description,
      alarmDescription: d.json.AlarmDescription || '',
      severity: digitalInputSeverity(Boolean(d.json.Alarm), d.json.AlarmDescription),
    }))
    .sort((a, b) => a.key.localeCompare(b.key, undefined, { numeric: true }))

  const analogGroup = deviceNode.edges['AnalogInputs']?.target
  const analogInputs: AnalogInputSummary[] = (analogGroup?.edgeArray ?? [])
    .map(edge => ({ key: edge.name, node: edge.target, json: readGroupFields(edge.target) }))
    .filter(a => hasDescription(a.json) && !a.json.Description.toLowerCase().includes('channel'))
    .map(a => ({
      key: a.key,
      label: a.json.Description,
      value: String(a.json.ScaledValue ?? '—'),
      unit: a.json.ScaledUnits || '',
      node: a.node,
    }))
    .sort((a, b) => a.key.localeCompare(b.key, undefined, { numeric: true }))

  const runtimeGroup = deviceNode.edges['PumpRuntimes']?.target
  const pumpRuntimes: PumpRuntimeSummary[] = (runtimeGroup?.edgeArray ?? [])
    .map(edge => ({ key: edge.name, json: readGroupFields(edge.target) }))
    .filter(r => isNonZero(r.json.Today) || isNonZero(r.json.Yesterday) || isNonZero(r.json.HourlyTotal))
    .map(r => ({
      key: r.key,
      label: r.key,
      today: String(r.json.Today ?? '—'),
      yesterday: String(r.json.Yesterday ?? '—'),
      hourlyStart: isNonZero(r.json.HourlyStart) ? String(r.json.HourlyStart) : undefined,
    }))
    .sort((a, b) => a.key.localeCompare(b.key, undefined, { numeric: true }))

  return { unitStatus, digitalInputs, analogInputs, pumpRuntimes, lastUpdate: deviceNode.lastUpdate }
}

/**
 * Per-station summary used by PumpStationDetail: UnitStatus plus the
 * non-empty (real Description, non-"spare") digital/analog inputs and the
 * non-zero pump runtimes — "only what's actually relevant" rather than
 * every published leaf. Re-scans whenever any of this station's children
 * change value or structure.
 */
export function usePumpStationSummary(deviceNode: q.TreeNode<any> | undefined): PumpStationSummary {
  const [, setTick] = useState(0)

  useEffect(() => {
    if (!deviceNode) return
    const rerender = () => setTick(t => t + 1)
    deviceNode.onEdgesChange.subscribe(rerender)
    const interval = setInterval(rerender, 2000)
    return () => {
      deviceNode.onEdgesChange.unsubscribe(rerender)
      clearInterval(interval)
    }
  }, [deviceNode])

  if (!deviceNode) {
    return { unitStatus: {}, digitalInputs: [], analogInputs: [], pumpRuntimes: [] }
  }

  return buildSummary(deviceNode)
}

