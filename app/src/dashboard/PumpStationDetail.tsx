import * as React from 'react'
import * as q from '../../../backend/src/Model'
import TrendPanel from './TrendPanel'
import DigitalInputRow from './DigitalInputRow'
import DeviceHeader from './DeviceHeader'
import { readGroupFields, readLeafValue } from './pumpStationLeaf'
import { usePumpStationSummary, resolveWetWellLevelFt } from './usePumpStationSummary'
import { useSqlWetWellInfo } from './useSqlWetWellInfo'
import WetWellTankGauge from './widgets/WetWellTankGauge'
import { RuntimeClock } from './widgets/Readings'
import PanelGrid, { PanelSpec } from './widgets/PanelGrid'
import { useFitRowHeight } from './widgets/useFitRowHeight'
import { buildPumpStationLayout, layoutKindFor } from './pumpStationLayout'
import PumpKpiRow from './widgets/PumpKpiRow'
import { severityFromPayload } from './config'

interface Props {
  deviceKey: string
  deviceNode: q.TreeNode<any>
  onBack: () => void
}

// "AnalogInput3" -> "Analog Input 3: <description>" — drops the raw
// "AnalogInputs/AnalogInputX (...)" topic-path formatting in favor of a
// human-readable label. Falls back to the raw key if it doesn't match the
// expected AnalogInput<N> shape.
function formatAnalogInputTitle(key: string, description: string): string {
  const match = key.match(/^AnalogInput(\d+)$/i)
  const label = match ? `Analog Input ${match[1]}` : key
  return description ? `${label}: ${description}` : label
}

