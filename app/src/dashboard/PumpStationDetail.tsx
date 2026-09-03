import * as React from 'react'
import * as q from '../../../backend/src/Model'
import TrendPanel from './TrendPanel'
import ValuePanel from './ValuePanel'
import DigitalInputRow from './DigitalInputRow'
import { readGroupFields } from './pumpStationLeaf'
import { usePumpStationSummary, liveWetWellLevelFt } from './usePumpStationSummary'
import { useSqlWetWellInfo } from './useSqlWetWellInfo'
import WetWellTankGauge from './widgets/WetWellTankGauge'
import { RuntimeClock } from './widgets/Readings'
import PanelGrid, { PanelSpec } from './widgets/PanelGrid'
import { useFitRowHeight } from './widgets/useFitRowHeight'

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

// Splits `totalW` columns evenly across `count` cards in one row — one card
// takes the whole row, two split it in half, etc. — with any leftover
// column (12 doesn't always divide evenly) handed to the first cards rather
// than left as dead space.
function splitWidths(totalW: number, count: number): number[] {
  const base = Math.floor(totalW / count)
  const remainder = totalW - base * count
  return Array.from({ length: count }, (_, i) => base + (i < remainder ? 1 : 0))
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

  // wetWell.currentLevelFt only ever comes from a direct SQL Server read
  // (OPCAudit_Live) — when SQL reporting isn't configured, or that join
  // doesn't resolve for this station, it's always null even though the live
  // MQTT reading (already shown in the Analog Inputs chart above) is right
  // there. Fall back to it so the gauge isn't stuck at "N/A" whenever SQL
  // isn't in the picture. Shared with the list-card mini gauge — see
  // liveWetWellLevelFt in usePumpStationSummary.ts.
  const liveLevelFt = React.useMemo(() => liveWetWellLevelFt(summary), [summary])

  const currentLevelFt = wetWell?.currentLevelFt ?? liveLevelFt

  // Row 1 is reserved for the Wet Well gauge plus one resizable card per
  // Analog Input chart (each fillHeight+bare, same as the Flow Monitor
  // detail page's Level/Velocity/Flow cards) — the gauge keeps its original
  // fixed width (COL_W); analog charts fill whatever's left, wrapping onto
  // additional full-width rows of their own once more than 3 of them show
  // up (3 is what fits next to the gauge at COL_W each). Hoisted above the
  // panels IIFE below (rather than declared inside it) so totalRows can feed
  // useFitRowHeight — the two need to agree on the same row math.
  const ROW1_H = 17
  const COL_W = 3 // matches the Wet Well gauge's original width
  const MIN_GRAPH_W = 3 // narrowest a graph card is allowed to get before wrapping to another row
  const GRAPH_SLOTS_FIRST_ROW = Math.floor((12 - COL_W) / MIN_GRAPH_W) // 3, next to the gauge
  const GRAPH_COLS_PER_FULL_ROW = Math.floor(12 / MIN_GRAPH_W) // 4, once the gauge's row is behind us

  // With exactly one graph, the leftover width next to the gauge is wide
  // enough to waste — Digital Inputs takes that space instead (row 1's
  // third column) rather than sharing row 2 with Wet Well Info/Unit Status.
  const singleGraph = analogInputs.length === 1
  const RIGHT_COL_W = 3

  const analogCount = Math.max(analogInputs.length, 1) // placeholder counts as one slot
  const overflowCount = Math.max(0, analogCount - GRAPH_SLOTS_FIRST_ROW)
  const overflowRows = Math.ceil(overflowCount / GRAPH_COLS_PER_FULL_ROW)
  const graphRowsHeight = ROW1_H * (1 + overflowRows)
  // Row 2's own height is autoHeight-corrected per panel once mounted (see
  // PanelGrid) — this is only a starting estimate so useFitRowHeight has a
  // reasonable totalRows to fit against before that correction happens.
  const ROW2_ESTIMATE_H = 12
  const totalRows = graphRowsHeight + ROW2_ESTIMATE_H
  const { ref: fitRef, rowHeight } = useFitRowHeight(totalRows, 32)

  return (
    <div style={{ padding: 'var(--cmom-space-4, 16px)', height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
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
      <h2 style={{ marginTop: 0, display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
        <span>
          Serial: <span style={{ fontFamily: 'var(--cmom-font-mono, monospace)' }}>{deviceKey}</span>
        </span>
        {Boolean(summary.unitStatus['Description'] || summary.unitStatus['Location']) && (
          <span style={{ fontSize: '0.85em', fontWeight: 700, opacity: 0.95, textAlign: 'right' }}>
            {[summary.unitStatus['Description'], summary.unitStatus['Location']].filter(Boolean).join(' — ')}
          </span>
        )}
      </h2>

      <div ref={fitRef} style={{ flex: '1 1 auto', minHeight: 0, overflow: 'auto' }}>
      {(() => {
        const rowCounts = [Math.min(analogCount, GRAPH_SLOTS_FIRST_ROW)]
        let remaining = analogCount - rowCounts[0]
        while (remaining > 0) {
          const n = Math.min(remaining, GRAPH_COLS_PER_FULL_ROW)
          rowCounts.push(n)
          remaining -= n
        }
        const rowLayouts = rowCounts.map((count, rowIndex) =>
          splitWidths(rowIndex === 0 ? 12 - COL_W : 12, count)
        )

        function graphSlotLayout(index: number): { x: number; y: number; w: number } {
          let remainingIndex = index
          for (let rowIndex = 0; rowIndex < rowCounts.length; rowIndex++) {
            const widths = rowLayouts[rowIndex]
            if (remainingIndex < widths.length) {
              const xOffset = rowIndex === 0 ? COL_W : 0
              const x = xOffset + widths.slice(0, remainingIndex).reduce((a, b) => a + b, 0)
              return { x, y: ROW1_H * rowIndex, w: widths[remainingIndex] }
            }
            remainingIndex -= widths.length
          }
          // Unreachable given rowCounts is built to cover every index, but
          // keeps TypeScript happy about a guaranteed return.
          return { x: COL_W, y: 0, w: MIN_GRAPH_W }
        }

        const analogPanels: PanelSpec[] = analogInputs.map((a, i) => {
          const scaledValueNode = a.node.edges['ScaledValue']?.target
          // Single-graph case: narrower than the general graphSlotLayout
          // would give it (which stretches a lone graph across the whole
          // 12 - COL_W remainder) — leave room on the right for the
          // Pump Runtimes/Power & Temperature/Unit Status stack instead.
          const { x, y, w } = singleGraph
            ? { x: COL_W, y: 0, w: 12 - COL_W - RIGHT_COL_W }
            : graphSlotLayout(i)
          const panel: PanelSpec = {
            id: `analog-${a.key}`,
            title: formatAnalogInputTitle(a.key, a.json.Description),
            defaultLayout: { x, y, w, h: ROW1_H },
            content: scaledValueNode ? (
              <TrendPanel
                title={formatAnalogInputTitle(a.key, a.json.Description)}
                node={scaledValueNode}
                dotPath="value"
                unit={a.json.ScaledUnits}
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
          analogInputs.length === 0
            ? [
                {
                  id: 'analog-inputs-empty',
                  title: 'Analog Inputs',
                  defaultLayout: { x: COL_W, y: 0, w: 12 - COL_W, h: ROW1_H },
                  content: <div style={{ opacity: 0.7 }}>No named, non-channel analog inputs configured.</div>,
                },
              ]
            : []

        const panels: PanelSpec[] = [
          {
            id: 'wet-well-gauge',
            title: 'Wet Well',
            defaultLayout: { x: 0, y: 0, w: COL_W, h: ROW1_H },
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
        // getPumpStationWetWellInfo (src/sqlReporting.ts) to whichever of
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
          <div style={{ opacity: 0.7 }}>No GIS/OPC record found for this station.</div>
        ) : (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 24 }}>
            <div style={{ flex: '1 1 260px', minWidth: 0 }}>
              <div className="cmom-label" style={{ marginBottom: 6 }}>
                From SQL (SPUMPSTA / OPCAudit_Live)
              </div>
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

        const powerTempContent = (
          <div className="cmom-card-row">
            {acPowerVoltsNode && <ValuePanel title="AC Power" node={acPowerVoltsNode} valuePath="value" unit="V" />}
            {batteryVoltsNode && <ValuePanel title="Battery State" node={batteryVoltsNode} valuePath="value" unit="V" />}
            {temperatureValueNode && <ValuePanel title="Temperature" node={temperatureValueNode} valuePath="value" />}
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

        // Row 2: Wet Well Info / Unit Status / (Digital Inputs, only when it
        // didn't already land in row 1's leftover column, see singleGraph
        // below) / Power & Temperature+Pump Runtimes stacked in one column —
        // short, side-by-side columns (evenly split via splitWidths) instead
        // of full-width stacked rows, and every one of them autoHeight so
        // each sizes to its own real content instead of a fixed guess that
        // leaves empty space below it (Power & Temperature/Pump Runtimes
        // used to be a fixed powerTempH=5 regardless of actual content).
        const row2Y = singleGraph ? ROW1_H : graphRowsHeight
        const row2Cols = singleGraph ? 3 : 4
        const row2Widths = splitWidths(12, row2Cols)
        // Cumulative x offset for column i (row2Widths[0] + ... + row2Widths[i-1]).
        const row2X: number[] = []
        for (let i = 0; i < row2Widths.length; i++) {
          row2X.push(i === 0 ? 0 : row2X[i - 1] + row2Widths[i - 1])
        }

        if (singleGraph) {
          // With only one graph, the leftover width next to the gauge in
          // row 1 fits Digital Inputs — so row 2 only needs Wet Well Info /
          // Unit Status / the Power & Temperature+Pump Runtimes stack.
          panels.push({
            id: 'digital-inputs',
            title: 'Digital Inputs',
            defaultLayout: { x: 12 - RIGHT_COL_W, y: 0, w: RIGHT_COL_W, h: ROW1_H },
            autoHeight: true,
            content: digitalInputsContent,
          })
        } else {
          panels.push({
            id: 'digital-inputs',
            title: 'Digital Inputs',
            defaultLayout: { x: row2X[2], y: row2Y, w: row2Widths[2], h: ROW2_ESTIMATE_H },
            autoHeight: true,
            content: digitalInputsContent,
          })
        }

        const stackColIndex = singleGraph ? 2 : 3
        const stackX = row2X[stackColIndex]
        const stackW = row2Widths[stackColIndex]

        panels.push(
          {
            id: 'wet-well-info',
            title: 'Wet Well Info',
            defaultLayout: { x: row2X[0], y: row2Y, w: row2Widths[0], h: ROW2_ESTIMATE_H },
            autoHeight: true,
            content: wetWellInfoContent,
          },
          {
            id: 'unit-status',
            title: 'Unit Status',
            defaultLayout: { x: row2X[1], y: row2Y, w: row2Widths[1], h: ROW2_ESTIMATE_H },
            autoHeight: true,
            content: unitStatusContent,
          },
          // Power & Temperature and Pump Runtimes stack in the last column
          // rather than each taking a full-width row — both autoHeight, so
          // each fits its own real content instead of a tall fixed guess
          // that left blank card space below a short reading.
          {
            id: 'power-temperature',
            title: 'Power & Temperature',
            defaultLayout: { x: stackX, y: row2Y, w: stackW, h: Math.ceil(ROW2_ESTIMATE_H / 2) },
            autoHeight: true,
            content: powerTempContent,
          },
          {
            id: 'pump-runtimes',
            title: 'Pump Runtimes',
            defaultLayout: { x: stackX, y: row2Y + Math.ceil(ROW2_ESTIMATE_H / 2), w: stackW, h: Math.floor(ROW2_ESTIMATE_H / 2) },
            autoHeight: true,
            content: pumpRuntimesContent,
          }
        )

        return <PanelGrid storageKey="cmom-layout-pump-station-detail-v2" panels={panels} rowHeight={rowHeight} />
      })()}
      </div>
    </div>
  )
}
