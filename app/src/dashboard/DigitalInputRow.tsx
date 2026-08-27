import * as React from 'react'
import * as q from '../../../backend/src/Model'
import SeverityBadge from './SeverityBadge'
import { digitalInputSeverity } from './config'
import { readGroupFields } from './pumpStationLeaf'

interface Props {
  label: string
  node: q.TreeNode<any>
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
export default function DigitalInputRow({ label, node }: Props) {
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

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '6px 10px',
        borderBottom: '1px solid var(--cmom-border, rgba(128,128,128,0.15))',
      }}
    >
      {/* Some labels (their parenthesized Description) run quite long — e.g.
          "High Wet Well Alarm (Level Controller)" — and used to squeeze the
          alarm description into whatever thin sliver of the row was left,
          wrapping it across two or three lines. Truncating the label with
          an ellipsis (full text still available via title=) guarantees the
          description always gets real room instead. */}
      <span
        style={{ fontFamily: 'monospace', flex: '0 1 auto', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
        title={label}
      >
        {label}
      </span>
      <span style={{ flex: '1 1 auto', minWidth: '10em', marginLeft: 12, marginRight: 12, opacity: 0.8 }}>
        {json.AlarmDescription || '—'}
      </span>
      <SeverityBadge severity={severity} />
    </div>
  )
}
