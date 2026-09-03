import * as React from 'react'
import DiurnalBarChart, { DIURNAL_SERIES } from './DiurnalBarChart'
import { DiurnalAnomaly, DiurnalMeasurementType, DIURNAL_MEASUREMENT_TYPES } from '../useDiurnalAnomalies'
import { normalizeToUtcIfNoOffset } from '../../helper/extractPayloadTimestamp'

const CHANNEL_UNIT: Record<DiurnalMeasurementType, string> = {
  Flow: 'gpm',
  Level: 'in',
  Velocity: 'fps',
}

interface Props {
  diurnalByType: Record<DiurnalMeasurementType, DiurnalAnomaly | undefined>
  // Caps the Level channel's bar scale to the pipe's real diameter, same
  // range TrendPanel's Level chart uses — so that bar reads against the
  // pipe's actual capacity instead of an arbitrary scale.
  pipeDiameterValue?: number
}

function channelMax(data: DiurnalAnomaly | undefined, isLevel: boolean, pipeDiameterValue: number | undefined): number {
  if (isLevel && pipeDiameterValue) return pipeDiameterValue
  const values = [data?.normDiurnal, data?.avgDiurnal, data?.measurementValue].filter(
    (v): v is number => v !== undefined && !Number.isNaN(v)
  )
  return values.length > 0 ? Math.max(...values) * 1.25 : 1
}

// measurement_time comes straight off the diurnal detector's payload as a
// bare "YYYY-MM-DDTHH:mm:ss" string with no trailing 'Z'/offset — that's a
// UTC instant as far as the device/detector is concerned, but `new Date()`
// on a string like that gets silently reinterpreted as *local* time per the
// JS date-time grammar (same bug this app already hit and fixed once for
// TrendPanel's "measured ..." readout — see extractPayloadTimestamp.ts's own
// comment). Route through the same normalizer here so this card doesn't
// regress the same timezone bug in a second place.
function measurementReadout(data: DiurnalAnomaly | undefined, unit: string): string | undefined {
  if (data?.measurementValue === undefined) return undefined
  const time = data.measurementTime ? new Date(normalizeToUtcIfNoOffset(data.measurementTime)).toLocaleString() : undefined
  return `${data.measurementValue.toFixed(1)} ${unit}${time ? ` as of ${time}` : ''}`
}

/**
 * Replaces the old "Trend vs. CHA baseline (SQL history)" card: instead of a
 * trend line (or the dial-gauge version this itself replaced — its arc color
 * could point past where the fill actually ended, since severity and
 * position were two separately-computed things), this shows where the
 * *current* hour/month sits right now as plain bars — Flow, Level, and
 * Velocity side by side, no tab switching, each with its own three-bar chart
 * (normalized diurnal shape, hour-of-day average, live measurement) and one
 * shared color-key legend below. A bar's height *is* its value, so there's
 * nothing left to get out of sync.
 *
 * Laid out as a 3-column CSS grid (title row / chart row / footer row) so
 * the three channels' charts and footers line up on the same baseline no
 * matter how their title/footer text wraps — a flexbox column-per-channel
 * layout let those drift out of alignment when one channel's text was
 * longer than another's.
 */
export default function DiurnalGaugeCard({ diurnalByType, pipeDiameterValue }: Props) {
  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div
        style={{
          flex: '1 1 auto',
          minHeight: 0,
          display: 'grid',
          gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
          gap: 12,
        }}
      >
        {DIURNAL_MEASUREMENT_TYPES.map(type => {
          const data = diurnalByType[type]
          const isLevel = type === 'Level'
          const unit = CHANNEL_UNIT[type]
          return (
            <DiurnalBarChart
              key={type}
              title={type}
              unit={unit}
              values={{ normalized: data?.normDiurnal, average: data?.avgDiurnal, measurement: data?.measurementValue }}
              max={channelMax(data, isLevel, pipeDiameterValue)}
              measurementReadout={measurementReadout(data, unit)}
            />
          )
        })}
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: 12, marginTop: 8, fontSize: 11 }}>
        {DIURNAL_SERIES.map(s => (
          <span key={s.key} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 2, backgroundColor: s.color }} />
            {s.label}
          </span>
        ))}
      </div>
    </div>
  )
}
