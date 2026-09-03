import * as React from 'react'
import { rendererRpc } from '../eventBus'
import { RpcEvents, FlowMonitorPortInfoResponse, FlowMonitorPortDimension } from '../../../events/EventsV2'
import { SQL_POLL_INTERVAL_MS } from './config'

/**
 * Shape + dimension (e.g. "Diameter: 20.88 in") as display rows — shared by
 * the Flow Monitors board's Attributes dropdown and FlowMonitorDetail's Site
 * Attributes card, so the two never format this differently. Dimension
 * labels come straight from DimenstionName rather than being hard-coded to
 * "Diameter", since a non-circular shape could carry a different dimension
 * (Width/Height, etc) — this data already reads "Diameter" for circular
 * sites, but the label shouldn't lie for shapes where it isn't.
 */
export function formatPortAttributes(ports: FlowMonitorPortDimension[]): { label: string; value: string }[] {
  const multiplePorts = ports.length > 1
  const rows: { label: string; value: string }[] = []

  ports.forEach(port => {
    const prefix = multiplePorts && port.portId !== null ? `Port ${port.portId} ` : ''
    if (port.shape) {
      rows.push({ label: `${prefix}Shape`, value: port.shape })
    }
    if (port.dimensionName && port.dimensionValue !== null) {
      const unit = port.dimensionUnits ? ` ${port.dimensionUnits}` : ''
      rows.push({ label: `${prefix}${port.dimensionName}`, value: `${port.dimensionValue}${unit}` })
    }
  })

  return rows
}

const RPC_TIMEOUT_MS = 8000 // degrade to "unavailable" instead of hanging forever if nothing responds

/**
 * Direct SQL Server read of a flow monitor site's port/pipe dimensions
 * (dbo.hach_port_info: shape + the Diameter-or-similar dimension used to
 * convert level to flow) — physical site metadata, not a live MQTT value,
 * same "no error state, undefined while loading/unavailable" contract as
 * useSqlFlowBaseline/useSqlFlowHistory. Goes through the shared rendererRpc
 * (works in both Electron desktop mode and browser/server mode).
 */
export function useSqlFlowPortInfo(siteNumber: string | undefined): FlowMonitorPortInfoResponse | undefined {
  const [data, setData] = React.useState<FlowMonitorPortInfoResponse | undefined>(undefined)

  React.useEffect(() => {
    if (!siteNumber) {
      setData(undefined)
      return
    }

    let cancelled = false

    async function fetchPortInfo() {
      try {
        const response: FlowMonitorPortInfoResponse = await rendererRpc.call(
          RpcEvents.getFlowMonitorPortInfo,
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

    fetchPortInfo()
    const interval = setInterval(fetchPortInfo, SQL_POLL_INTERVAL_MS)

    return () => {
      cancelled = true
      clearInterval(interval)
    }
  }, [siteNumber])

  return data
}
