import * as React from 'react'
import { ManholeRecord } from '../useManholeInfo'

interface Props {
  info: ManholeRecord | undefined
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  if (value === null || value === undefined || value === '') return null
  return (
    <>
      <span className="cmom-label">{label}:</span>
      <span>{value}</span>
    </>
  )
}

/**
 * Manhole + flow meter attributes for this site — see useManholeInfo.ts for
 * the join. Data is owned and edited in the anomaly-detection repo
 * (flow_monitors/manhole_data.json) and published to this app over MQTT
 * (flow_monitors/manhole_info/{flowMeterId}) — nothing here hardcodes
 * values. Same label/value grid styling as FlowMonitorDetail's own
 * Site Attributes card (.cmom-device-card-details) for visual consistency.
 */
export default function ManholeInfoCard({ info }: Props) {
  if (!info) {
    return <div style={{ opacity: 0.7 }}>No manhole/flow meter record found for this site yet.</div>
  }

  return (
    <div className="cmom-device-card-details">
      <Row label="Manhole Facility ID" value={info.manholeFacilityId} />
      <Row label="Manhole Install Date" value={info.manholeInstallDate} />
      <Row label="Manhole Access Diameter" value={info.manholeAccessDiameter !== null ? `${info.manholeAccessDiameter} in` : undefined} />
      <Row label="Manhole Depth" value={info.manholeDepthFt !== null ? `${info.manholeDepthFt.toFixed(1)} ft` : undefined} />
      <Row label="Rim Elevation" value={info.rimElevation !== null ? info.rimElevation.toFixed(2) : undefined} />
      <Row
        label="X, Y"
        value={info.manholeX !== null && info.manholeY !== null ? `${info.manholeX.toFixed(5)}, ${info.manholeY.toFixed(5)}` : undefined}
      />
      <Row label="Flow Meter Object ID" value={info.flowMeterObjectId} />
      <Row label="Flow Meter ID" value={info.flowMeterId} />
      <Row label="WRRF Basin" value={info.wrrfBasin} />
      <Row label="Flow Meter Install Date" value={info.flowMeterInstallDate} />
      <Row label="Flow Meter Status" value={info.flowMeterStatus} />
      <Row label="Flow Meter Location" value={info.flowMeterLocationDesc} />
    </div>
  )
}
