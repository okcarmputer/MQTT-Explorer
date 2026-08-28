import * as React from 'react'
import * as q from '../../../backend/src/Model'
import { usePollingToFetchTreeNode } from '../components/helper/usePollingToFetchTreeNode'

const MANHOLE_INFO_PATH = 'flow_monitors/manhole_info'

/**
 * One row of the manhole/flow-meter attribute table. Field names mirror the
 * source table's columns rather than being renamed to match this app's usual
 * camelCase-from-MQTT convention, since this data originates from a real SQL
 * table with these same columns (see the anomaly-detection repo's
 * flow_monitors/manhole_data.json — that repo owns the values; edit there).
 */
export interface ManholeRecord {
  manholeObjectId: number | null
  manholeFacilityId: string | null
  manholeLocation: string | null
  manholeInstallDate: string | null
  rimElevation: number | null
  manholeAccessDiameter: number | null
  manholeDepthFt: number | null
  manholeStatus: string | null
  manholeX: number | null
  manholeY: number | null
  flowMeterX: number | null
  flowMeterY: number | null
  comment: string | null
  flowMeterObjectId: number | null
  flowMeterId: string | null
  wrrfBasin: string | null
  installMhId: string | null
  installCurrentMhId: string | null
  flowMeterInstallDate: string | null
  flowMeterStatus: string | null
  diameter: number | null
  flowMeterLocationDesc: string | null
  serialNum: string | null
  phase: string | null
}

function normalize(v: string | null | undefined): string {
  return (v ?? '').trim().toLowerCase()
}

function readManholeRecord(node: q.TreeNode<any>): ManholeRecord | undefined {
  const payload = node.message?.payload?.toUnicodeString()
  if (!payload) {
    return undefined
  }
  try {
    return JSON.parse(payload) as ManholeRecord
  } catch {
    return undefined
  }
}

/**
 * All published manhole/flow-meter records, live — one retained child per
 * flowMeterId under flow_monitors/manhole_info, published by the
 * anomaly-detection repo's flow_monitors/publish_manhole_info.py (see that
 * repo's README). Re-renders on any child arriving/updating.
 */
function useManholeRecords(tree: q.Tree<any> | undefined): ManholeRecord[] {
  const parentNode = usePollingToFetchTreeNode(tree, MANHOLE_INFO_PATH)
  const [, setTick] = React.useState(0)

  React.useEffect(() => {
    if (!parentNode) {
      return
    }
    const rerender = () => setTick(t => t + 1)
    parentNode.onEdgesChange.subscribe(rerender)
    const leafUnsubs = parentNode.edgeArray.map(edge => {
      edge.target.onMessage.subscribe(rerender)
      return () => edge.target.onMessage.unsubscribe(rerender)
    })
    return () => {
      parentNode.onEdgesChange.unsubscribe(rerender)
      leafUnsubs.forEach(unsub => unsub())
    }
  }, [parentNode])

  if (!parentNode) {
    return []
  }
  return parentNode.edgeArray.map(edge => readManholeRecord(edge.target)).filter((r): r is ManholeRecord => Boolean(r))
}

/**
 * Looks up a flow monitor site's manhole/flow-meter record. The site's MQTT
 * key (deviceKey, e.g. "15223") is an internal site ID this table has no
 * concept of — the field that actually lines up with this table's
 * flowmeterid column is the site_info payload's own "NAME" field (e.g.
 * "FM250-16"), which is why this takes a list of *candidate* keys to try
 * (site name first, falling back to deviceKey) rather than one fixed key.
 *
 * Source data quality on flowmeterid is also inconsistent (e.g. "FM100-115"
 * vs "24" vs "MH-1" for what should be the same site), so each candidate is
 * additionally tried against installCurrentMhId/manholeFacilityId (both
 * consistently mirror the site number format, e.g. "100-115") before moving
 * to the next candidate — every (candidate, field) combination is checked
 * before giving up, rather than surfacing nothing at all.
 */
export function useManholeInfo(tree: q.Tree<any> | undefined, candidateKeys: (string | undefined)[]): ManholeRecord | undefined {
  const records = useManholeRecords(tree)
  const cacheKey = candidateKeys.join(' ')
  return React.useMemo(() => {
    const candidates = candidateKeys.map(normalize).filter(Boolean)
    return candidates.reduce<ManholeRecord | undefined>(
      (found, key) => found
        ?? records.find((r) => normalize(r.flowMeterId) === key)
        ?? records.find((r) => normalize(r.installCurrentMhId) === key)
        ?? records.find((r) => normalize(r.manholeFacilityId) === key),
      undefined,
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cacheKey, records])
}
