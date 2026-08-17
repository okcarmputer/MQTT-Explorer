import * as React from 'react'
import * as q from '../../../backend/src/Model'
import { dashboardConfig, Severity } from './config'
import { ChildTopic, useTopicChildren } from './useTopicChildren'
import { collectAnomalyTypes, isEntryDisplayable, resolveEntrySeverity } from './anomalyTypeScan'

export type DeviceType = 'Flow Monitor' | 'Pump Station'

// Route prefix each device type's own detail page lives at — same paths
// FlowMonitors.tsx/PumpStations.tsx already link their cards to. Shared here
// so every anomaly-event consumer (RecentAnomaliesWidget, the Anomalies
// tab's table) links to the real device page the same way, in one place.
export const DEVICE_TYPE_ROUTE_PREFIX: Record<DeviceType, string> = {
  'Flow Monitor': '/flow-monitors',
  'Pump Station': '/pump-stations',
}

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

          // Seed known state on (re)mount. Unlike the original version of
          // this hook, an already-active alarm (e.g. a pump station digital
          // input that was already in alarm before this session even
          // connected, since MQTT retains the last value) DOES get an
          // initial event here rather than being silently absorbed —
          // otherwise the feed could go an entire session showing nothing
          // even while real, currently-active alarms exist, which read as
          // "the Anomalies tab isn't connected to anything" even though it
          // was technically working as originally designed (transitions
          // only). Surfacing what's active right now is more useful than
          // being strictly transition-only.
          const initialSeverity = resolveEntrySeverity(entry)
          // Only for a trackingKey never seen before in this component
          // instance — devices/anomaly types already known (e.g. this
          // effect re-running because a new device was discovered) must
          // not get re-seeded, or every device-list change would re-emit
          // "initial" events for every already-active alarm again.
          const alreadyTracked = previous.current.has(trackingKey)
          previous.current.set(trackingKey, initialSeverity)
          if (!alreadyTracked && initialSeverity !== 'OK') {
            onEvent({
              id: `${trackingKey}-initial-${Date.now()}`,
              time: Date.now(),
              deviceType,
              deviceKey: d.key,
              anomalyType: entry.label,
              severity: initialSeverity,
              previousSeverity: 'OK',
            })
          }

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
  const flowDevices = useTopicChildren(tree, dashboardConfig.flowMonitors.topicPrefix, dashboardConfig.flowMonitors.metadataChildren)
  const pumpDevices = useTopicChildren(tree, dashboardConfig.pumpStations.topicPrefix)
  const [events, setEvents] = React.useState<AnomalyEvent[]>([])

  const pushEvent = React.useCallback((e: AnomalyEvent) => {
    setEvents(prev => [e, ...prev].slice(0, 200))
  }, [])

  useDeviceTypeAnomalyEvents(flowDevices, 'Flow Monitor', pushEvent)
  useDeviceTypeAnomalyEvents(pumpDevices, 'Pump Station', pushEvent)

  return { events, flowDevices, pumpDevices }
}

export interface CurrentAnomaly {
  id: string
  deviceType: DeviceType
  deviceKey: string
  anomalyType: string
  severity: Severity
  lastUpdate?: number
}

/**
 * Live, unfiltered snapshot of every anomaly type currently at non-OK
 * severity across every flow monitor + pump station device, right now.
 *
 * Deliberately NOT derived from `events` above: that feed is scoped to
 * transitions seen since this browser tab connected and is capped at 200
 * (RecentAnomaliesWidget on Overview used to further cap it to 10) — a
 * long-running session or a burst of transitions can push a still-active
 * anomaly off the end of that list even though it never resolved. This
 * hook re-scans the tree directly (same primitives as
 * useFleetAnomalySeverities) so "what's currently wrong" always reflects
 * live state, not session/transition history.
 */
export function useCurrentAnomalies(flowDevices: ChildTopic[], pumpDevices: ChildTopic[]): CurrentAnomaly[] {
  const [anomalies, setAnomalies] = React.useState<CurrentAnomaly[]>([])

  React.useEffect(() => {
    function scan(devices: ChildTopic[], deviceType: DeviceType): CurrentAnomaly[] {
      const out: CurrentAnomaly[] = []
      devices.forEach(d => {
        collectAnomalyTypes(d.node)
          .filter(isEntryDisplayable)
          .forEach(entry => {
            const severity = resolveEntrySeverity(entry)
            if (severity !== 'OK') {
              out.push({
                id: `${deviceType}::${d.key}::${entry.label}`,
                deviceType,
                deviceKey: d.key,
                anomalyType: entry.label,
                severity,
                lastUpdate: entry.node.lastUpdate,
              })
            }
          })
      })
      return out
    }

    function refresh() {
      setAnomalies([...scan(flowDevices, 'Flow Monitor'), ...scan(pumpDevices, 'Pump Station')])
    }

    refresh()
    // Same 2s cadence as useFleetAnomalySeverities/useDeviceSeverities.
    const interval = setInterval(refresh, 2000)
    return () => clearInterval(interval)
  }, [flowDevices, pumpDevices])

  return anomalies
}
