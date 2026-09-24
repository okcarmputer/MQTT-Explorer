import * as React from 'react'
import { rendererRpc } from '../eventBus'
import { RpcEvents, FlowMonitorDiurnalAnomaliesResponse } from '../../../events/EventsV2'
import { SQL_POLL_INTERVAL_MS } from './config'

const RPC_TIMEOUT_MS = 8000 // degrade to "unavailable" instead of hanging forever if nothing responds

/**
 * Direct SQL Server read of diurnal_detector.py's own anomaly history
 * (dbo.Flow_Monitor_Diurnal_Anomalies, dev server today — see
 * src/sqlReporting.ts's isDiurnalReportingConfigured) for one site over the
 * last `hours`. Separate table/pool/detector from useSqlFlowBaseline's
 * comparison_results (the monthly/CHA detector) — a site can have rows in
 * both, they're not duplicates of each other. Returns undefined while
 * loading/unavailable (not configured, RPC failed or timed out), same
 * "no SQL history" contract as every other useSql* hook.
 */
export function useSqlFlowDiurnalAnomalies(siteNumber: string | undefined, hours: number): FlowMonitorDiurnalAnomaliesResponse | undefined {
  const [data, setData] = React.useState<FlowMonitorDiurnalAnomaliesResponse | undefined>(undefined)

  React.useEffect(() => {
    if (!siteNumber) {
      setData(undefined)
      return
    }

    let cancelled = false

    async function fetchRows() {
      try {
        const response: FlowMonitorDiurnalAnomaliesResponse = await rendererRpc.call(
          RpcEvents.getFlowMonitorDiurnalAnomalies,
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

    fetchRows()
    const interval = setInterval(fetchRows, SQL_POLL_INTERVAL_MS)

    return () => {
      cancelled = true
      clearInterval(interval)
    }
  }, [siteNumber, hours])

  return data
}
