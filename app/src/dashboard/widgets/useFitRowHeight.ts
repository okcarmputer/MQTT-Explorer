import * as React from 'react'
import { useResizeDetector } from 'react-resize-detector'

// Must match PanelGrid's own MARGIN_Y (the vertical gap react-grid-layout
// puts between rows) — this has to agree with what PanelGrid will actually
// render or the fitted rowHeight below/overshoots the real available space.
const MARGIN_Y = 12
const MIN_ROW_HEIGHT = 18

/**
 * Computes a PanelGrid `rowHeight` that makes `totalRows` worth of grid rows
 * fill whatever vertical space is actually available — the returned `ref`
 * measures its own container's height, so a detail page's default layout
 * scales to fit the visible viewport (adjusts with browser zoom, window
 * resize, etc.) instead of needing an inner scrollbar for a fixed 32px-per-row
 * layout that may be taller than the screen. Only falls back to scrolling
 * once the window is zoomed in far enough that MIN_ROW_HEIGHT can't shrink
 * any further to compensate — the container this `ref` is attached to should
 * still have its own `overflow: auto` as that fallback.
 */
export function useFitRowHeight(totalRows: number, fallback: number) {
  const { ref, height } = useResizeDetector<HTMLDivElement>()
  const rowHeight = React.useMemo(() => {
    if (!height || totalRows <= 0) return fallback
    const available = height - MARGIN_Y * (totalRows + 1)
    return Math.max(MIN_ROW_HEIGHT, Math.floor(available / totalRows))
  }, [height, totalRows, fallback])
  return { ref, rowHeight }
}
