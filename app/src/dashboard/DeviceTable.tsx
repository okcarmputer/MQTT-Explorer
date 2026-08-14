import * as React from 'react'
import { Link } from 'react-router-dom'
import {
  ColumnDef,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getSortedRowModel,
  useReactTable,
} from '@tanstack/react-table'
import { Severity, severityOrder } from './config'
import { DeviceSnapshot } from './store/mqttStore'
import SeverityBadge from './SeverityBadge'

type DeviceRow = DeviceSnapshot

interface Props {
  // Reads from the zustand MQTT store (see store/mqttStore.ts) rather than
  // the tree directly — decoupled from the Explorer tree component.
  devices: DeviceSnapshot[]
  keyLabel: string
  linkTo: (key: string) => string
}

/**
 * Sortable/filterable device list — a text filter on the key plus a
 * severity filter (OK/LOW/MODERATE/CRITICAL). Severity is a display-only
 * rollup (see anomalyTypeScan.deviceSeverity), not a new source of truth.
 * Each row is a real link to the device's own route (FlowMonitorDetail or
 * PumpStationDetail).
 */
export default function DeviceTable({ devices, keyLabel, linkTo }: Props) {
  const [textFilter, setTextFilter] = React.useState('')
  const [severityFilter, setSeverityFilter] = React.useState<Severity | 'All'>('All')
  const [sorting, setSorting] = React.useState([{ id: 'key', desc: false }])

  const data = devices

  const filtered = React.useMemo(
    () =>
      data.filter(
        row =>
          (severityFilter === 'All' || row.severity === severityFilter) &&
          (textFilter === '' || row.key.toLowerCase().includes(textFilter.toLowerCase()))
      ),
    [data, textFilter, severityFilter]
  )

  const columns = React.useMemo<ColumnDef<DeviceRow>[]>(
    () => [
      {
        id: 'key',
        accessorKey: 'key',
        header: keyLabel,
        cell: info => (
          <Link
            to={linkTo(info.getValue<string>())}
            style={{ display: 'block', fontFamily: 'monospace', color: 'inherit', textDecoration: 'none' }}
          >
            {info.getValue<string>()}
          </Link>
        ),
      },
      {
        id: 'severity',
        accessorKey: 'severity',
        header: 'Severity',
        sortingFn: (a, b) =>
          severityOrder.indexOf(a.original.severity) - severityOrder.indexOf(b.original.severity),
        cell: info => <SeverityBadge severity={info.getValue<Severity>()} />,
      },
      {
        id: 'lastUpdate',
        accessorKey: 'lastUpdate',
        header: 'Last update',
        cell: info => <span style={{ opacity: 0.7 }}>{new Date(info.getValue<number>()).toLocaleTimeString()}</span>,
      },
    ],
    [keyLabel, linkTo]
  )

  const table = useReactTable({
    data: filtered,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
  })

  return (
    <div style={{ padding: 'var(--cmom-space-4, 16px)', height: '100%', overflow: 'auto', boxSizing: 'border-box' }}>
      <div style={{ display: 'flex', gap: 'var(--cmom-space-3, 12px)', marginBottom: 'var(--cmom-space-3, 12px)', flexWrap: 'wrap' }}>
        <input
          placeholder={`Filter by ${keyLabel}`}
          value={textFilter}
          onChange={e => setTextFilter(e.target.value)}
          style={{ padding: 6, width: 220, borderRadius: 'var(--cmom-radius-sm, 4px)', border: '1px solid var(--cmom-border-strong, rgba(128,128,128,0.4))' }}
        />
        <select value={severityFilter} onChange={e => setSeverityFilter(e.target.value as Severity | 'All')}>
          <option value="All">All severities</option>
          {severityOrder.map(s => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </div>
      {devices.length === 0 ? (
        <div style={{ opacity: 0.7 }}>No devices seen on this topic prefix yet.</div>
      ) : filtered.length === 0 ? (
        <div style={{ opacity: 0.7 }}>No devices match the current filters.</div>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            {table.getHeaderGroups().map(headerGroup => (
              <tr key={headerGroup.id} style={{ textAlign: 'left', borderBottom: '1px solid var(--cmom-border-strong, rgba(128,128,128,0.4))' }}>
                {headerGroup.headers.map(header => (
                  <th
                    key={header.id}
                    onClick={header.column.getToggleSortingHandler()}
                    style={{ padding: '6px 8px', cursor: 'pointer', userSelect: 'none' }}
                  >
                    {flexRender(header.column.columnDef.header, header.getContext())}
                    {{ asc: ' ▲', desc: ' ▼' }[header.column.getIsSorted() as string] ?? ''}
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody>
            {table.getRowModel().rows.map(row => (
              <tr key={row.id} style={{ borderBottom: '1px solid var(--cmom-border, rgba(128,128,128,0.15))' }}>
                {row.getVisibleCells().map(cell => (
                  <td key={cell.id} style={{ padding: '6px 8px' }}>
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}
