import * as React from 'react'
import * as q from '../../../backend/src/Model'
import SeverityBadge from './SeverityBadge'
import { digitalInputSeverity } from './config'
import { useTopicMessage } from './useTopicChildren'

interface Props {
  label: string
  node: q.TreeNode<any>
}

function readJson(node: q.TreeNode<any>): any {
  const payload = node.message?.payload?.toUnicodeString()
  if (!payload) return {}
  try {
    return JSON.parse(payload)
  } catch {
    return {}
  }
}

/**
 * Digital inputs are alarms, not trends — current alarm description +
 * severity, no chart. Severity rule lives in config.ts (digitalInputSeverity)
 * so this row and the fleet-wide rollup (anomalyTypeScan.ts) stay in sync.
 */
export default function DigitalInputRow({ label, node }: Props) {
  useTopicMessage(node)
  const json = readJson(node)
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
      <span style={{ fontFamily: 'monospace' }}>{label}</span>
      <span style={{ flex: 1, marginLeft: 12, marginRight: 12, opacity: 0.8 }}>{json.AlarmDescription || '—'}</span>
      <SeverityBadge severity={severity} />
    </div>
  )
}
