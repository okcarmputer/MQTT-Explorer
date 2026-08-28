import * as q from '../../../backend/src/Model'
import { Severity, severityFromPayload, severityOrder } from './config'
import { readGroupFields } from './pumpStationLeaf'

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
// A pump station DigitalInput{n}/AnalogInput{n} group node never carries a
// message itself (logger.py publishes each of its fields — Alarm, Description,
// ScaledValue, ... — as its own leaf topic, see pumpStationLeaf.ts) but its
// presence as a group is recognizable by which leaves it has. Without this
// check, walk() below would recurse past the group into its individual leaf
// fields and treat each one (Alarm, AlarmDescription, Description, ...) as
// its own unrelated "anomaly type", instead of the input as a whole.
function looksLikePumpStationReadingGroup(node: q.TreeNode<any>): boolean {
  return Boolean(node.edges['Alarm'] || node.edges['ScaledValue'])
}

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
      const isReading = anomalyEdge || child.hasMessage() || looksLikePumpStationReadingGroup(child)

      if (isReading) {
        out.push({ label: path.join('/'), node: child, anomalyNode: anomalyEdge?.target })
        continue
      }

      if (depthRemaining > 0 && child.edgeArray.length > 0) {
        walk(child, path, depthRemaining - 1)
      }
    }
  }

  walk(deviceNode, [], maxDepth)
  return out
}

// Reads a reading's own fields regardless of whether it's a flow monitor
// leaf (one JSON blob directly on the node) or a pump station input group
// (fields split across leaf children, see pumpStationLeaf.ts) — readGroupFields
// degrades to {} for a childless leaf, so this is safe for both shapes.
function readJson(node: q.TreeNode<any>): any {
  return readGroupFields(node)
}

/**
 * Severity for one entry: always read from the retained `.../anomaly` topic
 * the anomaly-detection repo publishes — never re-derived client-side. An
 * entry with no anomaly topic yet (no detector cycle has covered it) reads
 * as plain OK, matching DigitalInputRow and config.ts's severityFromPayload.
 */
export function resolveEntrySeverity(entry: AnomalyTypeEntry): Severity {
  return severityFromPayload(entry.anomalyNode?.message?.payload?.toUnicodeString())
}

/**
 * Human-readable description text for an anomaly entry, when the source
 * actually carries one — a pump-station digital input's own AlarmDescription/
 * Description field (real free text a technician wrote), or, for a flow
 * monitor channel, the raw `.../anomaly` topic payload itself (usually just
 * the severity keyword — see severityFromPayload — but shown verbatim in
 * case a given site's detector publishes more than that).
 */
export function resolveEntryDescription(entry: AnomalyTypeEntry): string | undefined {
  if (entry.anomalyNode) {
    const payload = entry.anomalyNode.message?.payload?.toUnicodeString()?.trim()
    return payload || undefined
  }

  const json = readJson(entry.node)
  if ('AlarmDescription' in json || 'Description' in json) {
    const description = (json.AlarmDescription || json.Description || '').trim()
    return description || undefined
  }

  return undefined
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
