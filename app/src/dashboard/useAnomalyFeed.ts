import * as React from 'react'
import * as q from '../../../backend/src/Model'
import { dashboardConfig, Severity } from './config'
import { ChildTopic, useTopicChildren } from './useTopicChildren'
import { collectAnomalyTypes, isEntryDisplayable, resolveEntrySeverity } from './anomalyTypeScan'

export type DeviceType = 'Flow Monitor' | 'Pump Station'

export interface AnomalyEvent {
  id: string
  time: number
  deviceType: DeviceType
  deviceKey: string
  anomalyType: string
  severity: Severity
  previousSeverity: Severity
}

/**
 * Tracks anomaly transitions per (device, anomaly type) — every channel or
 * input has its own severity, so a flow monitor site or pump station serial
 * can raise several independent transitions at once, one per type.
 *
 * Re-scans devices' anomaly-type children when `devices` changes (new/removed
 * device); a channel that appears mid-session on an already-known device is
 * picked up on the next `devices` change, not instantly — acceptable for now,
 * flagged as a follow-up rather than adding a second polling layer here.
 */
function useDeviceTypeAnomalyEvents(devices: ChildTopic[], deviceType: DeviceType, onEvent: (e: AnomalyEvent) => void) {
  const previous = React.useRef<Map<string, Severity>>(new Map())

  React.useEffect(() => {
    const unsubscribers: Array<() => void> = []

    devices.forEach(d => {
      collectAnomalyTypes(d.node)
        .filter(isEntryDisplayable)
        .forEach(entry => {
          const trackingKey = `${d.key}::${entry.label}`

          const handler = () => {
            const severity = resolveEntrySeverity(entry)
            const prev = previous.current.get(trackingKey) ?? 'OK'
            if (severity !== prev) {
              previous.current.set(trackingKey, severity)
              onEvent({
                id: `${trackingKey}-${Date.now()}`,
                time: Date.now(),
                deviceType,
                deviceKey: d.key,
                anomalyType: entry.label,
                severity,
                previousSeverity: prev,
              })
            }
          }

          // Seed known state on (re)mount without emitting a synthetic transition.
          previous.current.set(trackingKey, resolveEntrySeverity(entry))

          // Digital input severity depends on the raw value node's own payload
          // (Alarm/AlarmDescription), not just a separate anomaly topic — watch
          // both so a client-side-computed transition is never missed.
          entry.node.onMessage.subscribe(handler)
          unsubscribers.push(() => entry.node.onMessage.unsubscribe(handler))

          if (entry.anomalyNode) {
            entry.anomalyNode.onMessage.subscribe(handler)
            unsubscribers.push(() => entry.anomalyNode!.onMessage.unsubscribe(handler))
          }
        })
    })

    return () => unsubscribers.forEach(unsub => unsub())
  }, [devices, deviceType, onEvent])
}

/**
 * Combines Flow Monitor and Pump Station anomaly-type transitions into one
 * newest-first feed, plus the raw device lists (so Overview can derive
 * fleet-wide severity counts from the same source of truth).
 */
export function useAnomalyFeed(tree?: q.Tree<any>) {
  const flowDevices = useTopicChildren(tree, dashboardConfig.flowMonitors.topicPrefix)
  const pumpDevices = useTopicChildren(tree, dashboardConfig.pumpStations.topicPrefix)
  const [events, setEvents] = React.useState<AnomalyEvent[]>([])

  const pushEvent = React.useCallback((e: AnomalyEvent) => {
    setEvents(prev => [e, ...prev].slice(0, 200))
  }, [])

  useDeviceTypeAnomalyEvents(flowDevices, 'Flow Monitor', pushEvent)
  useDeviceTypeAnomalyEvents(pumpDevices, 'Pump Station', pushEvent)

  return { events, flowDevices, pumpDevices }
}
