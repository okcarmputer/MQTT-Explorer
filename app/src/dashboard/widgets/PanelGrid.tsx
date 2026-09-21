import * as React from 'react'
import { useResizeDetector } from 'react-resize-detector'
import { ResponsiveGridLayout, Layout, LayoutItem } from 'react-grid-layout'

export interface PanelSpec {
  id: string
  title: string
  defaultLayout: { x: number; y: number; w: number; h: number }
  content: React.ReactNode
  // When true, this panel's height is continuously kept in sync with its
  // content's actual rendered height (see AutoHeightMeasure below) instead
  // of being left at whatever h the layout says — so a card whose content
  // grew past its guessed default height extends instead of scrolling, and
  // one whose content is shorter than its guessed default shrinks instead
  // of leaving blank space below it. Only appropriate for panels whose
  // content has its own natural size (a list of fields, a fixed-size
  // chart) — NOT for panels holding a `fillHeight` chart, where resizing
  // the card is exactly how the user is meant to grow the chart itself.
  autoHeight?: boolean
}

interface Props {
  // localStorage key layout is persisted under — one per page *type*
  // (e.g. "cmom-layout-pump-station-detail"), not per station/site, so
  // every station of that type shares the same remembered arrangement.
  storageKey: string
  panels: PanelSpec[]
  cols?: number
  rowHeight?: number
}

const BREAKPOINT = 'lg'
const MARGIN_Y = 12
// The card chrome that sits above/around an autoHeight panel's own content
// — the drag-handle title bar (padding + text + border) plus the content
// wrapper's own top/bottom padding — none of which the content measurement
// below ever sees, so it has to be accounted for separately.
const CARD_HEADER_PX = 29
const CARD_CONTENT_PADDING_PX = 16

// Reuses a saved layout only if it has an entry for every panel this render
// actually has — a code change that adds/removes/renames a panel falls back
// to the built-in defaults instead of silently misplacing or dropping the
// new one, or leaving a dangling entry for one that no longer exists.
function loadLayout(storageKey: string, panels: PanelSpec[]): Layout {
  try {
    const raw = localStorage.getItem(storageKey)
    if (raw) {
      const saved: LayoutItem[] = JSON.parse(raw)
      if (Array.isArray(saved) && panels.every(p => saved.some(s => s.i === p.id))) {
        return saved.filter(s => panels.some(p => p.id === s.i))
      }
    }
  } catch {
    // Corrupt/foreign localStorage value — ignore and fall through to defaults.
  }
  return panels.map(p => ({ i: p.id, ...p.defaultLayout }))
}

function persistLayout(storageKey: string, layout: Layout) {
  try {
    localStorage.setItem(storageKey, JSON.stringify(layout))
  } catch {
    // Storage full/unavailable (private browsing, etc.) — layout still
    // works for this session, just won't persist across reloads.
  }
}

// Wraps an autoHeight panel's content in an unconstrained div (no fixed
// height of its own) so it always renders at its true natural size even
// though its scrollable ancestor clips/scrolls it to the grid's current
// (possibly stale, about-to-be-corrected) row height — then reports that
// natural height any time it changes.
function AutoHeightMeasure({ onHeight, children }: { onHeight: (px: number) => void; children: React.ReactNode }) {
  const { ref, height } = useResizeDetector()
  // The callback is held in a ref and deliberately kept out of the effect's
  // dependencies. Callers build it inline (`px => handleAutoHeight(id, px)`),
  // so it has a fresh identity on every render — depending on it re-ran this
  // effect on each of the page's 2s live-data renders, re-reporting an
  // unchanged height and restarting the debounce downstream. Only a genuine
  // height change should reach the parent.
  const onHeightRef = React.useRef(onHeight)
  React.useEffect(() => {
    onHeightRef.current = onHeight
  })
  React.useEffect(() => {
    if (height !== undefined) {
      onHeightRef.current(height)
    }
  }, [height])
  return <div ref={ref}>{children}</div>
}

/**
 * Drag-to-rearrange, resize-to-extend panel grid for detail pages (Pump
 * Station / Flow Monitor) — a thin wrapper around react-grid-layout
 * (already an app dependency, previously unused anywhere in the dashboard)
 * that persists the arrangement to localStorage so it survives reloads and
 * applies to every station/site of that page type, not just the one being
 * viewed when it was rearranged.
 *
 * Dragging is restricted to each panel's own header bar (`dragConfig.handle`)
 * rather than the whole panel body, so clicking a chart's time-range buttons
 * or dragging to pan a chart doesn't fight with rearranging the page.
 */
