import * as q from '../../../backend/src/Model'

/**
 * logger.py (opc-dashboard) publishes one MQTT topic PER LEAF FIELD — e.g.
 * .../DigitalInputs/DigitalInput1/Alarm and .../DigitalInputs/DigitalInput1/Description
 * are each their own retained topic — with the real value wrapped as
 * {"value": ..., "node_path": ..., "display_name": ..., ...}. A group node like
 * DigitalInput1, ACPower, or UnitStatus never gets a message of its own; only its
 * leaf children do. Earlier pump-station code assumed the opposite (one JSON blob
 * per group), which is why every pump-station reading came back empty despite the
 * broker actually having the data (confirmed via mosquitto_sub / Explorer tree).
 */
export function readLeafValue(node: q.TreeNode<any> | undefined): any {
  const payload = node?.message?.payload?.toUnicodeString()
  if (!payload) return undefined
  try {
    const json = JSON.parse(payload)
    return json && typeof json === 'object' && 'value' in json ? json.value : json
  } catch {
    return payload
  }
}

/**
 * Reconstructs the flat {leafName: value} shape callers actually want (e.g.
 * {Alarm: true, Description: "...", AlarmDescription: "..."} for a DigitalInput{n}
 * group) from that group's child leaf topics.
 */
export function readGroupFields(groupNode: q.TreeNode<any> | undefined): Record<string, any> {
  const out: Record<string, any> = {}
  ;(groupNode?.edgeArray ?? []).forEach(edge => {
    out[edge.name] = readLeafValue(edge.target)
  })
  return out
}
