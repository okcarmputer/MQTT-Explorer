import * as React from 'react'
import { rendererRpc } from '../eventBus'
import { RpcEvents, PumpStationWetWellInfoResponse } from '../../../events/EventsV2'

const POLL_INTERVAL_MS = 5 * 60 * 1000 // wet well dimensions don't change — polling is just to pick up corrections
const RPC_TIMEOUT_MS = 8000 // degrade to "unavailable" instead of hanging forever if nothing responds

/**
 * Direct SQL Server read of a pump station's wet well dimensions — same
 * "no error state, undefined while loading/unavailable" contract as
 * useSqlFlowPortInfo, reading from a table the user is creating separately
 * (see src/sqlReporting.ts's getPumpStationWetWellInfo). Until that table
 * exists this just stays "unavailable" rather than erroring.
 */
export function useSqlWetWellInfo(serial: string | undefined): PumpStationWetWellInfoResponse | undefined {
  const [data, setData] = React.useState<PumpStationWetWellInfoResponse | undefined>(undefined)

  React.useEffect(() => {
    if (!serial) {
      setData(undefined)
      return
    }

    let cancelled = false

    async function fetchWetWellInfo() {
      try {
        const response: PumpStationWetWellInfoResponse = await rendererRpc.call(
          RpcEvents.getPumpStationWetWellInfo,
          { serial },
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

    fetchWetWellInfo()
    const interval = setInterval(fetchWetWellInfo, POLL_INTERVAL_MS)

    return () => {
      cancelled = true
      clearInterval(interval)
    }
  }, [serial])

  return data
}
