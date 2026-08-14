import * as React from 'react'
import { Severity, severityOrder } from './config'
import { humanizeKey, SiteInfo } from './useFlowSiteInfo'
import { formatPortAttributes, useSqlFlowPortInfo } from './useSqlFlowPortInfo'
import DeviceCard from './DeviceCard'
import { ChannelReading } from './useFlowMeasurements'

export interface FlowMonitorRow {
  key: string
  severity: Severity
  lastUpdate: number
  readings: Partial<Record<string, ChannelReading>>
  siteInfo: SiteInfo
}

interface Props {
  devices: FlowMonitorRow[]
  linkTo: (key: string) => string
}

interface RowWithFlag extends FlowMonitorRow {
  hasMeasurements: boolean
}

/**
 * One card, as its own component (not inlined in the .map below) because it
 * calls useSqlFlowPortInfo per site — a hook can't be called conditionally
 * inside a loop, but it's perfectly fine as one call per mounted component
 * instance, one instance per card.
 */
function FlowMonitorCard({ row, linkTo }: { row: RowWithFlag; linkTo: string }) {
  const portInfo = useSqlFlowPortInfo(row.key)
  const attributes = React.useMemo(
    () => [
      ...Object.entries(row.siteInfo).map(([k, v]) => ({ label: humanizeKey(k), value: v })),
      ...formatPortAttributes(portInfo?.ports ?? []),
    ],
    [row.siteInfo, portInfo]
  )
  const details = (['level', 'velocity', 'flow'] as const)
    .filter(k => row.readings[k])
    .map(k => ({ label: `${row.readings[k]!.label} (${row.readings[k]!.unit})`, value: row.readings[k]!.value }))

  return (
    <DeviceCard
      deviceKey={row.key}
      deviceType="Flow Monitor"
      severity={row.severity}
      lastUpdate={row.lastUpdate}
      details={details}
      attributes={attributes}
      linkTo={linkTo}
      stale={!row.hasMeasurements}
    />
  )
}

/**
 * Flow Monitors view: a card-grid dashboard (not an HTML table) — each site
 * is a DeviceCard showing its live Level/Velocity/Flow readings (unit in
 * the label, not appended to every number) plus a collapsed "Attributes"
 * dropdown for whatever the site's site_info topic actually publishes
 * (name, location, ...) — collapsed by default so it doesn't crowd out the
 * readings; the text filter still searches those fields even while hidden.
 * A site with no readings at all renders as "NOT UPDATED" (see DeviceCard's
 * `stale` prop) rather than a severity, and can be hidden via the toggle
 * below — absence of measurements means the site hasn't updated, not "OK".
 */
export default function FlowMonitorBoard({ devices, linkTo }: Props) {
  const [textFilter, setTextFilter] = React.useState('')
  const [severityFilter, setSeverityFilter] = React.useState<Severity | 'All'>('All')
  const [hideStale, setHideStale] = React.useState(false)

  const rows = React.useMemo(
    () =>
      devices.map(d => ({
        ...d,
        hasMeasurements: Object.keys(d.readings).length > 0,
      })),
    [devices]
  )

  const filtered = React.useMemo(
    () =>
      rows.filter(row => {
        if (hideStale && !row.hasMeasurements) return false
        if (severityFilter !== 'All' && (!row.hasMeasurements || row.severity !== severityFilter)) return false
        if (textFilter) {
          const haystack = [row.key, ...Object.values(row.siteInfo)].join(' ').toLowerCase()
          if (!haystack.includes(textFilter.toLowerCase())) return false
        }
        return true
      }),
    [rows, hideStale, severityFilter, textFilter]
  )

  const staleCount = rows.length - rows.filter(r => r.hasMeasurements).length

  return (
    <div style={{ padding: 'var(--cmom-space-4)', height: '100%', overflow: 'auto', boxSizing: 'border-box' }}>
      <div style={{ display: 'flex', gap: 'var(--cmom-space-3)', marginBottom: 'var(--cmom-space-4)', flexWrap: 'wrap', alignItems: 'center' }}>
        <input
          placeholder="Filter by site ID, name, location…"
          value={textFilter}
          onChange={e => setTextFilter(e.target.value)}
          style={{ padding: 6, width: 260, borderRadius: 'var(--cmom-radius-sm)', border: '1px solid var(--cmom-border-strong)' }}
        />
        <select value={severityFilter} onChange={e => setSeverityFilter(e.target.value as Severity | 'All')}>
          <option value="All">All severities</option>
          {severityOrder.map(s => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <label className="cmom-label" style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
          <input type="checkbox" checked={hideStale} onChange={e => setHideStale(e.target.checked)} />
          Hide sites with no measurements ({staleCount})
        </label>
        <span className="cmom-label" style={{ marginLeft: 'auto' }}>
          {filtered.length} of {rows.length} sites
        </span>
      </div>

      {rows.length === 0 ? (
        <div style={{ opacity: 0.7 }}>No devices seen on this topic prefix yet.</div>
      ) : filtered.length === 0 ? (
        <div style={{ opacity: 0.7 }}>No sites match the current filters.</div>
      ) : (
        <div className="cmom-device-grid">
          {filtered.map(row => (
            <FlowMonitorCard key={row.key} row={row} linkTo={linkTo(row.key)} />
          ))}
        </div>
      )}
    </div>
  )
}
