import { useEffect, useState } from 'react'
import * as q from '../../../backend/src/Model'
import { ChildTopic } from './useTopicChildren'
import { flowChannels } from './config'

export interface ChannelReading {
  value: string
  unit: string
  label: string
}

export interface FlowMeasurement {
  siteKey: string
  // Keyed by FlowChannelConfig.key ('level' | 'velocity' | 'flow') — only
  // channels this site has actually published are present.
  readings: Partial<Record<string, ChannelReading>>
  // Most recent message.received across this site's Level/Velocity/Flow
  // channels — the "actual last update" for the site, not the tree node's
  // own lastUpdate (which can lag behind if it's driven by a different
  // child, e.g. status/site_info).
  lastUpdate?: number
}

function readChannel(node: q.TreeNode<any> | undefined): { value: string; received?: number } | undefined {
  const message = node?.message
  const payload = message?.payload?.toUnicodeString()
  if (!message || !payload) {
    return undefined
  }

  const received = message.received ? message.received.getTime() : undefined
  try {
    const json = JSON.parse(payload)
    if (json.Value !== undefined) {
      return { value: String(json.Value), received }
    }
  } catch {
    // fall through to raw payload
  }
  return { value: payload, received }
}

/**
 * Live Level/Velocity/Flow readings per flow monitor site, for display
 * outside the per-site detail view (Overview's device cards, the Flow
 * Monitors table) — same channel nodes and "Value" field FlowMonitorDetail's
 * TrendPanel reads, just rolled up across every site instead of one at a time.
 */
export function useFlowMeasurements(devices: ChildTopic[]): Record<string, FlowMeasurement> {
  const [, setTick] = useState(0)

  useEffect(() => {
    const rerender = () => setTick(t => t + 1)
    const unsubscribers: Array<() => void> = []

    devices.forEach(d => {
      flowChannels.forEach(c => {
        const channelNode = d.node.edges[c.id]?.target
        if (channelNode) {
          channelNode.onMessage.subscribe(rerender)
          unsubscribers.push(() => channelNode.onMessage.unsubscribe(rerender))
        }
      })
    })

    return () => unsubscribers.forEach(unsub => unsub())
  }, [devices])

  const out: Record<string, FlowMeasurement> = {}
  devices.forEach(d => {
    const readings: FlowMeasurement['readings'] = {}
    let lastUpdate: number | undefined

    flowChannels.forEach(c => {
      const channelNode = d.node.edges[c.id]?.target
      const reading = readChannel(channelNode)
      if (reading) {
        readings[c.key] = { value: reading.value, unit: c.unit, label: c.label }
        if (reading.received !== undefined && (lastUpdate === undefined || reading.received > lastUpdate)) {
          lastUpdate = reading.received
        }
      }
    })

    out[d.key] = { siteKey: d.key, readings, lastUpdate }
  })

  return out
}
