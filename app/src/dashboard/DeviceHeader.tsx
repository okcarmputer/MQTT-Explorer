import * as React from 'react'
import './dashboard.css'

interface Props {
  // The two-part device title, rendered uppercase and joined with an em
  // dash. Pump stations pass [Description, Location]; flow monitors pass
  // [Location, Site Name]. Empty/missing parts are dropped rather than
  // leaving a dangling separator.
  // `unknown` rather than `string` because callers feed it straight from
  // untyped MQTT payload field maps (summary.unitStatus, site info) — the
  // String() coercion below is what makes that safe.
  titleParts: unknown[]
  // Serial (pump stations) or site number (flow monitors) — the stable
  // identifier, shown uppercase and subordinate beneath the title.
  identifier: string
  onBack: () => void
  // Optional trailing content (status chips, view toggles) pinned to the
  // header's right edge, vertically centered against the title block.
  actions?: React.ReactNode
  // Optional KPI strip rendered below the identifier, still inside the fixed
  // title area — see widgets/FlowKpiRow.tsx. Kept out of the draggable
  // PanelGrid below deliberately, so it can't be dragged/resized/hidden.
  kpiRow?: React.ReactNode
}

/**
 * The single device-page header: compact back button on its own line at the
 * top left, then a large uppercase two-part title, then the uppercase
 * identifier beneath it.
 *
 * Replaces the per-page inline header that every detail page previously
 * hand-rolled — a full-width `<button>` stretched across the page (its
 * default block width, since nothing constrained it) above an `<h2>` that
 * put the identifier on the left and the description on the far right. Both
 * the width and the left/right split are what this fixes: the back control
 * is now sized to its own content, and the title/identifier read as one
 * left-aligned hierarchy.
 */
export default function DeviceHeader({ titleParts, identifier, onBack, actions, kpiRow }: Props) {
  const title = titleParts
    .map(part => (part === undefined || part === null ? '' : String(part).trim()))
    .filter(Boolean)
    .join(' — ')

  return (
    <div className="cmom-device-header">
      {/* Back button + device name/location share one row now — the name
          shrinks (via container-query font sizing, see dashboard.css)
          rather than wrapping under the button or getting clipped. */}
      <div className="cmom-device-header__bar">
        <button type="button" className="cmom-back-button" onClick={onBack}>
          <span aria-hidden="true">&larr;</span> Back
        </button>
        {title ? <h1 className="cmom-device-header__title">{title}</h1> : null}
        {actions ? <div className="cmom-device-header__actions">{actions}</div> : null}
      </div>
      {/* Identifier (serial/site number) + the KPI strip share the second
          row — chips are sized to their own content (see .cmom-kpi-chip),
          never clipped. */}
      <div className="cmom-device-header__titlerow">
        <div className="cmom-device-header__identifier">{identifier}</div>
        {kpiRow}
      </div>
    </div>
  )
}
