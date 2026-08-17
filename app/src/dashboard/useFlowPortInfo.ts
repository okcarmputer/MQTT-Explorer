import { useEffect, useState } from 'react'
import * as q from '../../../backend/src/Model'
import { ChildTopic } from './useTopicChildren'

export interface FlowPortDimension {
  name: string
  value: string
  units: string
}

export interface FlowPortInfo {
  portId: string
  shape: string | null
  dimensions: FlowPortDimension[]
}

/**
 * fm_mqtt.py publishes pipe/port dimensions directly over MQTT under
 * flow_monitors/{site}/ports/{port_id} (see config.ts's flowMonitors
 * comment) — a live, always-on source for exactly the "Shape"/"Diameter"
 * attributes that were previously only fetched via a separate SQL Server
 * round trip (useSqlFlowPortInfo). That MQTT topic was never actually read
 * anywhere in the dashboard, which is why dimensions weren't showing up in
 * Attributes even though the broker had them the whole time.
 *
 * Confirmed real payload shape (one whole JSON object per port topic, not
 * further nested sub-topics):
 *   {
 *     "site_number": "49640", "port_id": "1", "channel_types": ["7","11","15"],
 *     "flow_channel": {
 *       "shape": "Area Velocity (Circular)",
 *       "dimensions": [{ "name": "Diameter", "value": "30", "units": "in" }],
 *       ...
 *     },
 *     "status": "OK", "message": ""
 *   }
 * An earlier version of this reader flattened the payload generically and
 * skipped any nested object/array field — which silently dropped
 * `flow_channel` (an object) and its `dimensions` (an array) entirely, so
 * the diameter was never actually read despite the topic being subscribed
 * correctly. This reads the real shape directly instead of guessing.
 */
function readPort(node: q.TreeNode<any> | undefined): { shape: string | null; dimensions: FlowPortDimension[] } {
  const payload = node?.message?.payload?.toUnicodeString()
  if (!payload) {
    return { shape: null, dimensions: [] }
  }
  try {
    const json = JSON.parse(payload)
    const flowChannel = json.flow_channel ?? {}
    const dimensions: FlowPortDimension[] = Array.isArray(flowChannel.dimensions)
      ? flowChannel.dimensions
          .filter((d: any) => d && d.name !== undefined && d.value !== undefined)
          .map((d: any) => ({ name: String(d.name), value: String(d.value), units: d.units ? String(d.units) : '' }))
      : []
    return { shape: flowChannel.shape ?? json.shape ?? null, dimensions }
  } catch {
    return { shape: null, dimensions: [] }
  }
}

/**
 * Same read as useFlowPortInfo, but for one already-known device node —
 * used by FlowMonitorDetail, which doesn't have a ChildTopic[] list, just
 * the single site it's showing. Not a hook itself; caller is responsible
 * for re-invoking on whatever tick/subscription already drives its
 * re-renders (see FlowMonitorDetail's existing onEdgesChange effect).
 */
export function readPortsForNode(node: q.TreeNode<any>): FlowPortInfo[] {
  const portsGroup = node.edges['ports']?.target
  return (portsGroup?.edgeArray ?? []).map(edge => ({ portId: edge.name, ...readPort(edge.target) }))
}

export function useFlowPortInfo(devices: ChildTopic[]): Record<string, FlowPortInfo[]> {
  const [, setTick] = useState(0)

  useEffect(() => {
    const rerender = () => setTick(t => t + 1)
    const unsubscribers: Array<() => void> = []

    devices.forEach(d => {
      const portsGroup = d.node.edges['ports']?.target
      portsGroup?.edgeArray.forEach(edge => {
        edge.target.onMessage.subscribe(rerender)
        unsubscribers.push(() => edge.target.onMessage.unsubscribe(rerender))
      })
      portsGroup?.onEdgesChange.subscribe(rerender)
      if (portsGroup) {
        unsubscribers.push(() => portsGroup.onEdgesChange.unsubscribe(rerender))
      }
    })

    return () => unsubscribers.forEach(unsub => unsub())
  }, [devices])

  const out: Record<string, FlowPortInfo[]> = {}
  devices.forEach(d => {
    out[d.key] = readPortsForNode(d.node)
  })
  return out
}

/**
 * Turns one site's MQTT-sourced port list into display rows: Shape, plus
 * one row per published dimension (e.g. "Diameter: 30 in"). Prefixes with
 * the port id only when a site has more than one port, matching
 * formatPortAttributes' (SQL-sourced) convention.
 */
export function formatFlowPortInfo(ports: FlowPortInfo[]): { label: string; value: string }[] {
  const multiplePorts = ports.length > 1
  const rows: { label: string; value: string }[] = []

  ports.forEach(port => {
    const prefix = multiplePorts ? `Port ${port.portId} ` : ''
    if (port.shape) {
      rows.push({ label: `${prefix}Shape`, value: port.shape })
    }
    port.dimensions.forEach(d => {
      rows.push({ label: `${prefix}${d.name}`, value: d.units ? `${d.value} ${d.units}` : d.value })
    })
  })

  return rows
}

/**
 * Numeric diameter + unit for PipeGauge, from whichever port has a
 * dimension named "Diameter" (case-insensitive). Returns undefined if no
 * port has one — PipeGauge's caller falls back to config.ts's flat
 * gaugeMaxInches assumption in that case.
 */
export function extractDiameter(ports: FlowPortInfo[]): { value: number; unit: string } | undefined {
  for (const port of ports) {
    const dimension = port.dimensions.find(d => d.name.toLowerCase().includes('diameter'))
    if (!dimension) continue
    const value = Number(dimension.value)
    if (Number.isNaN(value)) continue
    return { value, unit: dimension.units || 'in' }
  }
  return undefined
}
