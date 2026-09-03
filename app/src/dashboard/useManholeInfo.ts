import * as React from 'react'
import { rendererRpc } from '../eventBus'
import { RpcEvents, ManholeRecord } from '../../../events/EventsV2'
import { SQL_GIS_POLL_INTERVAL_MS } from './config'

export type { ManholeRecord }

const RPC_TIMEOUT_MS = 8000 // degrade to "unavailable" instead of hanging forever if nothing responds

function normalize(v: string | null | undefined): string {
  return (v ?? '').trim().toLowerCase()
}

/**
 * Direct SQL Server read of every REWAFLOWMETER/SMANHOLE record (see
 * src/sqlReporting.ts's getManholeInfo) — replaces the earlier MQTT-published
 * flow_monitors/manhole_info topic tree as this app's source for manhole/flow
 * meter GIS attributes. Bulk fetch, polled daily (SQL_GIS_POLL_INTERVAL_MS —
 * this is asset-management data, not live telemetry), same "undefined while
 * loading/unavailable, not an error" contract as the other SQL-backed hooks.
 */
function useManholeRecords(): ManholeRecord[] | undefined {
  const [records, setRecords] = React.useState<ManholeRecord[] | undefined>(undefined)

  React.useEffect(() => {
    let cancelled = false

    async function fetchRecords() {
      try {
        const response = await rendererRpc.call(RpcEvents.getManholeInfo, undefined, RPC_TIMEOUT_MS)
        if (!cancelled) {
          setRecords(response.records)
        }
      } catch (error) {
        if (!cancelled) {
          setRecords(undefined)
        }
      }
    }

    fetchRecords()
    const interval = setInterval(fetchRecords, SQL_GIS_POLL_INTERVAL_MS)

    return () => {
      cancelled = true
      clearInterval(interval)
    }
  }, [])

  return records
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
export function useManholeInfo(candidateKeys: (string | undefined)[]): ManholeRecord | undefined {
  const records = useManholeRecords()
  const cacheKey = candidateKeys.join(' ')
  return React.useMemo(() => {
    if (!records) return undefined
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
