import * as React from 'react'
import { Severity, severityOrder } from './config'

export interface SimpleDeviceRow {
  key: string
  severity: Severity
  lastUpdate: number
  // Lowercased, space-joined blob of every field the caller wants this row
  // searchable by (serial/site id, description, location, name, ...) — kept
  // as a single opaque string rather than a list of fields so this component
  // doesn't need to know what a pump station or flow monitor even is. Falls
  // back to `key` alone when a caller doesn't build one.
  searchText?: string
}

interface Props<T extends SimpleDeviceRow> {
  devices: T[]
  keyLabel: string
  // Shown in the search input's placeholder in place of keyLabel, e.g.
  // "serial, description, location" — falls back to keyLabel.
  searchLabel?: string
  // Render-prop rather than a fixed card shape, so callers that need extra
  // per-row data (e.g. Pump Stations' Unit Status subtitle, which needs its
  // own hook call per row) control the card fully instead of this component
  // guessing at a one-size-fits-all card.
  renderCard: (row: T) => React.ReactNode
  // Extra controls shown in the filter row, right-aligned before the count
  // (e.g. Pump Stations/Flow Monitors' "Missing Attributes" button).
  headerActions?: React.ReactNode
}

/**
 * Filterable card grid shared by Flow Monitors and Pump Stations — replaces
 * the older plain DeviceTable list with the same clickable-card language
 * RecentAnomaliesWidget uses, just reused here instead of a bespoke layout
 * per tab.
 */
export default function SimpleDeviceGrid<T extends SimpleDeviceRow>({ devices, keyLabel, searchLabel, renderCard, headerActions }: Props<T>) {
  const [textFilter, setTextFilter] = React.useState('')
  const [severityFilter, setSeverityFilter] = React.useState<Severity | 'All'>('All')

  const filtered = React.useMemo(
    () =>
      devices.filter(row => {
        if (severityFilter !== 'All' && row.severity !== severityFilter) return false
        if (textFilter && !(row.searchText ?? row.key).toLowerCase().includes(textFilter.toLowerCase())) return false
        return true
      }),
    [devices, textFilter, severityFilter]
  )

  return (
    <div style={{ padding: 'var(--cmom-space-4)', height: '100%', overflow: 'auto', boxSizing: 'border-box' }}>
      <div style={{ display: 'flex', gap: 'var(--cmom-space-3)', marginBottom: 'var(--cmom-space-4)', flexWrap: 'wrap', alignItems: 'center' }}>
        <input
          placeholder={`Filter by ${searchLabel ?? keyLabel}`}
          value={textFilter}
          onChange={e => setTextFilter(e.target.value)}
          style={{ padding: 6, width: 220, borderRadius: 'var(--cmom-radius-sm)', border: '1px solid var(--cmom-border-strong)' }}
        />
        <select value={severityFilter} onChange={e => setSeverityFilter(e.target.value as Severity | 'All')}>
          <option value="All">All severities</option>
          {severityOrder.map(s => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 'var(--cmom-space-3)', alignItems: 'center' }}>
          {headerActions}
          <span className="cmom-label">
            {filtered.length} of {devices.length}
          </span>
        </div>
      </div>

      {devices.length === 0 ? (
        <div style={{ opacity: 0.7 }}>No devices seen on this topic prefix yet.</div>
      ) : filtered.length === 0 ? (
        <div style={{ opacity: 0.7 }}>No devices match the current filters.</div>
      ) : (
        <div className="cmom-device-grid">{filtered.map(row => renderCard(row))}</div>
      )}
    </div>
  )
}
