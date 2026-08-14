import * as q from '../../../backend/src/Model'
import { Severity, digitalInputSeverity, severityFromPayload, severityOrder } from './config'

export interface AnomalyTypeEntry {
  // Path relative to the device node, e.g. "FLOW" (flow monitor channel) or
  // "DigitalInputs/DigitalInput3" (pump station input). This is the anomaly
  // type label — each one carries its own severity, never the device as a whole.
  label: string
  node: q.TreeNode<any>
  anomalyNode?: q.TreeNode<any>
}

const ANOMALY_CHILD_NAME = 'anomaly'
// Metadata branches that aren't measurement/anomaly-bearing channels.
const EXCLUDED_SEGMENTS = new Set(['site_info', 'ports', 'status', ANOMALY_CHILD_NAME])

/**
 * Walks a device node (a flow monitor site or pump station serial) looking
 * for anomaly-type channels — any node that either carries its own reading
 * (a leaf with a message, e.g. a flow channel or a DigitalInput) or has a
 * retained `.../anomaly` child. Each one is its own entry with its own
 * severity; there is no device-level rollup.
 */
export function collectAnomalyTypes(deviceNode: q.TreeNode<any>, maxDepth: number = 2): AnomalyTypeEntry[] {
  const out: AnomalyTypeEntry[] = []

  function walk(node: q.TreeNode<any>, pathSegments: string[], depthRemaining: number) {
    for (const edge of node.edgeArray) {
      if (EXCLUDED_SEGMENTS.has(edge.name)) {
        continue
      }

      const child = edge.target
      const path = [...pathSegments, edge.name]
      const anomalyEdge = child.edges[ANOMALY_CHILD_NAME]

      if (anomalyEdge || child.hasMessage()) {
        out.push({ label: path.join('/'), node: child, anomalyNode: anomalyEdge?.target })
      }

      if (depthRemaining > 0 && child.edgeArray.length > 0) {
        walk(child, path, depthRemaining - 1)
      }
    }
  }

  walk(deviceNode, [], maxDepth)
  return out
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
 * Severity for one entry, matching exactly what the per-device detail views
 * show: a retained `.../anomaly` topic if present, otherwise digital-input
 * alarms are recognized by their own payload shape (Alarm + AlarmDescription)
 * and scored client-side via the same rule DigitalInputRow uses. Everything
 * else (no anomaly topic yet, e.g. flow channels/analog inputs pre-detector-publish)
 * reads OK — see config.ts.
 */
export function resolveEntrySeverity(entry: AnomalyTypeEntry): Severity {
  if (entry.anomalyNode) {
    return severityFromPayload(entry.anomalyNode.message?.payload?.toUnicodeString())
  }

  const json = readJson(entry.node)
  if ('Alarm' in json && 'AlarmDescription' in json) {
    return digitalInputSeverity(Boolean(json.Alarm), json.AlarmDescription)
  }

  return 'OK'
}

/**
 * Same display filters the detail views apply (skip empty/"Spare" digital
 * inputs, skip unnamed/"Channel"-labeled analog inputs) — so the fleet
 * rollup and Anomalies feed don't count noise the detail views themselves hide.
 */
export function isEntryDisplayable(entry: AnomalyTypeEntry): boolean {
  const json = readJson(entry.node)

  if ('Alarm' in json && 'AlarmDescription' in json) {
    const desc = (json.Description || '').trim().toLowerCase()
    return desc !== '' && desc !== 'spare'
  }

  if ('ScaledValue' in json) {
    const desc = (json.Description || '').trim().toLowerCase()
    return desc !== '' && !desc.includes('channel')
  }

  return true
}

/**
 * Device-level severity for table rows/filtering: the max across every
 * displayable anomaly type on the device. A device carries no severity of
 * its own (see config.ts) — this is a rollup for display purposes only, not
 * a new source of truth.
 */
export function deviceSeverity(deviceNode: q.TreeNode<any>): Severity {
  const entries = collectAnomalyTypes(deviceNode).filter(isEntryDisplayable)
  let worst: Severity = 'OK'
  for (const entry of entries) {
    const severity = resolveEntrySeverity(entry)
    if (severityOrder.indexOf(severity) > severityOrder.indexOf(worst)) {
      worst = severity
    }
  }
  return worst
}
