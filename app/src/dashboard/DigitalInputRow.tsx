import * as React from 'react'
import * as q from '../../../backend/src/Model'
import SeverityBadge from './SeverityBadge'
import { digitalInputSeverity, severityColors } from './config'
import { readGroupFields } from './pumpStationLeaf'

interface Props {
  // The raw DigitalInput{n} key (e.g. "DigitalInput3") — rendered as the
  // short "DI3" tag rather than the full "DigitalInputs/DigitalInput3" path.
  diKey: string
  name: string
  node: q.TreeNode<any>
}

// "DigitalInput3" -> "DI3" — same numeric-suffix extraction as
// PumpStationDetail's formatAnalogInputTitle, just for the DI tag instead of
// a title. Falls back to the raw key if it doesn't match the expected shape.
function formatDiTag(key: string): string {
  const match = key.match(/^DigitalInput(\d+)$/i)
  return match ? `DI${match[1]}` : key
}

/**
 * Digital inputs are alarms, not trends — current alarm description +
 * severity, no chart. Severity rule lives in config.ts (digitalInputSeverity)
 * so this row and the fleet-wide rollup (anomalyTypeScan.ts) stay in sync.
 * `node` here is the DigitalInput{n} group; its Alarm/AlarmDescription
 * fields are each their own leaf topic (see pumpStationLeaf.ts), not one
 * JSON blob on this node itself, so this re-renders on any of that group's
 * child leaves receiving a message rather than on `node` directly.
 */
export default function DigitalInputRow({ diKey, name, node }: Props) {
  const [, setTick] = React.useState(0)
  React.useEffect(() => {
    const rerender = () => setTick(t => t + 1)
    const leaves = node.edgeArray.map(edge => edge.target)
    leaves.forEach(leaf => leaf.onMessage.subscribe(rerender))
    node.onEdgesChange.subscribe(rerender)
    return () => {
      leaves.forEach(leaf => leaf.onMessage.unsubscribe(rerender))
      node.onEdgesChange.unsubscribe(rerender)
    }
  }, [node])
  const json = readGroupFields(node)
  const severity = digitalInputSeverity(Boolean(json.Alarm), json.AlarmDescription)
  const color = severityColors[severity]
  const value = json.AlarmDescription || (json.Alarm ? 'Alarm' : 'Normal')

  return (
    <div
      className={severity === 'CRITICAL' ? 'cmom-status-dot--pulse' : undefined}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: '8px 12px',
        borderLeft: `3px solid ${color}`,
        borderBottom: '1px solid var(--cmom-border, rgba(128,128,128,0.15))',
        background: severity === 'OK' ? 'transparent' : `color-mix(in srgb, ${color} 10%, transparent)`,
      }}
    >
      {/* Short "DI<n>" tag instead of the full "DigitalInputs/DigitalInput<n>"
          topic path — the Name column carries the human-readable meaning. */}
      <span
        style={{
          fontFamily: 'var(--cmom-font-mono, monospace)',
          fontWeight: 700,
          fontSize: 12,
          color,
          flex: '0 0 auto',
          minWidth: '3em',
        }}
        title={`DigitalInputs/${diKey}`}
      >
        {formatDiTag(diKey)}
      </span>
      {/* Name (the input's Description) can run quite long — e.g. "High Wet
          Well Alarm (Level Controller)" — and used to squeeze the current
          value into whatever thin sliver of the row was left, wrapping it
          across multiple lines. Truncating Name with an ellipsis (full text
          still available via title=) guarantees Value always gets real
          room instead. */}
      <span
        style={{ flex: '1 1 auto', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: 600 }}
        title={name}
      >
        {name}
      </span>
      <span style={{ flex: '1 1 auto', minWidth: '10em', opacity: 0.85 }}>{value}</span>
      <SeverityBadge severity={severity} />
    </div>
  )
}
