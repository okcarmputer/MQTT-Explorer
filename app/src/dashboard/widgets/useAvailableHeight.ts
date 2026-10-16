import { useResizeDetector } from 'react-resize-detector'

/**
 * Measures the vertical space a detail page has left for its PanelGrid
 * (below the header/KPI row, inside the page padding). Pass `height` to
 * PanelGrid's `fitHeight`, which sizes rows so the layout on screen fills
 * exactly that much. Attach `ref` to the flex:1 wrapper around the grid; that
 * wrapper keeps `overflow: auto` so a window too small to fit the cards
 * still scrolls.
 */
export function useAvailableHeight() {
  const { ref, height } = useResizeDetector<HTMLDivElement>()
  return { ref, height }
}
