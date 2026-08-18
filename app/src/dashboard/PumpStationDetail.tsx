import * as React from 'react'
import * as q from '../../../backend/src/Model'
import TrendPanel from './TrendPanel'
import ValuePanel from './ValuePanel'
import DigitalInputRow from './DigitalInputRow'
import { readGroupFields } from './pumpStationLeaf'
import { usePumpStationSummary } from './usePumpStationSummary'
import { useSqlWetWellInfo } from './useSqlWetWellInfo'
import WetWellTankGauge from './widgets/WetWellTankGauge'
import { RuntimeClock } from './widgets/Readings'

interface Props {
  deviceKey: string
  deviceNode: q.TreeNode<any>
  onBack: () => void
}

function StatusField({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="cmom-card" style={{ padding: '8px 10px', minWidth: 0 }}>
      <div
        style={{
          fontSize: 10,
          fontWeight: 600,
          opacity: 0.6,
          textTransform: 'uppercase',
          letterSpacing: '0.04em',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
      >
        {label}
      </div>
      <div className="cmom-value" style={{ marginTop: 3 }}>
        {value ?? '—'}
      </div>
    </div>
  )
}

function ordinalSuffix(day: number): string {
  if (day >= 11 && day <= 13) return 'th'
  switch (day % 10) {
    case 1:
      return 'st'
    case 2:
      return 'nd'
    case 3:
      return 'rd'
    default:
      return 'th'
  }
}

// UnitStatus carries its own "Timezone" field (the OPC/RTU site's
// timezone — see logger.py's NODE_TREE) which is NOT the same as either
// the broker's timezone or the browser viewing this dashboard's timezone.
// Every other timestamp field on this same UnitStatus is a true UTC
// instant (epoch, or an ISO string with an explicit offset/"Z"), so
// formatting it with plain Date getters (which read the *browser's* local
// zone) silently shows the wrong wall-clock time whenever the viewer isn't
// in the same zone as the site. This resolves whatever shape "Timezone"
// turns out to be (an IANA name like "America/New_York", or a raw
// UTC-offset-in-minutes like flow monitors' site_info UTC Offset field —
// the schema isn't documented anywhere in this repo) into an actual
// display, so every UnitStatus timestamp always reads as the site's own
// local time, not whichever machine happens to be looking at it.
function resolveSiteTimeZone(rawTimezone: unknown): { ianaZone?: string; offsetMinutes?: number } {
  if (typeof rawTimezone === 'string' && rawTimezone.trim() !== '') {
    // A plausible IANA zone name ("America/New_York", "US/Eastern", "UTC")
    // — verify it's actually usable before trusting it, since a garbage
    // string would otherwise throw inside Intl.DateTimeFormat later.
    try {
      new Intl.DateTimeFormat('en-US', { timeZone: rawTimezone })
      return { ianaZone: rawTimezone }
    } catch {
      // fall through — maybe it's a numeric offset formatted as a string
    }
  }

  const offsetMinutes = Number(rawTimezone)
  if (!Number.isNaN(offsetMinutes) && rawTimezone !== '' && rawTimezone !== null && rawTimezone !== undefined) {
    return { offsetMinutes }
  }

  return {}
}

// "August 6th, 2026 at 1:27PM" — friendlier than a raw epoch/ISO value for
// any UnitStatus field that reads as a timestamp, rendered in the site's
// own timezone (see resolveSiteTimeZone) rather than the viewer's.
function formatFriendlyDateTime(date: Date, siteTimeZone: { ianaZone?: string; offsetMinutes?: number }): string {
  if (siteTimeZone.ianaZone) {
    const formatted = new Intl.DateTimeFormat('en-US', {
      timeZone: siteTimeZone.ianaZone,
      month: 'long',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    }).format(date)
    // Intl gives "August 6, 2026 at 1:27 PM" — swap in the ordinal suffix
    // and drop the space before AM/PM to match this app's existing style.
    return formatted.replace(/(\d+),/, (_, day) => `${day}${ordinalSuffix(Number(day))},`).replace(' PM', 'PM').replace(' AM', 'AM')
  }

  // No IANA name (or none resolvable) — shift the instant by the raw
  // UTC-offset-in-minutes ourselves, then read it back with UTC getters
  // (never local getters, which would apply the *browser's* zone on top of
  // this shift and double-count the offset).
  const shifted =
    siteTimeZone.offsetMinutes !== undefined ? new Date(date.getTime() + siteTimeZone.offsetMinutes * 60_000) : date
  const getMonth = siteTimeZone.offsetMinutes !== undefined ? shifted.getUTCMonth() : shifted.getMonth()
  const getDate = siteTimeZone.offsetMinutes !== undefined ? shifted.getUTCDate() : shifted.getDate()
  const getYear = siteTimeZone.offsetMinutes !== undefined ? shifted.getUTCFullYear() : shifted.getFullYear()
  const getHours = siteTimeZone.offsetMinutes !== undefined ? shifted.getUTCHours() : shifted.getHours()
  const getMinutes = siteTimeZone.offsetMinutes !== undefined ? shifted.getUTCMinutes() : shifted.getMinutes()

  const monthName = new Date(2000, getMonth, 1).toLocaleString('en-US', { month: 'long' })
  const ampm = getHours >= 12 ? 'PM' : 'AM'
  const hours12 = getHours % 12 || 12
  const minutesStr = getMinutes.toString().padStart(2, '0')
  return `${monthName} ${getDate}${ordinalSuffix(getDate)}, ${getYear} at ${hours12}:${minutesStr}${ampm}`
}

// UnitStatus's field list isn't documented anywhere in this repo (it's
// rendered generically — see below), so timestamp fields are detected by
// name/shape rather than assumed to be a specific key. "Timezone" itself
// is excluded even though its name contains "time" — it's the zone
// descriptor, not a timestamp to convert.
function tryParseTimestamp(key: string, value: unknown): Date | undefined {
  const keyLower = key.toLowerCase()
  if (keyLower === 'timezone') {
    return undefined
  }
  if (!keyLower.includes('timestamp') && !keyLower.includes('time') && !keyLower.includes('date')) {
    return undefined
  }

  if (typeof value === 'number') {
    const ms = value > 1e12 ? value : value * 1000 // seconds vs. ms epoch
    const date = new Date(ms)
    return Number.isNaN(date.getTime()) ? undefined : date
  }

  if (typeof value === 'string') {
    const date = new Date(value)
    return Number.isNaN(date.getTime()) ? undefined : date
  }

  return undefined
}

export default function PumpStationDetail({ deviceKey, deviceNode, onBack }: Props) {
  const [, setTick] = React.useState(0)

  // logger.py publishes every UnitStatus/DigitalInput/AnalogInput field as
  // its own leaf topic (see pumpStationLeaf.ts) rather than one JSON blob
  // per group, so there's no single group-level message to subscribe to —
  // poll instead, same as usePumpStationSummary's board-level summary.
  React.useEffect(() => {
    const rerender = () => setTick(t => t + 1)
    deviceNode.onEdgesChange.subscribe(rerender)
    const interval = setInterval(rerender, 2000)
    return () => {
      deviceNode.onEdgesChange.unsubscribe(rerender)
      clearInterval(interval)
    }
  }, [deviceNode])

  const unitStatusNode = deviceNode.edges['UnitStatus']?.target
  const unitStatus = readGroupFields(unitStatusNode)
  // Render every attribute the UnitStatus payload actually carries, rather
  // than a hardcoded subset — the payload's field list isn't documented
  // anywhere in this repo, so this adapts to whatever logger.py publishes.
  const unitStatusEntries = Object.entries(unitStatus).filter(([key]) => key !== undefined)
  const siteTimeZone = React.useMemo(() => resolveSiteTimeZone(unitStatus['Timezone']), [unitStatus['Timezone']])

  const acPowerNode = deviceNode.edges['ACPower']?.target
  const acPowerVoltsNode = acPowerNode?.edges['Volts']?.target
  const batteryNode = deviceNode.edges['BatteryState']?.target
  const batteryVoltsNode = batteryNode?.edges['Volts']?.target

  const digitalGroup = deviceNode.edges['DigitalInputs']?.target
  const digitalInputs = (digitalGroup?.edgeArray ?? [])
    .map(edge => ({ key: edge.name, node: edge.target, json: readGroupFields(edge.target) }))
    .filter(d => {
      const desc = (d.json.Description || '').trim().toLowerCase()
      return desc !== '' && desc !== 'spare'
    })
    .sort((a, b) => a.key.localeCompare(b.key, undefined, { numeric: true }))

  const analogGroup = deviceNode.edges['AnalogInputs']?.target
  const analogInputs = (analogGroup?.edgeArray ?? [])
    .map(edge => ({ key: edge.name, node: edge.target, json: readGroupFields(edge.target) }))
    .filter(a => {
      const desc = (a.json.Description || '').trim().toLowerCase()
      return desc !== '' && !desc.includes('channel')
    })
    .sort((a, b) => a.key.localeCompare(b.key, undefined, { numeric: true }))

  const temperatureNode = deviceNode.edges['Temperature']?.target
  const temperatureValueNode = temperatureNode?.edges['Temperature']?.target

  // Pump runtimes (for the clock widgets) and a "level"-described analog
  // input (for the wet well gauge) both come from the same non-empty-field
  // scan usePumpStationSummary already does for the rest of this page.
  const summary = usePumpStationSummary(deviceNode)
  const wetWellInfo = useSqlWetWellInfo(deviceKey)
  const wetWell = wetWellInfo?.wetWell
  const levelInput = summary.analogInputs.find(a => a.label.toLowerCase().includes('level'))

  return (
    <div style={{ padding: 'var(--cmom-space-4, 16px)', height: '100%', overflow: 'auto' }}>
      <button
        type="button"
        onClick={onBack}
        style={{
          marginBottom: 'var(--cmom-space-3, 12px)',
          padding: '4px 12px',
          borderRadius: 'var(--cmom-radius-sm, 4px)',
          border: '1px solid var(--cmom-border-strong, rgba(128,128,128,0.4))',
          background: 'transparent',
          color: 'inherit',
          cursor: 'pointer',
        }}
      >
        &larr; Back
      </button>
      <h2 style={{ marginTop: 0 }}>
        Serial: <span style={{ fontFamily: 'var(--cmom-font-mono, monospace)' }}>{deviceKey}</span>
      </h2>

      <h3>Analog Inputs</h3>
      {analogInputs.length === 0 ? (
        <div style={{ opacity: 0.7, marginBottom: 20 }}>No named, non-channel analog inputs configured.</div>
      ) : (
        <div className="cmom-trend-grid" style={{ marginBottom: 20 }}>
          {analogInputs.map(a => {
            const scaledValueNode = a.node.edges['ScaledValue']?.target
            return (
              scaledValueNode && (
                <TrendPanel
                  key={a.key}
                  title={`AnalogInputs/${a.key} (${a.json.Description})`}
                  node={scaledValueNode}
                  dotPath="value"
                  unit={a.json.ScaledUnits}
                />
              )
            )
          })}
        </div>
      )}

      <h3>Wet Well</h3>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--cmom-space-3, 12px)', alignItems: 'flex-start', marginBottom: 20 }}>
        <WetWellTankGauge
          title={levelInput?.label || 'Wet Well Level'}
          volumeGallons={wetWell?.volumeGallons ?? null}
          diameterFt={wetWell?.diameterFt ?? null}
          depthFt={wetWell?.depthFt ?? null}
          currentLevelFt={wetWell?.currentLevelFt ?? null}
          material={wetWell?.material ?? null}
        />

        {!wetWell ? (
          <div style={{ opacity: 0.7, alignSelf: 'center' }}>No GIS/OPC record found for this station.</div>
        ) : (
          <div
            className="cmom-card-row"
            style={{
              flex: '1 1 320px',
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))',
              gap: 8,
              alignContent: 'start',
            }}
          >
            <StatusField label="Facility ID" value={wetWell.facilityId} />
            <StatusField label="Facility Name" value={wetWell.facilityName} />
            <StatusField label="Station Type" value={wetWell.stationType} />
            <StatusField label="Basin" value={wetWell.basin} />
            <StatusField label="Sub-Basin" value={wetWell.subBasin} />
            <StatusField label="Wet Well Material" value={wetWell.material} />
            <StatusField label="Dry Well Material" value={wetWell.dryWellMaterial} />
            <StatusField label="Pump Count" value={wetWell.stationPumpCount} />
            <StatusField
              label="Design Capacity"
              value={wetWell.stationDesignCapacity !== null ? `${wetWell.stationDesignCapacity} gpm` : undefined}
            />
            <StatusField label="Elevation at Bottom" value={wetWell.elevationAtBottom} />
            <StatusField label="OPC Serial Number" value={wetWell.opcSerialNumber} />
            <StatusField label="OPC Station Name" value={wetWell.opcStationName} />
            <StatusField
              label="Level Last Seen"
              value={wetWell.levelLastSeenAt ? new Date(wetWell.levelLastSeenAt).toLocaleString() : undefined}
            />
            {wetWell.comments && (
              <div style={{ gridColumn: '1 / -1' }}>
                <StatusField label="Comments" value={wetWell.comments} />
              </div>
            )}
          </div>
        )}
      </div>

      <h3>Pump Runtimes</h3>
      {summary.pumpRuntimes.length === 0 ? (
        <div style={{ opacity: 0.7, marginBottom: 20 }}>No pump runtime data reported yet.</div>
      ) : (
        <div className="cmom-card-row" style={{ marginBottom: 20 }}>
          {summary.pumpRuntimes.map(r => (
            <div key={r.key} className="cmom-card" style={{ padding: '10px 12px' }}>
              <div className="cmom-label" style={{ marginBottom: 6 }}>
                {r.label}
              </div>
              <RuntimeClock label={`${r.label} today`} minutes={`${r.today} today / ${r.yesterday} yest.`} starts={r.hourlyStart} />
            </div>
          ))}
        </div>
      )}

      <h3>Unit Status</h3>
      {unitStatusEntries.length === 0 ? (
        <div style={{ opacity: 0.7, marginBottom: 20 }}>No UnitStatus payload seen yet.</div>
      ) : (
        <div className="cmom-card-row" style={{ marginBottom: 20 }}>
          {unitStatusEntries.map(([key, value]) => {
            const asDate = tryParseTimestamp(key, value)
            const display = asDate
              ? formatFriendlyDateTime(asDate, siteTimeZone)
              : typeof value === 'object' && value !== null
                ? JSON.stringify(value)
                : String(value)
            return <StatusField key={key} label={key} value={display} />
          })}
        </div>
      )}

      <h3>Power &amp; Temperature</h3>
      <div className="cmom-card-row" style={{ marginBottom: 20 }}>
        {acPowerVoltsNode && <ValuePanel title="AC Power" node={acPowerVoltsNode} valuePath="value" unit="V" />}
        {batteryVoltsNode && <ValuePanel title="Battery State" node={batteryVoltsNode} valuePath="value" unit="V" />}
        {temperatureValueNode && <ValuePanel title="Temperature" node={temperatureValueNode} valuePath="value" />}
      </div>

      <h3>Digital Inputs</h3>
      {digitalInputs.length === 0 ? (
        <div style={{ opacity: 0.7, marginBottom: 20 }}>No active (non-spare) digital inputs configured.</div>
      ) : (
        <div style={{ marginBottom: 20, border: '1px solid var(--cmom-border, rgba(128,128,128,0.15))', borderRadius: 'var(--cmom-radius-sm, 4px)' }}>
          {digitalInputs.map(d => (
            <DigitalInputRow key={d.key} label={`DigitalInputs/${d.key} (${d.json.Description})`} node={d.node} />
          ))}
        </div>
      )}
    </div>
  )
}
