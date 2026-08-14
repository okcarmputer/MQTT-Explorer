export interface Point {
  x: number
  y: number
}

export interface Tooltip {
  value: Array<TooltipRows>
  point: Point
  element: Element | null
  // Cursor position in viewport coordinates, when available — lets the
  // tooltip anchor near the pointer instead of a fixed spot on the chart
  // container, which can land off-screen for charts near the page edge.
  clientX?: number
  clientY?: number
}

export interface TooltipRows {
  title: React.ReactElement
  value: React.ReactElement
}