// Same label:value list style as ManholeInfoCard.tsx's own Row —
// .cmom-device-card-details (a two-column label/value grid, one row per
// field) reads as a scannable list rather than a wall of separate bubbles,
// which is the point: wet well info and unit status both have many small
// fields, and a list keeps them easy to skim instead of hunting across a
// grid of cards. Skips rendering entirely for a null/undefined/empty value
// (matches ManholeInfoCard's Row) rather than showing an empty "—" row.
function Row({ label, value, source }: { label: string; value: React.ReactNode; source?: string }) {
  if (value === null || value === undefined || value === '') return null
  return (
    <>
      <span className="cmom-label">{label}:</span>
      <span>
        {value}
        {source && <span style={{ fontSize: 10, opacity: 0.5, fontStyle: 'italic', marginLeft: 6 }}>({source})</span>}
      </span>
    </>
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
  // Prefer an analog input literally labeled "Wet Well Level" (matches the
  // SQL side's `Description LIKE '%Wet Well Level%'`) over any looser
  // "level" match, in case a station has more than one.
  const levelInput =
    summary.analogInputs.find(a => a.label.toLowerCase().includes('wet well level')) ??
    summary.analogInputs.find(a => a.label.toLowerCase().includes('level'))

  // One authoritative current level shared by the gauge and everything else
  // on this page — live MQTT first, SQL only as a fallback. See
  // resolveWetWellLevelFt's own comment for why that ordering is the fix for
  // the gauge going stale while the chart kept moving.
  const currentLevelFt = React.useMemo(
    () => resolveWetWellLevelFt(summary, wetWell?.currentLevelFt),
    [summary, wetWell?.currentLevelFt]
  )
  const levelSeverity = severityFromPayload(levelInput?.node.edges['anomaly']?.target?.message?.payload?.toUnicodeString())

  // Read directly here (rather than through ValuePanel) since these now
  // live in the fixed KPI header row instead of their own PanelGrid card —
  // see PumpKpiRow's `power` prop.
  const acPowerValue = readLeafValue(acPowerVoltsNode)
  const batteryValue = readLeafValue(batteryVoltsNode)
  const temperatureValue = readLeafValue(temperatureValueNode)

  // Placement comes from the explicit per-analog-count layouts in
  // pumpStationLayout.ts rather than being packed at render time, so the
  // specified card-to-card alignments actually hold. See that module's header.
  const layout = React.useMemo(() => buildPumpStationLayout(analogInputs.length), [analogInputs.length])
  const layoutKind = layoutKindFor(analogInputs.length)
  const { ref: fitRef, rowHeight } = useFitRowHeight(layout.totalRows, 32)

  return (
    <div style={{ padding: 'var(--cmom-space-4, 16px)', height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <DeviceHeader
        titleParts={[summary.unitStatus['Description'], summary.unitStatus['Location']]}
        identifier={deviceKey}
        onBack={onBack}
        kpiRow={
          <PumpKpiRow
            summary={summary}
            currentLevelFt={currentLevelFt}
            wetWellDepthFt={wetWell?.depthFt}
            levelSeverity={levelSeverity}
            acPowerVolts={acPowerValue}
            batteryVolts={batteryValue}
            temperature={temperatureValue}
          />
        }
      />

      <div ref={fitRef} style={{ flex: '1 1 auto', minHeight: 0, overflow: 'auto' }}>
      {(() => {
        const analogPanels: PanelSpec[] = analogInputs.map((a, i) => {
          const scaledValueNode = a.node.edges['ScaledValue']?.target
          const panel: PanelSpec = {
            id: `analog-${a.key}`,
            title: formatAnalogInputTitle(a.key, a.json.Description),
            defaultLayout: layout.analog[i],
            content: scaledValueNode ? (
              <TrendPanel
                title={formatAnalogInputTitle(a.key, a.json.Description)}
                node={scaledValueNode}
                dotPath="value"
                unit={a.json.ScaledUnits}
                stateDescription={a.json.StateDescription}
                defaultTimeRange="24h"
                hideTimeRangeToggle
                fillHeight
                bare
              />
            ) : (
              <div style={{ opacity: 0.7 }}>No ScaledValue reported yet.</div>
            ),
          }
          return panel
        })
        const analogInputsPlaceholder: PanelSpec[] =
          analogInputs.length === 0 && layout.analogPlaceholder
            ? [
                {
                  id: 'analog-inputs-empty',
                  title: 'Analog Inputs',
                  defaultLayout: layout.analogPlaceholder,
                  content: <div style={{ opacity: 0.7 }}>No named, non-channel analog inputs configured.</div>,
                },
              ]
            : []

        const panels: PanelSpec[] = [
          {
            id: 'wet-well-gauge',
            title: 'Wet Well',
            defaultLayout: layout.fixed['wet-well-gauge'],
            content: (
              <div style={{ height: '100%' }}>
                <WetWellTankGauge
                  title={levelInput?.label || 'Wet Well Level'}
                  shape={wetWell?.shape ?? null}
                  volumeGallons={wetWell?.volumeGallons ?? null}
                  diameterFt={wetWell?.diameterFt ?? null}
                  depthFt={wetWell?.depthFt ?? null}
                  lengthFt={wetWell?.lengthFt ?? null}
                  widthFt={wetWell?.widthFt ?? null}
                  currentLevelFt={currentLevelFt ?? null}
                  material={wetWell?.material ?? null}
                />
              </div>
            ),
          },
          ...analogPanels,
          ...analogInputsPlaceholder,
        ]

        // Content for these cards is the same regardless of layout — only
        // where/how big they're placed differs between the single-graph and
        // general cases below.
        // Dimension source labeling — dimensionsSource is set by
        // getPumpStationWetWellInfoBatch (src/sqlReporting.ts) to whichever of
        // the two sources actually won (spreadsheet always wins when it has
        // an entry at all); sqlParsedDiameterFt/sqlParsedDepthFt carry the
        // Comments-regex value even when it lost, so an overlap (both
        // sources had an opinion) can be shown instead of silently hidden.
        const dimSourceLabel = wetWell?.dimensionsSource === 'spreadsheet' ? 'Records Spreadsheet' : wetWell?.dimensionsSource === 'sql-comments' ? 'SPUMPSTA (Comments)' : undefined
        const diameterOverlap =
          wetWell?.dimensionsSource === 'spreadsheet' && wetWell.sqlParsedDiameterFt !== null && wetWell.sqlParsedDiameterFt !== wetWell.diameterFt
            ? `SPUMPSTA comments say ${wetWell.sqlParsedDiameterFt.toFixed(1)} ft`
            : undefined
        const depthOverlap =
          wetWell?.dimensionsSource === 'spreadsheet' && wetWell.sqlParsedDepthFt !== null && wetWell.sqlParsedDepthFt !== wetWell.depthFt
            ? `SPUMPSTA comments say ${wetWell.sqlParsedDepthFt.toFixed(1)} ft`
            : undefined

        const wetWellInfoContent = !wetWell ? (
          <div style={{ opacity: 0.7 }}>
            {wetWellInfo?.pending ? 'Loading from SQL…' : 'No GIS/OPC record found for this station.'}
          </div>
        ) : (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 24 }}>
            <div style={{ flex: '1 1 260px', minWidth: 0 }}>
              <div className="cmom-label" style={{ marginBottom: 6 }}>
                From SQL (SPUMPSTA / OPCAudit_Live)
              </div>
              {wetWellInfo?.pending && <div style={{ opacity: 0.7, fontSize: 12 }}>Loading from SQL…</div>}
              <div className="cmom-device-card-details">
                <Row label="Facility ID" value={wetWell.facilityId} />
                <Row label="Facility Name" value={wetWell.facilityName} />
                <Row label="Station Type" value={wetWell.stationType} />
                <Row label="Basin" value={wetWell.basin} />
                <Row label="Sub-Basin" value={wetWell.subBasin} />
                <Row label="Wet Well Material" value={wetWell.material} />
                <Row label="Dry Well Material" value={wetWell.dryWellMaterial} />
                <Row label="Pump Count" value={wetWell.stationPumpCount} />
                <Row
                  label="Design Capacity"
                  value={wetWell.stationDesignCapacity !== null ? `${wetWell.stationDesignCapacity} gpm` : undefined}
                />
                <Row
                  label="Wet Well Volume"
                  value={wetWell.volumeGallons !== null ? `${Math.round(wetWell.volumeGallons).toLocaleString()} gal` : undefined}
                />
                <Row label="Elevation at Bottom" value={wetWell.elevationAtBottom} />
                <Row label="OPC Serial Number" value={wetWell.opcSerialNumber} />
                <Row label="OPC Station Name" value={wetWell.opcStationName} />
                <Row
                  label="Level Last Seen"
                  value={wetWell.levelLastSeenAt ? new Date(wetWell.levelLastSeenAt).toLocaleString() : undefined}
                />
                <Row label="Comments" value={wetWell.comments} />
              </div>
            </div>

            <div style={{ flex: '1 1 260px', minWidth: 0 }}>
              <div className="cmom-label" style={{ marginBottom: 6 }}>
                Dimensions {dimSourceLabel ? `— ${dimSourceLabel}` : ''}
              </div>
              {!dimSourceLabel ? (
                <div style={{ opacity: 0.7, fontSize: 12 }}>
                  We don&apos;t have dimensions for this wet well yet, from SQL or the records spreadsheet.
                </div>
              ) : (
                <div className="cmom-device-card-details">
                  <Row
                    label="Diameter"
                    value={wetWell.diameterFt !== null ? `${wetWell.diameterFt.toFixed(1)} ft` : undefined}
                    source={diameterOverlap}
                  />
                  <Row
                    label="Depth"
                    value={wetWell.depthFt !== null ? `${wetWell.depthFt.toFixed(1)} ft` : undefined}
                    source={depthOverlap}
                  />
                  <Row label="Length" value={wetWell.lengthFt !== null ? `${wetWell.lengthFt.toFixed(1)} ft` : undefined} />
                  <Row label="Width" value={wetWell.widthFt !== null ? `${wetWell.widthFt.toFixed(1)} ft` : undefined} />
                  <Row
                    label="Capacity"
                    value={wetWell.capacityGallons !== null ? `${Math.round(wetWell.capacityGallons).toLocaleString()} gal` : undefined}
                  />
                </div>
              )}
            </div>
          </div>
        )

        const unitStatusContent =
          unitStatusEntries.length === 0 ? (
            <div style={{ opacity: 0.7 }}>No UnitStatus payload seen yet.</div>
          ) : (
            <div className="cmom-device-card-details">
              {unitStatusEntries.map(([key, value]) => {
                const asDate = tryParseTimestamp(key, value)
                const display = asDate
                  ? formatFriendlyDateTime(asDate, siteTimeZone)
                  : typeof value === 'object' && value !== null
                    ? JSON.stringify(value)
                    : String(value)
                return <Row key={key} label={key} value={display} />
              })}
            </div>
          )

        const pumpRuntimesContent =
          summary.pumpRuntimes.length === 0 ? (
            <div style={{ opacity: 0.7 }}>No pump runtime data reported yet.</div>
          ) : (
            <div className="cmom-card-row">
              {summary.pumpRuntimes.map(r => (
                <div key={r.key} className="cmom-card" style={{ padding: '10px 12px' }}>
                  <div className="cmom-label" style={{ marginBottom: 6 }}>
                    {r.label}
                  </div>
                  <RuntimeClock label={`${r.label} today`} minutes={`${r.today} today / ${r.yesterday} yest.`} starts={r.hourlyStart} />
                </div>
              ))}
            </div>
          )

        // A Digital Inputs row's alarm description used to wrap across
        // multiple lines whenever a label happened to be long (e.g. "High
        // Wet Well Alarm (Level Controller)") if given too little width —
        // see DigitalInputRow.tsx for the matching label/description sizing
        // fix that makes half-width (the single-graph layout) workable too.
        const digitalInputsContent =
          digitalInputs.length === 0 ? (
            <div style={{ opacity: 0.7 }}>No active (non-spare) digital inputs configured.</div>
          ) : (
            <div style={{ border: '1px solid var(--cmom-border, rgba(128,128,128,0.15))', borderRadius: 'var(--cmom-radius-sm, 4px)' }}>
              {digitalInputs.map(d => (
                <DigitalInputRow key={d.key} diKey={d.key} name={d.json.Description} node={d.node} />
              ))}
            </div>
          )

        // Row 2 and the right-hand column both come straight from the chosen
        // layout. None of these are autoHeight: these layouts specify cards
        // that must match each other's heights ("the stacked pair equals the
        // cards beside it", "Digital Inputs' bottom aligns with the charts"),
        // and per-card content measurement actively fought those constraints
        // — it was also the feedback loop behind cards drifting on every live
        // update. Content taller than its card scrolls inside the card.
        panels.push(
          {
            id: 'digital-inputs',
            title: 'Digital Inputs',
            defaultLayout: layout.fixed['digital-inputs'],
            content: digitalInputsContent,
          },
          {
            id: 'wet-well-info',
            title: 'Wet Well Info',
            defaultLayout: layout.fixed['wet-well-info'],
            content: wetWellInfoContent,
          },
          {
            id: 'unit-status',
            title: 'Unit Status',
            defaultLayout: layout.fixed['unit-status'],
            content: unitStatusContent,
          },
          {
            id: 'pump-runtimes',
            title: 'Pump Runtimes',
            defaultLayout: layout.fixed['pump-runtimes'],
            content: pumpRuntimesContent,
          }
        )

        // Storage key is per layout kind, not one key for every pump station.
        // Sharing a single key was what made cards appear to wander: a saved
        // arrangement from a 3-analog station satisfied loadLayout's "has an
        // entry for every current panel" check on a 2-analog station, so the
        // smaller station silently inherited the larger one's positions, got
        // corrected, and wrote the correction back — each station undoing the
        // last. Keyed by kind, a station only ever restores an arrangement
        // authored for its own shape.
        return (
          <PanelGrid
            storageKey={`cmom-layout-pump-station-detail-v3-${layoutKind}`}
            panels={panels}
            rowHeight={rowHeight}
          />
        )
      })()}
      </div>
    </div>
  )
}
