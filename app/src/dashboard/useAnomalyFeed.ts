import * as React from 'react'
import * as q from '../../../backend/src/Model'
import { dashboardConfig, Severity, severityFromDiurnalLevel, severityOrder } from './config'
import { ChildTopic, resolveAnomalyRoot, useTopicChildren } from './useTopicChildren'
import { collectAnomalyTypes, isEntryDisplayable, resolveEntryDescription, resolveEntrySeverity } from './anomalyTypeScan'
import { collectDiurnalAnomaliesForSite, DiurnalAnomaly, DIURNAL_MEASUREMENT_TYPES } from './useDiurnalAnomalies'

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
  description?: string
  // Set only for diurnal_detector.py events (avg-vs-hour / normalized-shape
  // levels, -3..4 — see useDiurnalAnomalies.ts's DiurnalAnomaly) so the card
  // can render "Normal Anomaly Val" / "Average Anomaly Value" precisely
  // instead of parsing them back out of `description`'s free text. Either
  // can be undefined on its own (the detector doesn't always publish both).
  normalAnomalyLevel?: number
  avgAnomalyLevel?: number
  // The two diurnal baselines themselves (DiurnalAnomaly.avgDiurnal/
  // normDiurnal — SQL's AvgDiurnal/NormDiurnal columns), alongside the
  // measured value, so a diurnal card can show what was actually compared
  // against, not just the resulting -3..3 level. Same "either can be
  // undefined on its own" caveat as normalAnomalyLevel/avgAnomalyLevel.
  avgDiurnal?: number
  normDiurnal?: number
  measurementValue?: number
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
  const anomalyRootPrefix = deviceType === 'Flow Monitor' ? dashboardConfig.flowMonitors.anomalyTopicPrefix : undefined

  React.useEffect(() => {
    const unsubscribers: Array<() => void> = []

    devices.forEach(d => {
      collectAnomalyTypes(d.node, 2, resolveAnomalyRoot(d, anomalyRootPrefix))
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
                description: resolveEntryDescription(entry),
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
              description: resolveEntryDescription(entry),
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

// Worst of a diurnal reading's two independent levels (hour-of-day avg vs.
// normalized shape), through severityFromDiurnalLevel's -3..4 -> Severity
// mapping (config.ts) — same convention TrendPanel's badge uses.
function diurnalWorstSeverity(d: DiurnalAnomaly): Severity {
  const avg = severityFromDiurnalLevel(d.avgAnomalyLevel)
  const normal = severityFromDiurnalLevel(d.normalAnomalyLevel)
  return severityOrder.indexOf(normal) > severityOrder.indexOf(avg) ? normal : avg
}

function diurnalDescription(d: DiurnalAnomaly): string {
  return `vs. hour avg ${d.avgAnomalyLevel ?? '?'}, vs. normal shape ${d.normalAnomalyLevel ?? '?'}`
}

/**
 * Same transition-tracking shape as useDeviceTypeAnomalyEvents above, but for
 * diurnal_detector.py's hour-of-day engine (AnomalyDetection/FlowMonitors/{site}/
 * {Flow,Level,Velocity} — a separate topic tree/detector from the monthly
 * flow_monitors/{site}/{channel}/anomaly one, see useDiurnalAnomalies.ts).
 * Severity here isn't read from a sibling `.../anomaly` topic — it's derived
 * from the reading's own avg/normal anomaly levels via diurnalWorstSeverity.
 */
function useDiurnalAnomalyEvents(diurnalDevices: ChildTopic[], onEvent: (e: AnomalyEvent) => void) {
  const previous = React.useRef<Map<string, Severity>>(new Map())

  React.useEffect(() => {
    const unsubscribers: Array<() => void> = []

    diurnalDevices.forEach(d => {
      DIURNAL_MEASUREMENT_TYPES.forEach(measurementType => {
        const node = d.node.edges[measurementType]?.target
        if (!node) return

        const trackingKey = `${d.key}::Diurnal/${measurementType}`
        const anomalyType = `Diurnal/${measurementType}`

        const evaluate = () => {
          const parsed = collectDiurnalAnomaliesForSite(d.node, d.key).find(a => a.measurementType === measurementType)
          return parsed
            ? {
                severity: diurnalWorstSeverity(parsed),
                description: diurnalDescription(parsed),
                normalAnomalyLevel: parsed.normalAnomalyLevel,
                avgAnomalyLevel: parsed.avgAnomalyLevel,
                avgDiurnal: parsed.avgDiurnal,
                normDiurnal: parsed.normDiurnal,
                measurementValue: parsed.measurementValue,
              }
            : {
                severity: 'OK' as Severity,
                description: undefined,
                normalAnomalyLevel: undefined,
                avgAnomalyLevel: undefined,
                avgDiurnal: undefined,
                normDiurnal: undefined,
                measurementValue: undefined,
              }
        }

        const handler = () => {
          const { severity, description, normalAnomalyLevel, avgAnomalyLevel, avgDiurnal, normDiurnal, measurementValue } = evaluate()
          const prev = previous.current.get(trackingKey) ?? 'OK'
          if (severity !== prev) {
            previous.current.set(trackingKey, severity)
            onEvent({
              id: `${trackingKey}-${Date.now()}`,
              time: Date.now(),
              deviceType: 'Flow Monitor',
              deviceKey: d.key,
              anomalyType,
              severity,
              previousSeverity: prev,
              description,
              normalAnomalyLevel,
              avgAnomalyLevel,
              avgDiurnal,
              normDiurnal,
              measurementValue,
            })
          }
        }

        // Seed known state on (re)mount, same "surface what's already active"
        // rationale as useDeviceTypeAnomalyEvents above.
        const {
          severity: initialSeverity,
          description: initialDescription,
          normalAnomalyLevel: initialNormal,
          avgAnomalyLevel: initialAvg,
          avgDiurnal: initialAvgDiurnal,
          normDiurnal: initialNormDiurnal,
          measurementValue: initialMeasurementValue,
        } = evaluate()
        const alreadyTracked = previous.current.has(trackingKey)
        previous.current.set(trackingKey, initialSeverity)
        if (!alreadyTracked && initialSeverity !== 'OK') {
          onEvent({
            id: `${trackingKey}-initial-${Date.now()}`,
            time: Date.now(),
            deviceType: 'Flow Monitor',
            deviceKey: d.key,
            anomalyType,
            severity: initialSeverity,
            previousSeverity: 'OK',
            description: initialDescription,
            normalAnomalyLevel: initialNormal,
            avgAnomalyLevel: initialAvg,
            avgDiurnal: initialAvgDiurnal,
            normDiurnal: initialNormDiurnal,
            measurementValue: initialMeasurementValue,
          })
        }

        node.onMessage.subscribe(handler)
        unsubscribers.push(() => node.onMessage.unsubscribe(handler))
      })
    })

    return () => unsubscribers.forEach(unsub => unsub())
  }, [diurnalDevices, onEvent])
}

/**
 * Combines Flow Monitor and Pump Station anomaly-type transitions into one
 * newest-first feed, plus the raw device lists (so Overview can derive
 * fleet-wide severity counts from the same source of truth).
 */
export function useAnomalyFeed(tree?: q.Tree<any>) {
  const flowDevices = useTopicChildren(tree, dashboardConfig.flowMonitors.topicPrefix, dashboardConfig.flowMonitors.metadataChildren)
  const pumpDevices = useTopicChildren(tree, dashboardConfig.pumpStations.topicPrefix)
  const diurnalDevices = useTopicChildren(tree, dashboardConfig.flowMonitors.diurnalTopicPrefix)
  const [events, setEvents] = React.useState<AnomalyEvent[]>([])

  const pushEvent = React.useCallback((e: AnomalyEvent) => {
    setEvents(prev => [e, ...prev].slice(0, 200))
  }, [])

  useDeviceTypeAnomalyEvents(flowDevices, 'Flow Monitor', pushEvent)
  useDeviceTypeAnomalyEvents(pumpDevices, 'Pump Station', pushEvent)
  useDiurnalAnomalyEvents(diurnalDevices, pushEvent)

  return { events, flowDevices, pumpDevices, diurnalDevices }
}

export interface CurrentAnomaly {
  id: string
  deviceType: DeviceType
  deviceKey: string
  anomalyType: string
  severity: Severity
  lastUpdate?: number
  description?: string
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
export function useCurrentAnomalies(flowDevices: ChildTopic[], pumpDevices: ChildTopic[], diurnalDevices: ChildTopic[] = []): CurrentAnomaly[] {
  const [anomalies, setAnomalies] = React.useState<CurrentAnomaly[]>([])

  React.useEffect(() => {
    function scan(devices: ChildTopic[], deviceType: DeviceType): CurrentAnomaly[] {
      const anomalyRootPrefix = deviceType === 'Flow Monitor' ? dashboardConfig.flowMonitors.anomalyTopicPrefix : undefined
      const out: CurrentAnomaly[] = []
      devices.forEach(d => {
        collectAnomalyTypes(d.node, 2, resolveAnomalyRoot(d, anomalyRootPrefix))
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
                description: resolveEntryDescription(entry),
              })
            }
          })
      })
      return out
    }

    function scanDiurnal(devices: ChildTopic[]): CurrentAnomaly[] {
      const out: CurrentAnomaly[] = []
      devices.forEach(d => {
        collectDiurnalAnomaliesForSite(d.node, d.key).forEach(parsed => {
          const severity = diurnalWorstSeverity(parsed)
          if (severity !== 'OK') {
            const node = d.node.edges[parsed.measurementType]?.target
            out.push({
              id: `Flow Monitor::${d.key}::Diurnal/${parsed.measurementType}`,
              deviceType: 'Flow Monitor',
              deviceKey: d.key,
              anomalyType: `Diurnal/${parsed.measurementType}`,
              severity,
              lastUpdate: node?.lastUpdate,
              description: diurnalDescription(parsed),
            })
          }
        })
      })
      return out
    }

    function refresh() {
      setAnomalies([...scan(flowDevices, 'Flow Monitor'), ...scan(pumpDevices, 'Pump Station'), ...scanDiurnal(diurnalDevices)])
    }

    refresh()
    // Same 2s cadence as useFleetAnomalySeverities/useDeviceSeverities.
    const interval = setInterval(refresh, 2000)
    return () => clearInterval(interval)
  }, [flowDevices, pumpDevices, diurnalDevices])

  return anomalies
}

