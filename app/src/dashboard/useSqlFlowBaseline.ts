import * as React from 'react'
import { RpcEvents, FlowMonitorBaselineResponse } from '../../../events/EventsV2'

// Import backendRpc conditionally — same pattern as llmService.ts — so this
// file doesn't pull socket.io-client into the test environment, and so it
// degrades to "unavailable" in Electron desktop mode, where this RPC has no
// handler registered (SQL reporting is server-mode only, same as llmChat —
// a desktop client shouldn't hold prod DB credentials).
let backendRpc: any
try {
  const browserEventBus = require('../browserEventBus')
  backendRpc = browserEventBus.backendRpc
} catch (e) {
  backendRpc = undefined
}

const POLL_INTERVAL_MS = 5 * 60 * 1000 // baselines refresh at most daily server-side — no need to poll often

/**
 * Direct SQL Server read for a flow monitor site's baseline, bypassing MQTT
 * entirely — for report-style data that doesn't need live-update semantics.
 * Returns undefined while loading/unavailable (not configured, RPC failed,
 * or running in a mode with no SQL RPC handler) — callers should treat that
 * as "no SQL baseline," not an error state.
 */
export function useSqlFlowBaseline(siteNumber: string | undefined): FlowMonitorBaselineResponse | undefined {
  const [data, setData] = React.useState<FlowMonitorBaselineResponse | undefined>(undefined)

  React.useEffect(() => {
    if (!siteNumber || !backendRpc) {
      setData(undefined)
      return
    }

    let cancelled = false

    async function fetchBaseline() {
      try {
        const response: FlowMonitorBaselineResponse = await backendRpc.call(RpcEvents.getFlowMonitorBaseline, {
          siteNumber,
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

    fetchBaseline()
    const interval = setInterval(fetchBaseline, POLL_INTERVAL_MS)

    return () => {
      cancelled = true
      clearInterval(interval)
    }
  }, [siteNumber])

  return data
}
