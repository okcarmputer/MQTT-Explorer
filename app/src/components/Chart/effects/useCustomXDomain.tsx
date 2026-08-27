import { useMemo } from 'react'
import { Props } from '../Chart'

export function useCustomXDomain(props: Props): [number, number] | undefined {
  return useMemo(() => {
    if (props.data.length === 0) {
      return undefined
    }

    const xValues = props.data.map(d => d.x)
    const minX = Math.min(...xValues)
    const maxX = Math.max(...xValues)

    const lastDataPoint = [...props.data].sort((a, b) => b.x - a.x)[0]
    const lastDataDate = lastDataPoint ? lastDataPoint.x : Date.now()

    if (props.timeRangeStart) {
      const windowStart = Date.now() - props.timeRangeStart
      // The selected window (e.g. "1hr") doesn't contain any of this
      // topic's actual data — TopicPlot's filter already falls back to
      // showing everything available in that case, so fit the domain to
      // that data's own real extent instead of a fixed "now - N" window
      // that would otherwise clip every point out of view.
      if (maxX < windowStart) {
        return [minX, maxX]
      }
      if (props.centerNow) {
        // "Now" sits at the horizontal midpoint — history fills the left half,
        // the right half is deliberately blank (there's no future data yet).
        const halfRange = props.timeRangeStart / 2
        return [Date.now() - halfRange, Date.now() + halfRange]
      }
      // Custom time range mode
      return [windowStart, lastDataDate]
    }
    // Auto-calculate from data (like react-vis did)
    return [minX, maxX]
  }, [props.data, props.timeRangeStart])
}
