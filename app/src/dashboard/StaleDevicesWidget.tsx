import * as React from 'react'
import { staleDeviceThresholdMinutes } from './config'
import StatusWidget from './StatusWidget'

interface Props {
  // Flow + pump station devices combined — "Not Reporting" is a fleet-wide
  // count, not split by device type (the Flow Monitors/Pump Stations tabs
  // are where you'd drill into which type).
  devices: { key: string; lastUpdate: number }[]
}

/**
 * Count of devices whose last message is older than the configurable
 * threshold (config.ts's staleDeviceThresholdMinutes, default 30min) — or
 * that have never reported at all (lastUpdate falsy/0).
 *
 * Deliberately labeled "Not Reporting", not "Offline": retained MQTT means
 * the broker keeps serving the last value forever whether or not the
 * device is actually still alive, so an old lastUpdate is at least as
 * likely to mean "nothing upstream has re-published in a while" as
 * "device is down" — this widget can't and doesn't distinguish those, so
 * the label doesn't claim to.
 */
export default function StaleDevicesWidget({ devices }: Props) {
  // Re-check periodically even if `devices` itself doesn't change, since
  // "stale" is a function of wall-clock time passing, not just new data.
  const [, setTick] = React.useState(0)
  React.useEffect(() => {
    const interval = setInterval(() => setTick(t => t + 1), 30_000)
    return () => clearInterval(interval)
  }, [])

  const thresholdMs = staleDeviceThresholdMinutes * 60_000
  const now = Date.now()
  const staleCount = devices.filter(d => !d.lastUpdate || now - d.lastUpdate > thresholdMs).length

  return (
    <StatusWidget
      label="Not Reporting"
      value={staleCount}
      subtitle={`no message in over ${staleDeviceThresholdMinutes}min`}
      color={staleCount > 0 ? 'var(--cmom-status-warning)' : undefined}
      emphasis={staleCount > 0}
    />
  )
}
