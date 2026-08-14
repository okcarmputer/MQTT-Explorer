import * as React from 'react'
import { useResizeDetector } from 'react-resize-detector'
import { ResponsiveGridLayout, LayoutItem, ResponsiveLayouts } from 'react-grid-layout'
import 'react-grid-layout/css/styles.css'
import 'react-resizable/css/styles.css'

export interface GridPanelDef {
  id: string
  title: string
  defaultLayout: { x: number; y: number; w: number; h: number; minW?: number; minH?: number }
  render: () => React.ReactNode
}

interface Props {
  // Distinguishes this grid's saved layout from other grids (e.g. Overview
  // vs. Anomalies) so resetting/persisting one never clobbers the other.
  storageKey: string
  panels: GridPanelDef[]
}

const BREAKPOINTS = { lg: 1200, md: 996, sm: 768, xs: 480, xxs: 0 }
const COLS = { lg: 12, md: 10, sm: 6, xs: 4, xxs: 2 }

function defaultLayouts(panels: GridPanelDef[]): ResponsiveLayouts {
  const items: LayoutItem[] = panels.map(p => ({ i: p.id, ...p.defaultLayout }))
  return { lg: items, md: items, sm: items, xs: items, xxs: items }
}

function loadLayouts(storageKey: string, panels: GridPanelDef[]): ResponsiveLayouts {
  try {
    const raw = window.localStorage.getItem(storageKey)
    if (!raw) return defaultLayouts(panels)
    const parsed = JSON.parse(raw)
    // Guard against a stale saved layout from a panel set that no longer
    // matches (e.g. a panel was added/removed in a later dashboard revision).
    const knownIds = new Set(panels.map(p => p.id))
    const savedIds = new Set((parsed.lg ?? []).map((item: LayoutItem) => item.i))
    const sameShape = knownIds.size === savedIds.size && [...knownIds].every(id => savedIds.has(id))
    return sameShape ? parsed : defaultLayouts(panels)
  } catch {
    return defaultLayouts(panels)
  }
}

/**
 * A draggable/resizable panel grid, persisted to localStorage under
 * `storageKey`. Used by the Overview and Anomalies tabs; not the Flow
 * Monitors/Pump Stations tables, which stay plain lists for now.
 */
export default function DashboardGrid({ storageKey, panels }: Props) {
  const [layouts, setLayouts] = React.useState<ResponsiveLayouts>(() => loadLayouts(storageKey, panels))
  const { width, ref } = useResizeDetector()

  const handleLayoutChange = (_current: readonly LayoutItem[], allLayouts: ResponsiveLayouts) => {
    setLayouts(allLayouts)
    window.localStorage.setItem(storageKey, JSON.stringify(allLayouts))
  }

  const handleReset = () => {
    const fresh = defaultLayouts(panels)
    setLayouts(fresh)
    window.localStorage.setItem(storageKey, JSON.stringify(fresh))
  }

  return (
    <div style={{ padding: 'var(--cmom-space-4, 16px)', height: '100%', overflow: 'auto', boxSizing: 'border-box' }}>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 'var(--cmom-space-2, 8px)' }}>
        <button
          type="button"
          onClick={handleReset}
          className="cmom-label"
          style={{
            padding: '4px 12px',
            borderRadius: 'var(--cmom-radius-sm, 4px)',
            border: '1px solid var(--cmom-border-strong, rgba(128,128,128,0.4))',
            background: 'transparent',
            cursor: 'pointer',
          }}
          onMouseEnter={e => (e.currentTarget.style.borderColor = 'var(--cmom-accent, #2ea043)')}
          onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--cmom-border-strong, rgba(128,128,128,0.4))')}
        >
          Reset layout
        </button>
      </div>
      <div ref={ref}>
        {width !== undefined && width > 0 && (
          <ResponsiveGridLayout
            width={width}
            layouts={layouts}
            onLayoutChange={handleLayoutChange}
            breakpoints={BREAKPOINTS}
            cols={COLS}
            rowHeight={90}
            margin={[12, 12]}
            dragConfig={{ enabled: true, bounded: false, handle: '.panel-drag-handle' }}
          >
            {panels.map(p => (
              <div
                key={p.id}
                style={{
                  background: 'var(--cmom-panel-bg, rgba(128,128,128,0.05))',
                  border: '1px solid var(--cmom-border, rgba(128,128,128,0.18))',
                  borderRadius: 'var(--cmom-radius-md, 8px)',
                  overflow: 'hidden',
                  display: 'flex',
                  flexDirection: 'column',
                  height: '100%',
                  minWidth: 0,
                  boxSizing: 'border-box',
                }}
              >
                <div
                  className="panel-drag-handle cmom-label"
                  style={{
                    cursor: 'move',
                    padding: '8px 10px',
                    borderBottom: '1px solid var(--cmom-border, rgba(128,128,128,0.18))',
                    flexShrink: 0,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {p.title}
                </div>
                <div style={{ flex: 1, minHeight: 0, minWidth: 0, overflow: 'auto', padding: 'var(--cmom-space-2, 8px)', boxSizing: 'border-box' }}>
                  {p.render()}
                </div>
              </div>
            ))}
          </ResponsiveGridLayout>
        )}
      </div>
    </div>
  )
}
