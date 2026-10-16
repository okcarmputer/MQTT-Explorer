import * as React from 'react'
import * as q from '../../../backend/src/Model'
import { usePollingToFetchTreeNode } from '../components/helper/usePollingToFetchTreeNode'
import { normalizeToUtcIfNoOffset } from '../helper/extractPayloadTimestamp'
import { dashboardConfig } from './config'
import { useTopicMessage } from './useTopicChildren'

type Tone = 'online' | 'warning' | 'offline'

const TONE_COLOR: Record<Tone, string> = {
  online: 'var(--cmom-status-online)',
  warning: 'var(--cmom-status-warning)',
  offline: 'var(--cmom-status-offline)',
}

// The heartbeat's own *_utc fields are bare ISO strings (no offset).
function parseUtc(value: unknown): Date | undefined {
  if (typeof value !== 'string') {
    return undefined
  }
  const date = new Date(normalizeToUtcIfNoOffset(value))
  return Number.isNaN(date.getTime()) ? undefined : date
}

function formatAge(ms: number): string {
  const minutes = Math.max(0, Math.round(ms / 60000))
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes} min ago`
  const hours = Math.floor(minutes / 60)
  return hours < 48 ? `${hours} h ${minutes % 60} min ago` : `${Math.floor(hours / 24)} days ago`
}

/**
 * Flow monitor poller heartbeat (flow_monitors/poller_status, published by
 * fm_mqtt.py): state running / idle / aborted / error, plus when it was last
 * refreshed. Lets "no new readings" be told apart from "the poller is down"
 * without leaving the Flow Monitors tab. Renders nothing until the topic has
 * been seen.
 */
export default function PollerStatus({ tree }: { tree?: q.Tree<any> }) {
  const node = usePollingToFetchTreeNode(tree, dashboardConfig.flowMonitors.pollerStatusPath)
  const message = useTopicMessage(node)
  // Age is relative to now, so re-evaluate between heartbeats too.
  const [, setTick] = React.useState(0)
  React.useEffect(() => {
    const interval = setInterval(() => setTick(t => t + 1), 30000)
    return () => clearInterval(interval)
  }, [])

  const payload = message?.payload?.toUnicodeString()
  if (!payload) {
    return null
  }

  let status: Record<string, any>
  try {
    status = JSON.parse(payload)
  } catch {
    return null
  }
  if (!status || typeof status !== 'object') {
    return null
  }

  const state = typeof status.state === 'string' ? status.state : 'unknown'
  const updated = parseUtc(status.updated_utc)
  const ageMs = updated ? Date.now() - updated.getTime() : undefined
  const stuck = ageMs !== undefined && ageMs > dashboardConfig.flowMonitors.pollerStuckAfterMinutes * 60000

  let tone: Tone = 'online'
  if (stuck || state === 'error') {
    tone = 'offline'
  } else if (state !== 'running' && state !== 'idle') {
    tone = 'warning'
  }

  const nextDue = parseUtc(status.next_cycle_due_utc)
  const lastCycle = status.last_completed_cycle
  const lastFinished = parseUtc(lastCycle?.finished_utc)
  const details = [
    status.cycle !== undefined ? `Cycle ${status.cycle}` : undefined,
    status.reason ? `Reason: ${status.reason}` : undefined,
    status.retry_in_s !== undefined ? `Retrying in ${status.retry_in_s} s` : undefined,
    nextDue ? `Next cycle due ${nextDue.toLocaleString()}` : undefined,
    lastFinished ? `Last completed cycle finished ${lastFinished.toLocaleString()}` : 'No completed cycle since the poller started',
    updated ? `Heartbeat ${updated.toLocaleString()}` : undefined,
  ].filter(Boolean)

  return (
    <span
      title={details.join('\n')}
      style={{ marginLeft: 'var(--cmom-space-2)', display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12 }}
    >
      <span className="cmom-status-dot" style={{ background: TONE_COLOR[tone] }} />
      <span className="cmom-label">Poller</span>
      <span style={{ color: TONE_COLOR[tone], fontWeight: 600 }}>{stuck ? 'stuck' : state}</span>
      {status.reason && !stuck && <span style={{ opacity: 0.8 }}>— {String(status.reason)}</span>}
      {ageMs !== undefined && <span style={{ opacity: 0.7 }}>· updated {formatAge(ageMs)}</span>}
    </span>
  )
}
