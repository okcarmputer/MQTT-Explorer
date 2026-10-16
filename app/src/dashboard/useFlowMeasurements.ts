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
  // Site fields fm_mqtt.py attaches to every measurement payload (since
  // 2026-10-01): SiteName/Latitude/Longitude from the Hach site record,
  // Basin from SQL hach_flow_monitors. Taken from the first channel that
  // carries each one; null in the payload reads as absent.
  site: FlowMeasurementSite
}

export interface FlowMeasurementSite {
  siteName?: string
  latitude?: number
  longitude?: number
  basin?: string
}

interface ChannelPayload {
  value: string
  received?: number
  site: FlowMeasurementSite
}

function text(value: unknown): string | undefined {
  const trimmed = value === null || value === undefined ? '' : String(value).trim()
  return trimmed || undefined
}

function coordinate(value: unknown): number | undefined {
  if (value === null || value === undefined || value === '') {
    return undefined
  }
  const n = Number(value)
  return Number.isFinite(n) ? n : undefined
}

function readChannel(node: q.TreeNode<any> | undefined): ChannelPayload | undefined {
  const message = node?.message
  const payload = message?.payload?.toUnicodeString()
  if (!message || !payload) {
    return undefined
  }

  const received = message.received ? message.received.getTime() : undefined
  try {
    const json = JSON.parse(payload)
    if (json && json.Value !== undefined) {
      const site: FlowMeasurementSite = {
        siteName: text(json.SiteName),
        latitude: coordinate(json.Latitude),
        longitude: coordinate(json.Longitude),
        basin: text(json.Basin),
      }
      return { value: String(json.Value), received, site }
    }
  } catch {
    // fall through to raw payload
  }
  return { value: payload, received, site: {} }
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
    const site: FlowMeasurementSite = {}

    flowChannels.forEach(c => {
      const channelNode = d.node.edges[c.id]?.target
      const reading = readChannel(channelNode)
      if (reading) {
        site.siteName ??= reading.site.siteName
        site.latitude ??= reading.site.latitude
        site.longitude ??= reading.site.longitude
        site.basin ??= reading.site.basin
        readings[c.key] = { value: reading.value, unit: c.unit, label: c.label }
        if (reading.received !== undefined && (lastUpdate === undefined || reading.received > lastUpdate)) {
          lastUpdate = reading.received
        }
      }
    })

    out[d.key] = { siteKey: d.key, readings, lastUpdate, site }
  })

  return out
}