/**
 * Fleet-wide diurnal severity rollup, parallel to useFleetAnomalySeverities
 * (useTopicChildren.ts) for the monthly detector — used to fold diurnal
 * anomalies into Overview's LOW/MODERATE/CRITICAL tile counts.
 */
export function useDiurnalSeverities(diurnalDevices: ChildTopic[]): Severity[] {
  const [severities, setSeverities] = React.useState<Severity[]>([])

  React.useEffect(() => {
    function refresh() {
      const all: Severity[] = []
      diurnalDevices.forEach(d => {
        collectDiurnalAnomaliesForSite(d.node, d.key).forEach(parsed => all.push(diurnalWorstSeverity(parsed)))
      })
      setSeverities(all)
    }

    refresh()
    const interval = setInterval(refresh, 2000)
    return () => clearInterval(interval)
  }, [diurnalDevices])

  return severities
}

/**
 * Per-device diurnal severity rollup (site number -> worst diurnal severity
 * across Flow/Level/Velocity), parallel to useDeviceSeverities
 * (useTopicChildren.ts) for the monthly detector — merged into
 * MqttStoreSync's flow monitor snapshot so device cards/table rows reflect
 * diurnal anomalies too, not just the monthly detector's.
 */
export function useDiurnalDeviceSeverities(diurnalDevices: ChildTopic[]): Record<string, Severity> {
  const [severities, setSeverities] = React.useState<Record<string, Severity>>({})

  React.useEffect(() => {
    function refresh() {
      const next: Record<string, Severity> = {}
      diurnalDevices.forEach(d => {
        let worst: Severity = 'OK'
        collectDiurnalAnomaliesForSite(d.node, d.key).forEach(parsed => {
          const severity = diurnalWorstSeverity(parsed)
          if (severityOrder.indexOf(severity) > severityOrder.indexOf(worst)) {
            worst = severity
          }
        })
        next[d.key] = worst
      })
      setSeverities(next)
    }

    refresh()
    const interval = setInterval(refresh, 2000)
    return () => clearInterval(interval)
  }, [diurnalDevices])

  return severities
}
