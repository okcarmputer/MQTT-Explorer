import * as React from 'react'

export interface TimeRangeOption {
  label: string
  // parse-duration compatible string, consumed directly by TopicPlot's timeInterval prop.
  value: string
}

export const TIME_RANGE_OPTIONS: TimeRangeOption[] = [
  { label: '1h', value: '1h' },
  { label: '24h', value: '24h' },
  { label: '1w', value: '7d' },
  { label: '1m', value: '30d' },
  { label: '1y', value: '365d' },
]

export const DEFAULT_TIME_RANGE = '24h'

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
