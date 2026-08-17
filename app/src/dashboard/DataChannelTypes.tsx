import * as React from 'react'
import { connect } from 'react-redux'
import { useNavigate } from 'react-router-dom'
import { AppState } from '../reducers'
import * as q from '../../../backend/src/Model'
import { dashboardConfig } from './config'
import { useTopicChildren } from './useTopicChildren'

interface Props {
  tree?: q.Tree<any>
}

interface ChannelType {
  id: string
  name: string
  abbreviation: string
  description: string
  units: string
}

function readChannelType(node: q.TreeNode<any> | undefined, fallbackId: string): ChannelType | undefined {
  const payload = node?.message?.payload?.toUnicodeString()
  if (!payload) return undefined
  try {
    const json = JSON.parse(payload)
    return {
      id: json.id ?? fallbackId,
      name: json.name || '',
      abbreviation: json.abbreviation || '',
      description: json.description || '',
      units: json.units || '',
    }
  } catch {
    return undefined
  }
}

function ChannelTypeTable({ title, ids }: { title: string; ids: { key: string; node: q.TreeNode<any> }[] }) {
  const [textFilter, setTextFilter] = React.useState('')

  const rows = ids
    .map(c => readChannelType(c.node, c.key))
    .filter((c): c is ChannelType => c !== undefined)
    .filter(c => {
      if (!textFilter) return true
      const haystack = `${c.id} ${c.name} ${c.abbreviation} ${c.description}`.toLowerCase()
      return haystack.includes(textFilter.toLowerCase())
    })
    .sort((a, b) => Number(a.id) - Number(b.id))

  return (
    <div style={{ marginBottom: 'var(--cmom-space-5)' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 'var(--cmom-space-2)' }}>
        <h3 style={{ margin: 0 }}>{title}</h3>
        <input
          placeholder="Filter by id, name, abbreviation…"
          value={textFilter}
          onChange={e => setTextFilter(e.target.value)}
          style={{ padding: 6, width: 220, borderRadius: 'var(--cmom-radius-sm)', border: '1px solid var(--cmom-border-strong)' }}
        />
      </div>
      <div className="cmom-card" style={{ padding: 0, overflow: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
          <thead>
            <tr style={{ textAlign: 'left', borderBottom: '1px solid var(--cmom-border-strong)' }}>
              <th style={{ padding: '6px 10px' }}>ID</th>
              <th style={{ padding: '6px 10px' }}>Name</th>
              <th style={{ padding: '6px 10px' }}>Abbreviation</th>
              <th style={{ padding: '6px 10px' }}>Description</th>
              <th style={{ padding: '6px 10px' }}>Units</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(c => (
              <tr key={c.id} style={{ borderBottom: '1px solid var(--cmom-border)' }}>
                <td style={{ padding: '5px 10px', fontFamily: 'var(--cmom-font-mono)' }}>{c.id}</td>
                <td style={{ padding: '5px 10px' }}>{c.name}</td>
                <td style={{ padding: '5px 10px' }}>{c.abbreviation}</td>
                <td style={{ padding: '5px 10px', opacity: 0.75 }}>{c.description}</td>
                <td style={{ padding: '5px 10px' }}>{c.units}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

/**
 * flow_monitors/data_channel_types is a reference/lookup topic (the full
 * catalog of every Hach channel id fm_mqtt.py knows about — name, units,
 * native vs. virtual), not a site — see config.ts's metadataChildren for
 * why it's excluded from the site list itself. This is where that catalog
 * actually lives in the UI instead: a standalone reference view reachable
 * from a button on the Flow Monitors tab.
 */
function DataChannelTypes({ tree }: Props) {
  const navigate = useNavigate()
  const nativeChildren = useTopicChildren(tree, `${dashboardConfig.flowMonitors.dataChannelTypesPath}/native`)
  const virtualChildren = useTopicChildren(tree, `${dashboardConfig.flowMonitors.dataChannelTypesPath}/virtual`)

  return (
    <div style={{ padding: 'var(--cmom-space-4)', height: '100%', overflow: 'auto', boxSizing: 'border-box' }}>
      <button
        type="button"
        onClick={() => navigate('/flow-monitors')}
        style={{
          marginBottom: 'var(--cmom-space-3)',
          padding: '4px 12px',
          borderRadius: 'var(--cmom-radius-sm)',
          border: '1px solid var(--cmom-border-strong)',
          background: 'transparent',
          color: 'inherit',
          cursor: 'pointer',
        }}
      >
        &larr; Back
      </button>
      <h2 style={{ marginTop: 0 }}>Data Channel Types</h2>
      <div style={{ opacity: 0.7, fontSize: 12, marginBottom: 'var(--cmom-space-4)' }}>
        Reference catalog of every Hach channel id — not a site, so it doesn&apos;t appear in the Flow Monitors list.
      </div>
      {nativeChildren.length === 0 && virtualChildren.length === 0 ? (
        <div style={{ opacity: 0.7 }}>No data_channel_types payload seen on the broker yet.</div>
      ) : (
        <>
          <ChannelTypeTable title={`Native (${nativeChildren.length})`} ids={nativeChildren} />
          <ChannelTypeTable title={`Virtual (${virtualChildren.length})`} ids={virtualChildren} />
        </>
      )}
    </div>
  )
}

const mapStateToProps = (state: AppState) => ({
  tree: state.connection.tree,
})

export default connect(mapStateToProps)(DataChannelTypes)
