import * as q from '../../../backend/src/Model'
import { PumpStationSummary } from './usePumpStationSummary'
import { PumpStationWetWellInfoResponse } from '../../../events/EventsV2'

// Canonical checklist mirroring every attribute PumpStationDetail.tsx
// actually displays — kept as one ordered list so the audit page's filter
// dropdown and the missing-attribute computation below can't drift apart.
export const PUMP_STATION_ATTRIBUTE_NAMES = [
  'Facility ID',
  'Facility Name',
  'Station Type',
  'Basin',
  'Sub-Basin',
  'Wet Well Material',
  'Dry Well Material',
  'Pump Count',
  'Design Capacity',
  'Elevation at Bottom',
  'OPC Serial Number',
  'OPC Station Name',
  'Level Last Seen',
  'Wet Well Dimensions',
  'Wet Well Level Reading',
  'Unit Status',
  'Analog Inputs',
  'Digital Inputs',
  'AC Power',
  'Battery State',
  'Temperature',
] as const

export type PumpStationAttributeName = (typeof PUMP_STATION_ATTRIBUTE_NAMES)[number]

function isEmpty(value: unknown): boolean {
  return value === null || value === undefined || value === ''
}

// All the wet-well/GIS fields depend on the same SQL row — when there's no
// row at all (SQL not configured, or no GIS record for this serial), every
// one of them is "missing" rather than silently omitted, matching
// PumpStationDetail's own "No GIS/OPC record found for this station" state.
const WET_WELL_FIELD_NAMES: PumpStationAttributeName[] = [
  'Facility ID',
  'Facility Name',
  'Station Type',
  'Basin',
  'Sub-Basin',
  'Wet Well Material',
  'Dry Well Material',
  'Pump Count',
  'Design Capacity',
  'Elevation at Bottom',
  'OPC Serial Number',
  'OPC Station Name',
  'Level Last Seen',
  'Wet Well Dimensions',
]

/**
 * Every attribute PumpStationDetail.tsx would show as empty/"N/A"/absent
 * for this station right now — same data sources the detail page itself
 * reads (usePumpStationSummary + useSqlWetWellInfo's wetWell, plus the live
 * wet-well level fallback), just compared against "is this populated"
 * instead of rendered.
 */
export function computeMissingPumpStationAttributes(
  deviceNode: q.TreeNode<any>,
  summary: PumpStationSummary,
  wetWell: PumpStationWetWellInfoResponse['wetWell'] | undefined,
  currentLevelFt: number | null
): PumpStationAttributeName[] {
  const missing: PumpStationAttributeName[] = []

  if (!wetWell) {
    missing.push(...WET_WELL_FIELD_NAMES)
  } else {
    if (isEmpty(wetWell.facilityId)) missing.push('Facility ID')
    if (isEmpty(wetWell.facilityName)) missing.push('Facility Name')
    if (isEmpty(wetWell.stationType)) missing.push('Station Type')
    if (isEmpty(wetWell.basin)) missing.push('Basin')
    if (isEmpty(wetWell.subBasin)) missing.push('Sub-Basin')
    if (isEmpty(wetWell.material)) missing.push('Wet Well Material')
    if (isEmpty(wetWell.dryWellMaterial)) missing.push('Dry Well Material')
    if (isEmpty(wetWell.stationPumpCount)) missing.push('Pump Count')
    if (isEmpty(wetWell.stationDesignCapacity)) missing.push('Design Capacity')
    if (isEmpty(wetWell.elevationAtBottom)) missing.push('Elevation at Bottom')
    if (isEmpty(wetWell.opcSerialNumber)) missing.push('OPC Serial Number')
    if (isEmpty(wetWell.opcStationName)) missing.push('OPC Station Name')
    if (isEmpty(wetWell.levelLastSeenAt)) missing.push('Level Last Seen')
    // Same "N/A" condition WetWellTankGauge itself uses to show "We don't
    // have dimensions for this wet well yet." — shape null means neither
    // the static dimensions table nor the freeform Comments parse resolved
    // a shape for this serial.
    if (wetWell.shape === null) missing.push('Wet Well Dimensions')
  }

  // Independent of the wet-well GIS record: the live/SQL level reading the
  // gauge fills to. Missing for either "N/A ft" reason — no SQL row's
  // CurrentLevelFt AND no live MQTT "Wet Well Level" analog input.
  if (currentLevelFt === null || currentLevelFt === undefined || Number.isNaN(currentLevelFt)) {
    missing.push('Wet Well Level Reading')
  }

  if (Object.keys(summary.unitStatus).length === 0) missing.push('Unit Status')
  if (summary.analogInputs.length === 0) missing.push('Analog Inputs')
  if (summary.digitalInputs.length === 0) missing.push('Digital Inputs')

  const acPowerVoltsNode = deviceNode.edges['ACPower']?.target?.edges['Volts']?.target
  if (!acPowerVoltsNode?.hasMessage()) missing.push('AC Power')

  const batteryVoltsNode = deviceNode.edges['BatteryState']?.target?.edges['Volts']?.target
  if (!batteryVoltsNode?.hasMessage()) missing.push('Battery State')

  const temperatureValueNode = deviceNode.edges['Temperature']?.target?.edges['Temperature']?.target
  if (!temperatureValueNode?.hasMessage()) missing.push('Temperature')

  return missing
}
