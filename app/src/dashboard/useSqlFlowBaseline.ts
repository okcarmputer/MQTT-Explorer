import * as React from 'react'
import { rendererRpc } from '../eventBus'
import { RpcEvents, FlowMonitorBaselineResponse } from '../../../events/EventsV2'

const POLL_INTERVAL_MS = 5 * 60 * 1000 // baselines refresh at most daily server-side — no need to poll often
const RPC_TIMEOUT_MS = 8000 // degrade to "unavailable" instead of hanging forever if nothing responds

/**
 * Direct SQL Server read for a flow monitor site's baseline, bypassing MQTT
 * entirely — for report-style data that doesn't need live-update semantics.
 * Returns undefined while loading/unavailable (not configured, RPC failed
 * or timed out) — callers should treat that as "no SQL baseline," not an
 * error state. Goes through the shared rendererRpc (app/src/eventBus.ts),
 * which resolves to the IPC-based bus in Electron desktop mode or the
 * socket.io-based bus in browser/server mode — both now have a handler for
 * this RPC (see src/electron.ts and src/server.ts), unlike an earlier
 * version of this hook that only worked in browser mode.
 */
export function useSqlFlowBaseline(siteNumber: string | undefined): FlowMonitorBaselineResponse | undefined {
  const [data, setData] = React.useState<FlowMonitorBaselineResponse | undefined>(undefined)

  React.useEffect(() => {
    if (!siteNumber) {
      setData(undefined)
      return
    }

    let cancelled = false

    async function fetchBaseline() {
      try {
        const response: FlowMonitorBaselineResponse = await rendererRpc.call(
          RpcEvents.getFlowMonitorBaseline,
          { siteNumber },
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

    fetchBaseline()
    const interval = setInterval(fetchBaseline, POLL_INTERVAL_MS)

    return () => {
      cancelled = true
      clearInterval(interval)
    }
  }, [siteNumber])

  return data
}
