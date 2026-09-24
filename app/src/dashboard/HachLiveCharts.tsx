import * as React from 'react'
import { HACH_LIVE_URL } from './config'
import './dashboard.css'

// While the server is unreachable, how often to re-check it so the view
// recovers on its own once someone starts run_live_dashboard.ps1.
const RETRY_INTERVAL_MS = 15 * 1000
const HEALTH_TIMEOUT_MS = 5 * 1000

type Status = 'checking' | 'up' | 'down'

interface Props {
  // Raw Hach site number (the flow_monitors/prod/{site_number} segment).
  // Omitted = the server's own all-sites view, with its site list.
  siteNumber?: string
  // Starting range in days (1/3/7/365). The embedded page's own range
  // control takes over after that; the server defaults to 7.
  days?: 1 | 3 | 7 | 365
}

/**
 * Embeds the Anomaly_Detection repo's Hach live-charts page (one row per
 * measure — Power/Level/Velocity/Flow — with a shared range control and
 * synced zoom). Presentation only: the data, refresh, stale-handling and
 * chart behavior all live in hach_live_dashboard.py, not here.
 *
 * Pings /api/health before mounting the iframe so an unreachable server shows
 * an explanatory message instead of a blank frame. `no-cors` because the Dash
 * server sends no CORS headers — an opaque response still proves it's up,
 * while a refused connection rejects the fetch.
 *
 * Only ever mounted while visible (FlowMonitors unmounts its routes when the
 * tab isn't active), so Plotly inside the frame measures real dimensions.
 */
export default function HachLiveCharts({ siteNumber, days }: Props) {
  const [status, setStatus] = React.useState<Status>('checking')

  React.useEffect(() => {
    let cancelled = false
    let retryTimer: ReturnType<typeof setTimeout> | undefined

    const check = async () => {
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), HEALTH_TIMEOUT_MS)
      try {
        await fetch(`${HACH_LIVE_URL}/api/health`, { mode: 'no-cors', cache: 'no-store', signal: controller.signal })
        if (!cancelled) setStatus('up')
      } catch {
        if (cancelled) return
        setStatus('down')
        retryTimer = setTimeout(check, RETRY_INTERVAL_MS)
      } finally {
        clearTimeout(timeout)
      }
    }

    check()
    return () => {
      cancelled = true
      if (retryTimer) clearTimeout(retryTimer)
    }
  }, [])

  if (status === 'checking') {
    return <div className="cmom-hach-live__notice">Connecting to the Hach live charts server at {HACH_LIVE_URL}…</div>
  }

  if (status === 'down') {
    return (
      <div className="cmom-hach-live__notice cmom-hach-live__notice--down" role="status">
        <strong>Can&apos;t reach the Hach live charts server at {HACH_LIVE_URL}.</strong>
        <div>
          Start it from the Anomaly_Detection repo with{' '}
          <code>flow_monitors\live_dashboard\run_live_dashboard.ps1</code> (add <code>-Demo</code> for synthetic data).
          This view retries every {RETRY_INTERVAL_MS / 1000} s.
        </div>
        <div className="cmom-hach-live__hint">
          To point at a different server, set <code>HACH_LIVE_URL</code> and rebuild.
        </div>
      </div>
    )
  }

  const params = new URLSearchParams()
  if (siteNumber) {
    params.set('site', siteNumber)
    params.set('embed', '1')
  }
  if (days) params.set('range', String(days))
  const query = params.toString()
  const src = `${HACH_LIVE_URL}/${query ? `?${query}` : ''}`

  return (
    <iframe
      // Keyed on src so switching sites loads a fresh page rather than
      // relying on the embedded app to react to a changed URL.
      key={src}
      className="cmom-hach-live__frame"
      src={src}
      title={siteNumber ? `Hach live charts for site ${siteNumber}` : 'Hach live charts'}
    />
  )
}
