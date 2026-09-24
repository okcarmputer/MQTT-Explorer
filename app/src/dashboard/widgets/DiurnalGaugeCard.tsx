import * as React from 'react'
import DiurnalBarChart, { DIURNAL_SERIES } from './DiurnalBarChart'
import { DiurnalAnomaly, DiurnalMeasurementType, DIURNAL_MEASUREMENT_TYPES } from '../useDiurnalAnomalies'

// Flow reads 'MGD' here, not the live channel's own 'gpm' — this card's
// values (normDiurnal/avgDiurnal from SQL, plus the gpmToMgd-converted live
// measurement FlowMonitorDetail now passes in) are all MGD, matching
// Flow_Monitor_Diurnal_Anomalies. See config.ts's gpmToMgd comment.
const CHANNEL_UNIT: Record<DiurnalMeasurementType, string> = {
  Flow: 'MGD',
  Level: 'in',
  Velocity: 'fps',
}

interface Props {
  diurnalByType: Record<DiurnalMeasurementType, DiurnalAnomaly | undefined>
  // Caps the Level channel's bar scale to the pipe's real diameter, same
  // range TrendPanel's Level chart uses — so that bar reads against the
  // pipe's actual capacity instead of an arbitrary scale.
  pipeDiameterValue?: number
  // The *live* Level/Velocity/Flow reading (same value the KPI header row
  // shows), keyed by measurement type — used for the "measurement" bar
  // instead of the diurnal detector's own measurementValue. The detector
  // only re-publishes on its own cycle (see diurnal_detector.py), so its
  // measurementValue can sit minutes-to-hours behind the channel's actual
  // latest reading; comparing that stale number against normDiurnal/
  // avgDiurnal read as "the chart disagrees with the live value" even
  // though both were correct for their own moment. The live value is always
  // current, so it's what gets compared against the normalized/average bars.
  liveValueByType: Record<DiurnalMeasurementType, number | undefined>
  liveMeasuredAtByType: Record<DiurnalMeasurementType, Date | undefined>
}

function channelMax(
  data: DiurnalAnomaly | undefined,
  liveValue: number | undefined,
  isLevel: boolean,
  pipeDiameterValue: number | undefined
): number {
  if (isLevel && pipeDiameterValue) return pipeDiameterValue
  const values = [data?.normDiurnal, data?.avgDiurnal, liveValue].filter((v): v is number => v !== undefined && !Number.isNaN(v))
  return values.length > 0 ? Math.max(...values) * 1.25 : 1
}

function measurementReadout(liveValue: number | undefined, measuredAt: Date | undefined, unit: string): string | undefined {
  if (liveValue === undefined || Number.isNaN(liveValue)) return undefined
  return `${liveValue.toFixed(1)} ${unit}${measuredAt ? ` as of ${measuredAt.toLocaleString()}` : ''}`
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
export default function DiurnalGaugeCard({ diurnalByType, pipeDiameterValue, liveValueByType, liveMeasuredAtByType }: Props) {
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
          const liveValue = liveValueByType[type]
          const isLevel = type === 'Level'
          const unit = CHANNEL_UNIT[type]
          return (
            <DiurnalBarChart
              key={type}
              title={type}
              unit={unit}
              values={{ normalized: data?.normDiurnal, average: data?.avgDiurnal, measurement: liveValue }}
              max={channelMax(data, liveValue, isLevel, pipeDiameterValue)}
              measurementReadout={measurementReadout(liveValue, liveMeasuredAtByType[type], unit)}
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
