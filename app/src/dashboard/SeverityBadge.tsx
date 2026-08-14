import * as React from 'react'
import { Severity, severityColors } from './config'

export default function SeverityBadge({ severity }: { severity: Severity }) {
  return (
    <span
      className="cmom-badge"
      style={{
        minWidth: 84,
        textAlign: 'center',
        color: severityColors[severity],
      }}
    >
      {severity}
    </span>
  )
}
