import * as React from 'react'
import * as q from '../../../backend/src/Model'
import TrendPanel from './TrendPanel'
import ValuePanel from './ValuePanel'
import DigitalInputRow from './DigitalInputRow'
import { useTopicMessage } from './useTopicChildren'

interface Props {
  deviceKey: string
  deviceNode: q.TreeNode<any>
  onBack: () => void
}

function readJson(node: q.TreeNode<any> | undefined): any {
  const payload = node?.message?.payload?.toUnicodeString()
  if (!payload) return {}
  try {
    return JSON.parse(payload)
  } catch {
    return {}
  }
}

function StatusField({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="cmom-card" style={{ padding: '8px 10px', minWidth: 0 }}>
      <div
        style={{
          fontSize: 10,
          fontWeight: 600,
          opacity: 0.6,
          textTransform: 'uppercase',
          letterSpacing: '0.04em',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
      >
        {label}
      </div>
      <div className="cmom-value" style={{ marginTop: 3 }}>
        {value ?? '—'}
      </div>
    </div>
  )
}

function ordinalSuffix(day: number): string {
  if (day >= 11 && day <= 13) return 'th'
  switch (day % 10) {
    case 1:
      return 'st'
    case 2:
      return 'nd'
    case 3:
      return 'rd'
    default:
      return 'th'
  }
}

// "August 6th, 2026 at 1:27PM" — friendlier than a raw epoch/ISO value for
// any UnitStatus field that reads as a timestamp.
function formatFriendlyDateTime(date: Date): string {
  const month = date.toLocaleString('en-US', { month: 'long' })
  const day = date.getDate()
  const year = date.getFullYear()
  let hours = date.getHours()
  const ampm = hours >= 12 ? 'PM' : 'AM'
  hours = hours % 12 || 12
  const minutes = date.getMinutes().toString().padStart(2, '0')
  return `${month} ${day}${ordinalSuffix(day)}, ${year} at ${hours}:${minutes}${ampm}`
}

// UnitStatus's field list isn't documented anywhere in this repo (it's
// rendered generically — see below), so timestamp fields are detected by
// name/shape rather than assumed to be a specific key.
function tryParseTimestamp(key: string, value: unknown): Date | undefined {
  const keyLower = key.toLowerCase()
  if (!keyLower.includes('timestamp') && !keyLower.includes('time') && !keyLower.includes('date')) {
    return undefined
  }

  if (typeof value === 'number') {
    const ms = value > 1e12 ? value : value * 1000 // seconds vs. ms epoch
    const date = new Date(ms)
    return Number.isNaN(date.getTime()) ? undefined : date
  }

  if (typeof value === 'string') {
    const date = new Date(value)
    return Number.isNaN(date.getTime()) ? undefined : date
  }

  return undefined
}

export default function PumpStationDetail({ deviceKey, deviceNode, onBack }: Props) {
  const [, setTick] = React.useState(0)

  React.useEffect(() => {
    const rerender = () => setTick(t => t + 1)
    deviceNode.onEdgesChange.subscribe(rerender)
    return () => deviceNode.onEdgesChange.unsubscribe(rerender)
  }, [deviceNode])

  const unitStatusNode = deviceNode.edges['UnitStatus']?.target
  useTopicMessage(unitStatusNode)
  const unitStatus = readJson(unitStatusNode)
  // Render every attribute the UnitStatus payload actually carries, rather
  // than a hardcoded subset — the payload's field list isn't documented
  // anywhere in this repo, so this adapts to whatever ps_mqtt.py publishes.
  const unitStatusEntries = Object.entries(unitStatus).filter(([key]) => key !== undefined)

  const acPowerNode = deviceNode.edges['ACPower']?.target
  const batteryNode = deviceNode.edges['BatteryState']?.target

  const digitalGroup = deviceNode.edges['DigitalInputs']?.target
  const digitalInputs = (digitalGroup?.edgeArray ?? [])
    .map(edge => ({ key: edge.name, node: edge.target, json: readJson(edge.target) }))
    .filter(d => {
      const desc = (d.json.Description || '').trim().toLowerCase()
      return desc !== '' && desc !== 'spare'
    })
    .sort((a, b) => a.key.localeCompare(b.key, undefined, { numeric: true }))

  const analogGroup = deviceNode.edges['AnalogInputs']?.target
  const analogInputs = (analogGroup?.edgeArray ?? [])
    .map(edge => ({ key: edge.name, node: edge.target, json: readJson(edge.target) }))
    .filter(a => {
      const desc = (a.json.Description || '').trim().toLowerCase()
      return desc !== '' && !desc.includes('channel')
    })
    .sort((a, b) => a.key.localeCompare(b.key, undefined, { numeric: true }))

  const temperatureNode = deviceNode.edges['Temperature']?.target

  return (
    <div style={{ padding: 'var(--cmom-space-4, 16px)', height: '100%', overflow: 'auto' }}>
      <button
        type="button"
        onClick={onBack}
        style={{
          marginBottom: 'var(--cmom-space-3, 12px)',
          padding: '4px 12px',
          borderRadius: 'var(--cmom-radius-sm, 4px)',
          border: '1px solid var(--cmom-border-strong, rgba(128,128,128,0.4))',
          background: 'transparent',
          color: 'inherit',
          cursor: 'pointer',
        }}
      >
        &larr; Back
      </button>
      <h2 style={{ marginTop: 0 }}>
        Serial: <span style={{ fontFamily: 'var(--cmom-font-mono, monospace)' }}>{deviceKey}</span>
      </h2>

      <h3>Unit Status</h3>
      {unitStatusEntries.length === 0 ? (
        <div style={{ opacity: 0.7, marginBottom: 20 }}>No UnitStatus payload seen yet.</div>
      ) : (
        <div className="cmom-card-grid" style={{ '--cmom-grid-min': '120px', marginBottom: 20 } as React.CSSProperties}>
          {unitStatusEntries.map(([key, value]) => {
            const asDate = tryParseTimestamp(key, value)
            const display = asDate
              ? formatFriendlyDateTime(asDate)
              : typeof value === 'object' && value !== null
                ? JSON.stringify(value)
                : String(value)
            return <StatusField key={key} label={key} value={display} />
          })}
        </div>
      )}

      <h3>Power &amp; Temperature</h3>
      <div className="cmom-card-grid" style={{ '--cmom-grid-min': '150px', marginBottom: 20 } as React.CSSProperties}>
        {acPowerNode && <ValuePanel title="AC Power" node={acPowerNode} valuePath="Volts" unit="V" />}
        {batteryNode && <ValuePanel title="Battery State" node={batteryNode} valuePath="Volts" unit="V" />}
        {temperatureNode && <ValuePanel title="Temperature" node={temperatureNode} valuePath="Temperature" />}
      </div>

      <h3>Digital Inputs</h3>
      {digitalInputs.length === 0 ? (
        <div style={{ opacity: 0.7, marginBottom: 20 }}>No active (non-spare) digital inputs configured.</div>
      ) : (
        <div style={{ marginBottom: 20, border: '1px solid var(--cmom-border, rgba(128,128,128,0.15))', borderRadius: 'var(--cmom-radius-sm, 4px)' }}>
          {digitalInputs.map(d => (
            <DigitalInputRow key={d.key} label={`DigitalInputs/${d.key} (${d.json.Description})`} node={d.node} />
          ))}
        </div>
      )}

      <h3>Analog Inputs</h3>
      {analogInputs.length === 0 ? (
        <div style={{ opacity: 0.7, marginBottom: 20 }}>No named, non-channel analog inputs configured.</div>
      ) : (
        <div className="cmom-trend-grid" style={{ marginBottom: 12 }}>
          {analogInputs.map(a => (
            <TrendPanel
              key={a.key}
              title={`AnalogInputs/${a.key} (${a.json.Description})`}
              node={a.node}
              dotPath="ScaledValue"
              unit={a.json.ScaledUnits}
            />
          ))}
        </div>
      )}
    </div>
  )
}
