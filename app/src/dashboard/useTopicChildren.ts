import { useEffect, useState } from 'react'
import * as q from '../../../backend/src/Model'
import { usePollingToFetchTreeNode } from '../components/helper/usePollingToFetchTreeNode'
import { Severity } from './config'
import { collectAnomalyTypes, deviceSeverity, isEntryDisplayable, resolveEntrySeverity } from './anomalyTypeScan'

export interface ChildTopic {
  key: string
  path: string
  node: q.TreeNode<any>
}

/**
 * Live list of the immediate children of `prefixPath` in the topic tree,
 * e.g. children of "flow_monitors" are site number segments. Used to
 * enumerate devices under a wildcard-style prefix (flow_monitors/+) without
 * a purpose-built MQTT wildcard subscription.
 */
export function useTopicChildren(
  tree: q.Tree<any> | undefined,
  prefixPath: string,
  // Immediate children that aren't actually devices — e.g. flow_monitors'
  // data_channel_types is a reference/lookup topic sitting directly under
  // the same prefix as site numbers, not a site itself. Excluded here
  // (rather than filtered per-caller) so every consumer of this prefix
  // (the device grid, MqttStoreSync, the anomaly feed) agrees on what
  // counts as a real device without duplicating the exclusion list.
  excludeKeys?: string[]
): ChildTopic[] {
  const parentNode = usePollingToFetchTreeNode(tree, prefixPath)
  const [children, setChildren] = useState<ChildTopic[]>([])

  useEffect(() => {
    if (!parentNode) {
      setChildren([])
      return
    }

    function refresh() {
      const next = parentNode!.edgeArray
        .filter(edge => !excludeKeys?.includes(edge.name))
        .map(edge => ({
          key: edge.name,
          path: edge.target.path(),
          node: edge.target,
        }))
      setChildren(next)
    }

    refresh()
    const interval = setInterval(refresh, 1000)
    parentNode.onEdgesChange.subscribe(refresh)

    return () => {
      clearInterval(interval)
      parentNode.onEdgesChange.unsubscribe(refresh)
    }
  }, [parentNode, excludeKeys?.join(',')])

  return children
}

/**
 * Re-renders the caller whenever `node` receives a new message. Returns the
 * node's current message (or undefined) so panels can read the latest
 * payload directly.
 */
export function useTopicMessage(node: q.TreeNode<any> | undefined) {
  const [, setTick] = useState(0)

  useEffect(() => {
    if (!node) {
      return
    }

    const onMessage = () => setTick(t => t + 1)
    node.onMessage.subscribe(onMessage)
    return () => node.onMessage.unsubscribe(onMessage)
  }, [node])

  return node?.message
}

// Flow monitors' anomaly topics live under a sibling tree (flow_monitors/{site}/...)
// rather than under the value topics' own prefix (flow_monitors/prod/{site}/...)
// — see config.ts's anomalyTopicPrefix and anomalyTypeScan's collectAnomalyTypes.
// Resolves the equivalent site node in that other tree for one device, or
// undefined if no such prefix applies (pump stations) or the tree doesn't
// have that path yet (no detector cycle has published there yet).
export function resolveAnomalyRoot(device: ChildTopic, anomalyRootPrefix?: string) {
  if (!anomalyRootPrefix) {
    return undefined
  }
  return device.node.firstNode().findNode(`${anomalyRootPrefix}/${device.key}`)
}

/**
 * Fleet-wide rollup: every anomaly-type severity across every device in
 * `devices` (e.g. every channel of every flow monitor site), flattened into
 * one list. There is no per-device severity to roll up from — each channel
 * or input carries its own, so the rollup is a straight aggregate of all of
 * them. Used by Overview for the LOW/MODERATE/CRITICAL tile counts.
 */
export function useFleetAnomalySeverities(devices: ChildTopic[], anomalyRootPrefix?: string): Severity[] {
  const [severities, setSeverities] = useState<Severity[]>([])

  useEffect(() => {
    function refresh() {
      const all: Severity[] = []
      devices.forEach(d => {
        collectAnomalyTypes(d.node, 2, resolveAnomalyRoot(d, anomalyRootPrefix))
          .filter(isEntryDisplayable)
          .forEach(entry => all.push(resolveEntrySeverity(entry)))
      })
      setSeverities(all)
    }

    refresh()
    const interval = setInterval(refresh, 2000)
    return () => clearInterval(interval)
  }, [devices, anomalyRootPrefix])

  return severities
}

/**
 * Per-device severity rollup (device key -> worst anomaly-type severity),
 * for table rows that need to sort/filter by severity without expanding
 * into the detail view. Re-scans on the same interval as the fleet-wide
 * rollup above, for the same "new channel mid-session" tradeoff.
 */
export function useDeviceSeverities(devices: ChildTopic[], anomalyRootPrefix?: string): Record<string, Severity> {
  const [severities, setSeverities] = useState<Record<string, Severity>>({})

  useEffect(() => {
    function refresh() {
      const next: Record<string, Severity> = {}
      devices.forEach(d => {
        next[d.key] = deviceSeverity(d.node, resolveAnomalyRoot(d, anomalyRootPrefix))
      })
      setSeverities(next)
    }

    refresh()
    const interval = setInterval(refresh, 2000)
    return () => clearInterval(interval)
  }, [devices, anomalyRootPrefix])

  return severities
}
