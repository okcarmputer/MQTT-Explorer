import * as React from 'react'
import { rendererRpc } from '../eventBus'
import { RpcEvents, PumpStationWetWellInfoResponse, PumpStationWetWellInfoBatchResponse } from '../../../events/EventsV2'
import { staticWetWellRecord } from '../../../events/wetWellDimensions'
import { SQL_GIS_POLL_INTERVAL_MS } from './config'

// One request now covers every station on the page, and the first one after
// a restart also pays for opening both SQL connections — so this is far more
// generous than the old per-station 8s, which queued requests routinely hit.
const RPC_TIMEOUT_MS = 30000
// A failed request is retried this soon, instead of waiting a full
// SQL_GIS_POLL_INTERVAL_MS (a day) for the next scheduled refresh.
const RETRY_AFTER_FAILURE_MS = 60 * 1000
// Serials requested within this window (e.g. every row of the station list
// mounting in the same render) are sent together as one batch.
const BATCH_WINDOW_MS = 20

// Module-level so every hook instance on every page shares one cache and
// one in-flight batch — navigating list -> detail -> list doesn't refetch.
const cache = new Map<string, { response: PumpStationWetWellInfoResponse; fetchedAt: number }>()
const listeners = new Map<string, Set<(response: PumpStationWetWellInfoResponse) => void>>()
const inFlight = new Set<string>()
const queued = new Set<string>()
let flushTimer: ReturnType<typeof setTimeout> | undefined

function publish(serial: string, response: PumpStationWetWellInfoResponse) {
  listeners.get(serial)?.forEach(listener => listener(response))
}

async function flush() {
  flushTimer = undefined
  const serials = Array.from(queued)
  queued.clear()
  serials.forEach(serial => inFlight.add(serial))

  try {
    const { results }: PumpStationWetWellInfoBatchResponse = await rendererRpc.call(
      RpcEvents.getPumpStationWetWellInfoBatch,
      { serials },
      RPC_TIMEOUT_MS
    )
    const fetchedAt = Date.now()
    for (const serial of serials) {
      const response = results[serial]
      if (response) {
        cache.set(serial, { response, fetchedAt })
        publish(serial, response)
      }
    }
  } catch (error) {
    // Keep showing the static-table placeholder; retry any serial that's
    // still on screen.
    setTimeout(() => {
      serials.filter(serial => listeners.get(serial)?.size).forEach(request)
    }, RETRY_AFTER_FAILURE_MS)
  } finally {
    serials.forEach(serial => inFlight.delete(serial))
  }
}

function request(serial: string) {
  const cached = cache.get(serial)
  // Half the poll interval, so a hook's own scheduled refresh is never
  // skipped as "still fresh" by a few milliseconds.
  if (inFlight.has(serial) || (cached && Date.now() - cached.fetchedAt < SQL_GIS_POLL_INTERVAL_MS / 2)) {
    return
  }
  queued.add(serial)
  if (!flushTimer) {
    flushTimer = setTimeout(flush, BATCH_WINDOW_MS)
  }
}

// Static dimensions table only, flagged pending — rendered immediately so
// the tank gauge and dimensions never wait on SQL.
function placeholder(serial: string): PumpStationWetWellInfoResponse {
  return { configured: false, serial, wetWell: staticWetWellRecord(serial), pending: true }
}

/**
 * A pump station's wet well record: dimensions from the static table right
 * away (response.pending === true), then the full record — GIS/OPC fields
 * from SQL (see src/sqlReporting.ts's getPumpStationWetWellInfoBatch) — once
 * it arrives. Every mounted instance's serial is fetched in one shared
 * batch and cached for SQL_GIS_POLL_INTERVAL_MS.
 */
export function useSqlWetWellInfo(serial: string | undefined): PumpStationWetWellInfoResponse | undefined {
  const [data, setData] = React.useState<PumpStationWetWellInfoResponse | undefined>(() =>
    serial ? cache.get(serial)?.response ?? placeholder(serial) : undefined
  )

  React.useEffect(() => {
    if (!serial) {
      setData(undefined)
      return
    }

    setData(cache.get(serial)?.response ?? placeholder(serial))

    let serialListeners = listeners.get(serial)
    if (!serialListeners) {
      serialListeners = new Set()
      listeners.set(serial, serialListeners)
    }
    serialListeners.add(setData)

    request(serial)
    const interval = setInterval(() => request(serial), SQL_GIS_POLL_INTERVAL_MS)

    return () => {
      clearInterval(interval)
      serialListeners!.delete(setData)
    }
  }, [serial])

  return data
}
