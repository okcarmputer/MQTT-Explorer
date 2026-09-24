import { useMemo } from 'react'
import { Props } from '../Chart'
import { Point } from '../Model'

function defaultFor(a: number | undefined, b: number) {
  return a === undefined ? b : a
}

export function useCustomYDomain(props: Props) {
  return useMemo(() => {
    const { data } = props
    const calculatedDomain = domainForData(data)
    const yDomain: [number, number] = props.range
      ? [defaultFor(props.range[0], calculatedDomain[0]), defaultFor(props.range[1], calculatedDomain[1])]
      : calculatedDomain

    return yDomain
  }, [props.data, props.range])
}

function domainForData(data: Array<Point>): [number, number] {
  if (!data[0]) {
    const defaultDomain: [number, number] = [-1, 1]
    return defaultDomain
  }

  let max = data[0].y
  let min = data[0].y

  data.forEach(d => {
    if (max < d.y) {
      max = d.y
    }
    if (min > d.y) {
      min = d.y
    }
  })
  if ((max === 1 || max === 0) && (min === 1 || min === 0)) {
    return [0, 1]
  }
  if (min === max) {
    // min * 0.5 degenerates to a zero-height [0, 0] domain whenever every
    // point sits exactly at 0 (a flat, idle analog input is a common real
    // case, not just synthetic data) — the chart then has no vertical span
    // to draw into at all. A small absolute pad (proportional otherwise)
    // always leaves a real domain.
    const pad = Math.abs(min) * 0.1 || 1
    return [min - pad, min + pad]
  }
  // Pad a bit past the exact min/max so a boundary data point isn't drawn
  // flush against the axis edge — without this, the line's stroke width and
  // the point glyphs' radius visibly spill past the grid at the top/bottom.
  const padding = (max - min) * 0.08
  return [min - padding, max + padding]
}
