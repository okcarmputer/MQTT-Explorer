import * as React from 'react'
import { connect } from 'react-redux'
import { Link, useNavigate } from 'react-router-dom'
import { AppState } from '../reducers'
import * as q from '../../../backend/src/Model'
import { dashboardConfig } from './config'
import { useTopicChildren } from './useTopicChildren'
import { usePumpStationSummary, resolveWetWellLevelFt } from './usePumpStationSummary'
import { useSqlWetWellInfo } from './useSqlWetWellInfo'
import { computeMissingPumpStationAttributes, PUMP_STATION_ATTRIBUTE_NAMES, PumpStationAttributeName } from './pumpStationAttributeAudit'

interface Props {
  tree?: q.Tree<any>
}

interface Filters {
  textFilter: string
  attributeFilter: PumpStationAttributeName | 'Any'
}

/**
 * One station's row — its own component (not inlined in a .map) because it
 * needs a hook call per station (usePumpStationSummary + the SQL wet-well
 * RPC), same reason PumpStationGridCard does. Self-filters (renders null
 * when it doesn't match) rather than lifting the async-computed missing
 * list up to the parent for filtering there.
 */
function PumpStationMissingRow({ serial, node, filters }: { serial: string; node: q.TreeNode<any>; filters: Filters }) {
  const summary = usePumpStationSummary(node)
  const wetWellInfo = useSqlWetWellInfo(serial)
  const wetWell = wetWellInfo?.wetWell
  const currentLevelFt = resolveWetWellLevelFt(summary, wetWell?.currentLevelFt)

  const missing = computeMissingPumpStationAttributes(node, summary, wetWell, currentLevelFt)

  // Still loading from SQL — its GIS fields are empty because they haven't
  // arrived yet, not because they're missing.
  if (wetWellInfo?.pending) return null
  if (missing.length === 0) return null
  if (filters.attributeFilter !== 'Any' && !missing.includes(filters.attributeFilter)) return null
  if (filters.textFilter && !serial.toLowerCase().includes(filters.textFilter.toLowerCase())) return null

  return (
    <Link
      to={`/pump-stations/${serial}`}
      className="cmom-card"
      style={{ display: 'block', padding: 'var(--cmom-space-3)', textDecoration: 'none', color: 'inherit', marginBottom: 8 }}
    >
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
        <span style={{ fontFamily: 'var(--cmom-font-mono)', fontWeight: 700, fontSize: 15 }}>{serial}</span>
        <span className="cmom-label">
          {missing.length} missing attribute{missing.length === 1 ? '' : 's'}
        </span>
      </div>
      <div style={{ fontSize: 12, opacity: 0.8, marginTop: 4 }}>{missing.join(', ')}</div>
    </Link>
  )
}

/**
 * Audit list: every pump station with at least one attribute
 * PumpStationDetail.tsx would show as empty/"N/A" — a facility/GIS field
 * with no SQL record, no wet well shape/dimensions, no live level reading,
 * or an entire section (Unit Status/Analog Inputs/.../Temperature) with
 * nothing published yet. Filterable by station and by which specific
 * attribute is missing; each row still links straight into that station's
 * own detail page.
 */
function PumpStationMissingAttributes({ tree }: Props) {
  const navigate = useNavigate()
  const devices = useTopicChildren(tree, dashboardConfig.pumpStations.topicPrefix)
  const [textFilter, setTextFilter] = React.useState('')
  const [attributeFilter, setAttributeFilter] = React.useState<PumpStationAttributeName | 'Any'>('Any')
  const filters: Filters = { textFilter, attributeFilter }

  return (
    <div style={{ padding: 'var(--cmom-space-4, 16px)', height: '100%', overflow: 'auto', boxSizing: 'border-box' }}>
      <button
        type="button"
        onClick={() => navigate('/pump-stations')}
        style={{
          marginBottom: 'var(--cmom-space-3, 12px)',
          padding: '4px 12px',
          borderRadius: 'var(--cmom-radius-sm, 4px)',
          border: '1px solid var(--cmom-border-strong, rgba(128,128,128,0.4))',
          background: 'transparent',
          color: 'inherit',
          cursor: 'pointer',
        }}
      >
        &larr; Back
      </button>
      <h2 style={{ marginTop: 0 }}>Pump Stations — Missing Attributes</h2>

      <div style={{ display: 'flex', gap: 'var(--cmom-space-3)', marginBottom: 'var(--cmom-space-4)', flexWrap: 'wrap', alignItems: 'center' }}>
        <input
          placeholder="Filter by serial"
          value={textFilter}
          onChange={e => setTextFilter(e.target.value)}
          style={{ padding: 6, width: 220, borderRadius: 'var(--cmom-radius-sm)', border: '1px solid var(--cmom-border-strong)' }}
        />
        <select value={attributeFilter} onChange={e => setAttributeFilter(e.target.value as PumpStationAttributeName | 'Any')}>
          <option value="Any">Any missing attribute</option>
          {PUMP_STATION_ATTRIBUTE_NAMES.map(name => (
            <option key={name} value={name}>
              Missing: {name}
            </option>
          ))}
        </select>
      </div>

      {devices.length === 0 ? (
        <div style={{ opacity: 0.7 }}>No pump stations seen on this topic prefix yet.</div>
      ) : (
        devices.map(d => <PumpStationMissingRow key={d.key} serial={d.key} node={d.node} filters={filters} />)
      )}
    </div>
  )
}

const mapStateToProps = (state: AppState) => ({
  tree: state.connection.tree,
})

export default connect(mapStateToProps)(PumpStationMissingAttributes)
