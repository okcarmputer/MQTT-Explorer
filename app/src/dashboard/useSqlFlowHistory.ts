import * as React from 'react'
import { RpcEvents, FlowMonitorHistoryResponse } from '../../../events/EventsV2'

// Same conditional-require pattern as useSqlFlowBaseline.ts — keeps
// socket.io-client out of the test environment and degrades to
// "unavailable" in Electron desktop mode (SQL reporting is server-mode only).
let backendRpc: any
try {
  const browserEventBus = require('../browserEventBus')
  backendRpc = browserEventBus.backendRpc
} catch (e) {
  backendRpc = undefined
}

const POLL_INTERVAL_MS = 5 * 60 * 1000

/**
 * Direct SQL Server read of a flow monitor site's comparison_results history
 * (observed values + CHA baseline mean/SD, one row per detector cycle) over
 * the last `hours` — for the drill-down trend chart. Returns undefined while
 * loading/unavailable, same "no error state" contract as useSqlFlowBaseline.
 */
export function useSqlFlowHistory(siteNumber: string | undefined, hours: number): FlowMonitorHistoryResponse | undefined {
  const [data, setData] = React.useState<FlowMonitorHistoryResponse | undefined>(undefined)

  React.useEffect(() => {
    if (!siteNumber || !backendRpc) {
      setData(undefined)
      return
    }

    let cancelled = false

    async function fetchHistory() {
      try {
        const response: FlowMonitorHistoryResponse = await backendRpc.call(RpcEvents.getFlowMonitorHistory, {
          siteNumber,
          hours,
        })
        if (!cancelled) {
          setData(response)
        }
      } catch (error) {
        if (!cancelled) {
          setData(undefined)
        }
      }
    }

    fetchHistory()
    const interval = setInterval(fetchHistory, POLL_INTERVAL_MS)

    return () => {
      cancelled = true
      clearInterval(interval)
    }
  }, [siteNumber, hours])

  return data
}
