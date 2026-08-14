import { useEffect, useState } from 'react'
import * as q from '../../../backend/src/Model'
import { ChildTopic } from './useTopicChildren'

export type SiteInfo = Record<string, string>

/**
 * Whatever fields a site's flow_monitors/{site}/site_info payload actually
 * carries (name, location, lat/long, etc), read generically — the field
 * names/casing aren't documented anywhere in this repo, so this doesn't
 * guess at a schema. Values are stringified for display; nested
 * objects/arrays are skipped (nothing here expects them).
 */
function readSiteInfo(node: q.TreeNode<any> | undefined): SiteInfo {
  const payload = node?.message?.payload?.toUnicodeString()
  if (!payload) {
    return {}
  }

  try {
    const json = JSON.parse(payload)
    const out: SiteInfo = {}
    Object.keys(json).forEach(key => {
      const value = json[key]
      if (value !== null && typeof value !== 'object') {
        out[key] = String(value)
      }
    })
    return out
  } catch {
    return {}
  }
}

/**
 * Turns a raw JSON key (whatever casing/convention the publisher used —
 * "siteName", "site_name", "SITE_NAME", ...) into a display label, since
 * the site_info schema isn't documented anywhere in this repo and shouldn't
 * be guessed at field-by-field.
 */
export function humanizeKey(key: string): string {
  const spaced = key
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .trim()
  return spaced
    .split(' ')
    .filter(Boolean)
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
}

/**
 * Per-site metadata from the retained .../site_info topic, live-updating.
 * Used to surface a site's other published attributes (name, location, ...)
 * next to its measurements, without hard-coding which fields exist.
 */
export function useFlowSiteInfo(devices: ChildTopic[]): Record<string, SiteInfo> {
  const [, setTick] = useState(0)

  useEffect(() => {
    const rerender = () => setTick(t => t + 1)
    const unsubscribers: Array<() => void> = []

    devices.forEach(d => {
      const infoNode = d.node.edges['site_info']?.target
      if (infoNode) {
        infoNode.onMessage.subscribe(rerender)
        unsubscribers.push(() => infoNode.onMessage.unsubscribe(rerender))
      }
    })

    return () => unsubscribers.forEach(unsub => unsub())
  }, [devices])

  const out: Record<string, SiteInfo> = {}
  devices.forEach(d => {
    out[d.key] = readSiteInfo(d.node.edges['site_info']?.target)
  })
  return out
}
