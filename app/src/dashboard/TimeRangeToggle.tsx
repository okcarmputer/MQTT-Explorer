import * as React from 'react'
import { SegmentedControl } from './widgets/Controls'

export interface TimeRangeOption {
  label: string
  // parse-duration compatible string, consumed directly by TopicPlot's timeInterval prop.
  value: string
}

// Empty string is the "All time" sentinel — TopicPlot/TrendPanel treat it as
// no timeInterval at all, i.e. no start-time filtering (see TrendPanel).
export const ALL_TIME_VALUE = ''

export const TIME_RANGE_OPTIONS: TimeRangeOption[] = [
  { label: '1min', value: '1m' },
  { label: '5min', value: '5m' },
  { label: '30min', value: '30m' },
  { label: '1hr', value: '1h' },
  { label: '6hr', value: '6h' },
  { label: '24hr', value: '24h' },
  { label: 'All', value: ALL_TIME_VALUE },
]

export const DEFAULT_TIME_RANGE = '30m'

interface Props {
  value: string
  onChange: (value: string) => void
  options?: TimeRangeOption[]
}

export default function TimeRangeToggle({ value, onChange, options }: Props) {
  // Delegates to the shared SegmentedControl rather than carrying its own
  // inline-styled buttons, so chart time ranges and page filters are one
  // control with one set of states. `dense` keeps the in-card size it had.
  return (
    <SegmentedControl
      ariaLabel="Chart time range"
      dense
      value={value}
      onChange={onChange}
      options={options ?? TIME_RANGE_OPTIONS}
    />
  )
}
