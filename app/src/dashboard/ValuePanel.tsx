import * as React from 'react'
import * as q from '../../../backend/src/Model'
import { useTopicMessage } from './useTopicChildren'

interface Props {
  title: string
  node: q.TreeNode<any>
  valuePath?: string
  unit?: string
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
 * Current value + baseline readout, no chart — for points that are a single
 * reading rather than a trend-worthy series (Battery State, Temperature).
 */
export default function ValuePanel({ title, node, valuePath, unit }: Props) {
  useTopicMessage(node)
  const baselineNode = node.edges['baseline']?.target
  useTopicMessage(baselineNode)

  const json = readJson(node)
  const value = valuePath ? json[valuePath] : node.message?.payload?.toUnicodeString()
  const baselineText = baselineNode?.message?.payload?.toUnicodeString()

  return (
    <div className="cmom-card" style={{ padding: 'var(--cmom-space-2, 8px)' }}>
      <div style={{ fontSize: 11, fontWeight: 600, opacity: 0.75, marginBottom: 4 }}>{title}</div>
      <div className="cmom-value">
        {value !== undefined && value !== null ? String(value) : '—'}
        {unit && value !== undefined && value !== null ? (
          <span style={{ fontSize: '0.55em', fontWeight: 500, opacity: 0.7 }}> {unit}</span>
        ) : (
          ''
        )}
      </div>
      <div style={{ fontSize: 11, opacity: 0.6, marginTop: 4 }}>Baseline: {baselineText || 'not available yet'}</div>
    </div>
  )
}
