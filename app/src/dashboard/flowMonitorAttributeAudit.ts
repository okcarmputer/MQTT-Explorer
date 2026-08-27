import * as q from '../../../backend/src/Model'
import { flowChannels } from './config'
import { readPortsForNode, extractDiameter } from './useFlowPortInfo'

// Mirrors FlowMonitorDetail.tsx's own sections/data sources — kept as one
// ordered list so the audit page's filter dropdown and the computation
// below can't drift apart. Deliberately MQTT-only (no SQL baseline/history
// fallback): those are optional analytics on top of a site, not attributes
// of the site itself, so their absence isn't counted as "missing."
export const FLOW_MONITOR_ATTRIBUTE_NAMES = [
  'Site Info',
  'Pipe Diameter',
  'Level Reading',
  'Level Channel',
  'Velocity Channel',
  'Flow Channel',
] as const

export type FlowMonitorAttributeName = (typeof FLOW_MONITOR_ATTRIBUTE_NAMES)[number]

/**
 * Every attribute FlowMonitorDetail.tsx would show as empty/absent for this
 * site right now, read straight from the tree (same live MQTT topics the
 * detail page itself reads: site_info, ports/{n}, and the Level/Velocity/
 * Flow channel leaves) — no SQL round trip needed, unlike the pump station
 * version of this audit.
 */
export function computeMissingFlowMonitorAttributes(deviceNode: q.TreeNode<any>): FlowMonitorAttributeName[] {
  const missing: FlowMonitorAttributeName[] = []

  const siteInfoNode = deviceNode.edges['site_info']?.target
  const siteInfoPayload = siteInfoNode?.message?.payload?.toUnicodeString()
  let hasSiteInfo = false
  if (siteInfoPayload) {
    try {
      hasSiteInfo = Object.keys(JSON.parse(siteInfoPayload)).length > 0
    } catch {
      // leave hasSiteInfo false
    }
  }
  if (!hasSiteInfo) missing.push('Site Info')

  const channels = flowChannels.map(c => ({ ...c, node: deviceNode.edges[c.id]?.target })).filter(c => c.node)
  if (!channels.find(c => c.key === 'level')) missing.push('Level Channel')
  if (!channels.find(c => c.key === 'velocity')) missing.push('Velocity Channel')
  if (!channels.find(c => c.key === 'flow')) missing.push('Flow Channel')

  const ports = readPortsForNode(deviceNode)
  const diameter = extractDiameter(ports)
  if (!diameter) missing.push('Pipe Diameter')

  const levelChannel = channels.find(c => c.key === 'level')
  const levelPayload = levelChannel?.node?.message?.payload?.toUnicodeString()
  let levelValue: number | undefined
  if (levelPayload) {
    try {
      const json = JSON.parse(levelPayload)
      levelValue = json.Value !== undefined ? Number(json.Value) : undefined
    } catch {
      // leave levelValue undefined
    }
  }
  if (levelValue === undefined || Number.isNaN(levelValue)) missing.push('Level Reading')

  return missing
}