export default function PanelGrid({ storageKey, panels, cols = 12, rowHeight = 32 }: Props) {
  const { width, ref } = useResizeDetector()
  const [layout, setLayout] = React.useState<Layout>(() => loadLayout(storageKey, panels))

  // A panel set changing (different tab, different device type navigated
  // to while this component instance is reused) re-seeds from storage/defaults.
  React.useEffect(() => {
    setLayout(loadLayout(storageKey, panels))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storageKey, panels.map(p => p.id).join(',')])

  const handleLayoutChange = React.useCallback(
    (_current: Layout, layouts: Partial<Record<string, Layout>>) => {
      const next = layouts[BREAKPOINT]
      if (!next) return
      setLayout(next)
      persistLayout(storageKey, next)
    },
    [storageKey]
  )

  // Applies an autoHeight panel's natural content height exactly once (the
  // first measurement after it mounts/re-seeds) rather than continuously —
  // a dashboard card's content keeps changing shape on every live MQTT
  // update (a value gaining/losing a digit, a field wrapping differently),
  // and reacting to every one of those was constantly nudging that panel's
  // row count up and down, which (via vertical compaction) shoved every
  // card below it around too — "moving for no reason". One-shot sizing at
  // mount still fixes the original problem (a guessed default height that's
  // too short/too tall for the real content) without that ongoing jitter;
  // after that, the panel behaves like any other — the user's own drag/
  // resize (or lack of one) is what decides its height going forward.
  const autoSizedRef = React.useRef<Set<string>>(new Set())
  // Debounces the "first" measurement itself: content that's still loading
  // in (site_info/UnitStatus hasn't arrived yet, so a card briefly shows a
  // short "not published yet" placeholder before its real field list
  // renders) would otherwise get permanently locked to that placeholder's
  // height. Only apply once a panel's reported height holds steady for a
  // beat, so it's the real content's height that gets locked in, not
  // whatever transient height happened to be on screen first.
  const pendingRef = React.useRef<Map<string, { height: number; timer: ReturnType<typeof setTimeout> }>>(new Map())
  React.useEffect(() => {
    autoSizedRef.current = new Set()
    pendingRef.current.forEach(p => clearTimeout(p.timer))
    pendingRef.current = new Map()
  }, [storageKey, panels.map(p => p.id).join(',')])
  React.useEffect(
    () => () => {
      pendingRef.current.forEach(p => clearTimeout(p.timer))
    },
    []
  )

  const applyAutoHeight = React.useCallback(
    (id: string, contentPx: number) => {
      const neededH = Math.max(
        1,
        Math.ceil((CARD_HEADER_PX + CARD_CONTENT_PADDING_PX + contentPx + MARGIN_Y) / (rowHeight + MARGIN_Y))
      )
      setLayout(prev => {
        const idx = prev.findIndex(item => item.i === id)
        if (idx === -1 || prev[idx].h === neededH) {
          return prev
        }
        const next = prev.map((item, i) => (i === idx ? { ...item, h: neededH } : item))
        persistLayout(storageKey, next)
        return next
      })
    },
    [rowHeight, storageKey]
  )

  const handleAutoHeight = React.useCallback(
    (id: string, contentPx: number) => {
      if (autoSizedRef.current.has(id)) {
        return
      }
      const existing = pendingRef.current.get(id)
      if (existing) {
        clearTimeout(existing.timer)
      }
      const timer = setTimeout(() => {
        autoSizedRef.current.add(id)
        pendingRef.current.delete(id)
        applyAutoHeight(id, contentPx)
      }, 500)
      pendingRef.current.set(id, { height: contentPx, timer })
    },
    [applyAutoHeight]
  )

  return (
    <div ref={ref} style={{ width: '100%' }}>
    <ResponsiveGridLayout
      width={width || 800}
      breakpoints={{ [BREAKPOINT]: 0 }}
      cols={{ [BREAKPOINT]: cols }}
      layouts={{ [BREAKPOINT]: layout }}
      rowHeight={rowHeight}
      margin={[12, MARGIN_Y]}
      dragConfig={{ handle: '.cmom-panel-drag-handle' }}
      onLayoutChange={handleLayoutChange}
    >
      {panels.map(panel => (
        <div
          key={panel.id}
          className="cmom-card"
          style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden', padding: 0 }}
        >
          <div
            className="cmom-panel-drag-handle cmom-label"
            style={{
              cursor: 'grab',
              padding: '6px 10px',
              borderBottom: '1px solid var(--cmom-border-strong, rgba(128,128,128,0.4))',
              userSelect: 'none',
              flex: '0 0 auto',
            }}
            title="Drag to move this panel"
          >
            ⠿ {panel.title}
          </div>
          <div style={{ flex: '1 1 auto', minHeight: 0, overflow: 'auto', padding: 'var(--cmom-space-2, 8px)' }}>
            {panel.autoHeight ? (
              <AutoHeightMeasure onHeight={px => handleAutoHeight(panel.id, px)}>{panel.content}</AutoHeightMeasure>
            ) : (
              panel.content
            )}
          </div>
        </div>
      ))}
    </ResponsiveGridLayout>
    </div>
  )
}
