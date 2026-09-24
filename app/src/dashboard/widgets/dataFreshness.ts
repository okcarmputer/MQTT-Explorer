import { staleDeviceThresholdMinutes } from '../config'

export type FreshnessState = 'LIVE' | 'STALE' | 'OFFLINE'

export interface FreshnessThresholds {
  // At or below this age, LIVE.
  liveThresholdMs: number
  // Above liveThresholdMs but at or below this age, STALE; above it, OFFLINE
  // ("worse than stale").
  offlineThresholdMs: number
}

// Pump stations' default — a message younger than 1 minute reads as "live"
// outright; older than that but still inside the Overview's own
// staleDeviceThresholdMinutes window reads as "stale" (still arriving, just
// not on every cycle); older than that (or no message at all) reads as
// "offline". Built on the same staleness threshold Overview's "Not
// Reporting" widget already uses so the two views can't disagree about what
// counts as stale.
const DEFAULT_THRESHOLDS: FreshnessThresholds = {
  liveThresholdMs: 60_000,
  offlineThresholdMs: staleDeviceThresholdMinutes * 60_000,
}

// Flow monitors report far less often than pump station SCADA tags — the
// 1-minute/30-minute pump default read every flow monitor as permanently
// "stale" even when it's reporting completely normally. Under an hour is
// live, 1-3 hours is stale, past 3 hours is offline ("worse than stale").
export const FLOW_MONITOR_FRESHNESS_THRESHOLDS: FreshnessThresholds = {
  liveThresholdMs: 60 * 60_000,
  offlineThresholdMs: 3 * 60 * 60_000,
}

export function freshnessFromLastUpdate(
  lastUpdate: number | undefined,
  thresholds: FreshnessThresholds = DEFAULT_THRESHOLDS
): FreshnessState {
  if (!lastUpdate) return 'OFFLINE'
  const age = Date.now() - lastUpdate
  if (age <= thresholds.liveThresholdMs) return 'LIVE'
  if (age <= thresholds.offlineThresholdMs) return 'STALE'
  return 'OFFLINE'
}

export const freshnessColors: Record<FreshnessState, string> = {
  LIVE: '#4caf50',
  STALE: '#ffc107',
  OFFLINE: '#9e9e9e',
}

function formatAge(ms: number): string {
  const seconds = Math.round(ms / 1000)
  if (seconds < 60) return `${seconds}s ago`
  const minutes = Math.round(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.round(minutes / 60)
  return `${hours}h ago`
}

export function freshnessText(lastUpdate: number | undefined, thresholds: FreshnessThresholds = DEFAULT_THRESHOLDS): string {
  const state = freshnessFromLastUpdate(lastUpdate, thresholds)
  if (!lastUpdate) return 'OFFLINE'
  return `${state} · ${formatAge(Date.now() - lastUpdate)}`
}
