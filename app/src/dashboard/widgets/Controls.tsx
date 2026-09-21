import * as React from 'react'
import '../dashboard.css'

export interface SegmentOption<T extends string> {
  label: string
  value: T
}

interface SegmentedProps<T extends string> {
  options: SegmentOption<T>[]
  value: T
  onChange: (value: T) => void
  // Tightens padding/type size for use inside a card header (chart time
  // ranges) rather than a page-level filter bar.
  dense?: boolean
  ariaLabel?: string
}

/**
 * The dashboard's one segmented filter control — a row of mutually exclusive
 * options with a clear selected state.
 *
 * Rendered as a real radiogroup rather than styled `<div>`s: arrow keys move
 * between options, the selected one is the only tab stop, and screen readers
 * announce it as a group of radios. That is what makes it keyboard accessible
 * in the sense the ticket asks for — a row of clickable buttons technically
 * takes focus but gives no indication the options are related or exclusive.
 *
 * Replaces both the inline-styled buttons in TimeRangeToggle and the bare
 * native `<select>` the device grids used for severity.
 */
export function SegmentedControl<T extends string>({ options, value, onChange, dense, ariaLabel }: SegmentedProps<T>) {
  const refs = React.useRef<Array<HTMLButtonElement | null>>([])

  const move = (from: number, delta: number) => {
    const next = (from + delta + options.length) % options.length
    onChange(options[next].value)
    refs.current[next]?.focus()
  }

  const onKeyDown = (e: React.KeyboardEvent, index: number) => {
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
      e.preventDefault()
      move(index, 1)
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
      e.preventDefault()
      move(index, -1)
    } else if (e.key === 'Home') {
      e.preventDefault()
      move(index, -index)
    } else if (e.key === 'End') {
      e.preventDefault()
      move(index, options.length - 1 - index)
    }
  }

  return (
    <div
      className={`cmom-segmented${dense ? ' cmom-segmented--dense' : ''}`}
      role="radiogroup"
      aria-label={ariaLabel}
    >
      {options.map((option, index) => {
        const selected = option.value === value
        return (
          <button
            key={option.value}
            ref={el => {
              refs.current[index] = el
            }}
            type="button"
            role="radio"
            aria-checked={selected}
            tabIndex={selected ? 0 : -1}
            className={`cmom-segmented__option${selected ? ' is-selected' : ''}`}
            onClick={() => onChange(option.value)}
            onKeyDown={e => onKeyDown(e, index)}
          >
            {option.label}
          </button>
        )
      })}
    </div>
  )
}

interface FilterFieldProps {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  ariaLabel?: string
}

/** Text filter input, styled to the dashboard's tokens. */
export function FilterField({ value, onChange, placeholder, ariaLabel }: FilterFieldProps) {
  return (
    <div className="cmom-filter-field">
      <input
        className="cmom-filter-field__input"
        type="search"
        value={value}
        placeholder={placeholder}
        aria-label={ariaLabel ?? placeholder}
        onChange={e => onChange(e.target.value)}
      />
      {value ? (
        <button
          type="button"
          className="cmom-filter-field__clear"
          aria-label="Clear filter"
          onClick={() => onChange('')}
        >
          ×
        </button>
      ) : null}
    </div>
  )
}
