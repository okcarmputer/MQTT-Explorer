import * as React from 'react'
import { connect } from 'react-redux'
import { Link, useNavigate } from 'react-router-dom'
import { AppState } from '../reducers'
import * as q from '../../../backend/src/Model'
import { dashboardConfig } from './config'
import { useTopicChildren } from './useTopicChildren'
import { computeMissingFlowMonitorAttributes, FLOW_MONITOR_ATTRIBUTE_NAMES, FlowMonitorAttributeName } from './flowMonitorAttributeAudit'

interface Props {
  tree?: q.Tree<any>
}

/**
 * Audit list: every flow monitor site with at least one attribute
 * FlowMonitorDetail.tsx would show as empty/absent — no site_info, no pipe
 * diameter published, no live Level reading, or a whole Level/Velocity/Flow
 * channel never seen at all. Computed straight from the MQTT tree (no SQL
 * round trip, unlike the pump station version of this audit — see
 * flowMonitorAttributeAudit.ts), so filtering can happen up front instead
 * of each row self-filtering after an async fetch.
 */
function FlowMonitorMissingAttributes({ tree }: Props) {
  const navigate = useNavigate()
  const devices = useTopicChildren(tree, dashboardConfig.flowMonitors.topicPrefix, dashboardConfig.flowMonitors.metadataChildren)
  const [textFilter, setTextFilter] = React.useState('')
  const [attributeFilter, setAttributeFilter] = React.useState<FlowMonitorAttributeName | 'Any'>('Any')
  const [, setTick] = React.useState(0)

  // computeMissingFlowMonitorAttributes reads live message payloads directly
  // off each node rather than subscribing itself — re-render on a slow poll
  // so a site publishing its missing site_info/channel/level mid-session
  // drops off the list without needing a page reload.
  React.useEffect(() => {
    const interval = setInterval(() => setTick(t => t + 1), 5000)
    return () => clearInterval(interval)
  }, [])

  const rows = React.useMemo(
    () =>
      devices
        .map(d => ({ key: d.key, missing: computeMissingFlowMonitorAttributes(d.node) }))
        .filter(r => r.missing.length > 0)
        .filter(r => attributeFilter === 'Any' || r.missing.includes(attributeFilter))
        .filter(r => !textFilter || r.key.toLowerCase().includes(textFilter.toLowerCase())),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [devices, textFilter, attributeFilter, setTick]
  )

  return (
    <div style={{ padding: 'var(--cmom-space-4, 16px)', height: '100%', overflow: 'auto', boxSizing: 'border-box' }}>
      <button
        type="button"
        onClick={() => navigate('/flow-monitors')}
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
      <h2 style={{ marginTop: 0 }}>Flow Monitors — Missing Attributes</h2>

      <div style={{ display: 'flex', gap: 'var(--cmom-space-3)', marginBottom: 'var(--cmom-space-4)', flexWrap: 'wrap', alignItems: 'center' }}>
        <input
          placeholder="Filter by site ID"
          value={textFilter}
          onChange={e => setTextFilter(e.target.value)}
          style={{ padding: 6, width: 220, borderRadius: 'var(--cmom-radius-sm)', border: '1px solid var(--cmom-border-strong)' }}
        />
        <select value={attributeFilter} onChange={e => setAttributeFilter(e.target.value as FlowMonitorAttributeName | 'Any')}>
          <option value="Any">Any missing attribute</option>
          {FLOW_MONITOR_ATTRIBUTE_NAMES.map(name => (
            <option key={name} value={name}>
              Missing: {name}
            </option>
          ))}
        </select>
        <span className="cmom-label">{rows.length} of {devices.length}</span>
      </div>

      {devices.length === 0 ? (
        <div style={{ opacity: 0.7 }}>No flow monitors seen on this topic prefix yet.</div>
      ) : rows.length === 0 ? (
        <div style={{ opacity: 0.7 }}>No sites match the current filters.</div>
      ) : (
        rows.map(row => (
          <Link
            key={row.key}
            to={`/flow-monitors/${row.key}`}
            className="cmom-card"
            style={{ display: 'block', padding: 'var(--cmom-space-3)', textDecoration: 'none', color: 'inherit', marginBottom: 8 }}
          >
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
              <span style={{ fontFamily: 'var(--cmom-font-mono)', fontWeight: 700, fontSize: 15 }}>{row.key}</span>
              <span className="cmom-label">
                {row.missing.length} missing attribute{row.missing.length === 1 ? '' : 's'}
              </span>
            </div>
            <div style={{ fontSize: 12, opacity: 0.8, marginTop: 4 }}>{row.missing.join(', ')}</div>
          </Link>
        ))
      )}
    </div>
  )
}

const mapStateToProps = (state: AppState) => ({
  tree: state.connection.tree,
})

export default connect(mapStateToProps)(FlowMonitorMissingAttributes)
