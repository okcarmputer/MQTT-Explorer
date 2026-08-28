import * as React from 'react'
import { manholeRecords } from './manholeData'

/**
 * One row of the manhole/flow-meter attribute table. Field names mirror the
 * source table's columns (see manholeData.ts) rather than being renamed to
 * match this app's usual camelCase-from-MQTT convention, since this data
 * will eventually come from a real SQL table with these same columns.
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
 *
 * Currently backed by a static generated table (manholeData.ts); the return
 * shape/signature is deliberately hook-based so swapping this for a live SQL
 * RPC call later (matching useSqlWetWellInfo's pattern) doesn't change any
 * caller.
 */
export function useManholeInfo(candidateKeys: (string | undefined)[]): ManholeRecord | undefined {
  const cacheKey = candidateKeys.join(' ')
  return React.useMemo(() => {
    const candidates = candidateKeys.map(normalize).filter(Boolean)
    return candidates.reduce<ManholeRecord | undefined>(
      (found, key) => found
        ?? manholeRecords.find((r) => normalize(r.flowMeterId) === key)
        ?? manholeRecords.find((r) => normalize(r.installCurrentMhId) === key)
        ?? manholeRecords.find((r) => normalize(r.manholeFacilityId) === key),
      undefined,
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cacheKey])
}
