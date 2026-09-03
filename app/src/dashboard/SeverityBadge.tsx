import * as React from 'react'
import { Severity, severityColors } from './config'

interface Props {
  severity: Severity
  // Prefixed onto the badge text, e.g. "Monthly" -> "Monthly: OK" — so the
  // badge reads as a specific signal ("this is the monthly detector's
  // verdict") rather than an unexplained status dot that never seems to
  // change. Omit to keep the bare severity word.
  label?: string
  // Tooltip (native title attr) giving the detail behind the label, e.g.
  // when the underlying topic last published — since the badge itself only
  // has room for the word.
  title?: string
}

export default function SeverityBadge({ severity, label, title }: Props) {
  return (
    <span
      className="cmom-badge"
      title={title}
      style={{
        minWidth: 84,
        textAlign: 'center',
        color: severityColors[severity],
      }}
    >
      {label ? `${label}: ${severity}` : severity}
    </span>
  )
}
