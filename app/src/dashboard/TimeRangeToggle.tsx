import * as React from 'react'

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
}

export default function TimeRangeToggle({ value, onChange }: Props) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3 }}>
      {TIME_RANGE_OPTIONS.map(option => (
        <button
          key={option.value}
          type="button"
          onClick={() => onChange(option.value)}
          style={{
            padding: '1px 6px',
            fontSize: 11,
            flex: '0 0 auto',
            borderRadius: 'var(--cmom-radius-sm, 4px)',
            border: '1px solid var(--cmom-border-strong, rgba(128,128,128,0.4))',
            backgroundColor: option.value === value ? 'var(--cmom-accent, #1976d2)' : 'transparent',
            color: option.value === value ? '#fff' : 'inherit',
            cursor: 'pointer',
          }}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}
