import * as React from 'react'
import { rendererRpc } from '../eventBus'
import { RpcEvents, FlowMonitorHistoryResponse } from '../../../events/EventsV2'

const POLL_INTERVAL_MS = 5 * 60 * 1000
const RPC_TIMEOUT_MS = 8000 // degrade to "unavailable" instead of hanging forever if nothing responds

/**
 * Direct SQL Server read of a flow monitor site's comparison_results history
 * (observed values + CHA baseline mean/SD, one row per detector cycle) over
 * the last `hours` — for the drill-down trend chart. Returns undefined while
 * loading/unavailable, same "no error state" contract as useSqlFlowBaseline.
 * Goes through the shared rendererRpc (works in both Electron desktop mode
 * and browser/server mode — see useSqlFlowBaseline.ts for why this replaced
 * a browser-only conditional require).
 */
export function useSqlFlowHistory(siteNumber: string | undefined, hours: number): FlowMonitorHistoryResponse | undefined {
  const [data, setData] = React.useState<FlowMonitorHistoryResponse | undefined>(undefined)

  React.useEffect(() => {
    if (!siteNumber) {
      setData(undefined)
      return
    }

    let cancelled = false

    async function fetchHistory() {
      try {
        const response: FlowMonitorHistoryResponse = await rendererRpc.call(
          RpcEvents.getFlowMonitorHistory,
          { siteNumber, hours },
          RPC_TIMEOUT_MS
        )
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
