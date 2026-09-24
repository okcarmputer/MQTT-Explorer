// Authoritative wet well shape/size table, keyed by OPC serial number —
// supplied directly by facilities staff (source: internal GIS/OPC dimension
// notes), since SPUMPSTA_H's freeform Comments field only carries dimensions
// for a handful of stations and getPumpStationWetWellInfoBatch's regex parse
// (parseDiameterAndDepthFt in sqlReporting.ts) misses the rest.
//
// Source values were given as "D x L x W" with inches assumed unless a unit
// (', ft) was present. Two dimensions (D, L) means a cylindrical well: D is
// diameter, L is depth. Three dimensions (D, L, W) means a rectangular well:
// D is depth, L/W are the plan (footprint) dimensions. All values below are
// pre-converted to feet. Serials with no usable dimensions in the source
// list (blank/NULL rows, bare numbers with no dimension markers — ambiguous,
// possibly a volume rather than a size — or only a single dimension given)
// are intentionally omitted; getPumpStationWetWellInfoBatch treats a missing
// entry as "no dimensions known yet".
//
// Lives in events/ (shared by backend and renderer) so the dashboard can
// draw dimensions immediately from this table instead of waiting on the
// SQL round trips that fill in the GIS/OPC fields.
import { PumpStationWetWellDimension } from './EventsV2'

export type WetWellShape = 'cylinder' | 'rectangular'

export interface WetWellDimensionEntry {
  serial: string
  shape: WetWellShape
  diameterFt: number | null // cylinder only
  depthFt: number
  lengthFt: number | null // rectangular only
  widthFt: number | null // rectangular only
  // Not part of the original "D x L x W" source list — left undefined for
  // every entry below until the fuller records spreadsheet (with its own
  // capacity column) is transcribed in.
  capacityGallons?: number
}

const inches = (value: number): number => value / 12

// Source table columns are "D x L x W". D is always depth (matches
// rectangular below). For a 2-dimension (D, L) entry — no W — that means
// it's cylindrical and L is the diameter, not D.
function cylinder(serial: string, depthInches: number, diameterInches: number): WetWellDimensionEntry {
  return { serial, shape: 'cylinder', diameterFt: inches(diameterInches), depthFt: inches(depthInches), lengthFt: null, widthFt: null }
}

function cylinderFt(serial: string, depthFt: number, diameterFt: number): WetWellDimensionEntry {
  return { serial, shape: 'cylinder', diameterFt, depthFt, lengthFt: null, widthFt: null }
}

function rectangular(serial: string, depthInches: number, lengthInches: number, widthInches: number): WetWellDimensionEntry {
  return {
    serial,
    shape: 'rectangular',
    diameterFt: null,
    depthFt: inches(depthInches),
    lengthFt: inches(lengthInches),
    widthFt: inches(widthInches),
  }
}

function rectangularFt(serial: string, depthFt: number, lengthFt: number, widthFt: number): WetWellDimensionEntry {
  return { serial, shape: 'rectangular', diameterFt: null, depthFt, lengthFt, widthFt }
}

const ENTRIES: WetWellDimensionEntry[] = [
  cylinder('14MIS14277', 204, 96),
  cylinder('14MIS14260', 156, 72),
  rectangular('14MIS14271', 252, 36, 259),
  rectangular('12MIS11287', 348, 204, 144),
  rectangular('19MIS25555', 264, 156, 108),
  cylinder('19MIS25560', 192, 108),
  cylinder('19MIS25558', 186, 84),
  cylinder('19MIS25551', 156, 84),
  cylinder('19MIS25561', 192, 102),
  cylinder('19MIS25553', 120, 72),
  cylinder('19MIS25559', 162, 72),
  cylinder('19MIS25557', 300, 96),
  cylinder('21MIS32011', 216, 120),
  cylinder('14MIS14254', 120, 84),
  rectangular('14MIS14245', 312, 120, 480),
  cylinder('22MIS33882', 252, 132),
  cylinder('22MIS33884', 264, 72),
  cylinder('22MIS33885', 216, 84),
  cylinder('22MIS33886', 240, 120),
  rectangular('18MIS22544', 312, 192, 168),
  rectangular('21MIS31155', 384, 144, 164),
  cylinder('19MIS25556', 180, 84),
  cylinder('19MIS25554', 180, 84),
  cylinder('19MIS25552', 132, 84),
  cylinder('19MIS25562', 132, 72),
  cylinder('19MIS25550', 192, 84),
  cylinder('20MIS27983', 120, 96),
  rectangular('14MIS14231', 324.5, 197.5, 120.5),
  rectangular('14MIS14230', 252, 108, 300),
  // "WW 10' X 20' X 17' DEEP" — depth called out explicitly.
  rectangularFt('12MIS11286', 17, 10, 20),
  rectangular('14MIS14243', 300, 222, 102),
  cylinder('14MIS14283', 206.4, 96),
  rectangular('19MIS24848', 264, 120, 243),
  // "4' dia X 19' deep wet well" — explicitly labeled, not a D/L pair:
  // depth 19, diameter 4.
  cylinderFt('14MIS14278', 19, 4),
  rectangularFt('19MIS24847', 19, 16, 10),
  rectangularFt('17MIS21819', 17, 12, 10),
  cylinder('14MIS15296', 120, 108),
  rectangular('14MIS14241', 168, 120, 138),
  cylinder('14MIS14247', 180, 60),
  cylinder('14MIS14249', 120, 60),
  cylinder('14MIS14225', 120, 84),
  rectangular('14MIS14240', 372, 228, 180),
  rectangular('14MIS14250', 180, 96, 156),
  cylinder('14MIS14234', 192, 48),
  rectangular('14MIS14227', 186, 36, 222),
  cylinder('14MIS14248', 187.2, 72),
  rectangular('23MIS38102', 396, 216, 252),
  rectangularFt('14MIS14238', 14.5, 10, 20),
  rectangular('14MIS14237', 312, 132, 240),
  cylinderFt('14MIS14252', 15.45, 6),
  cylinderFt('14MIS14233', 16, 9.5),
  cylinderFt('14MIS14242', 8, 6),
  rectangularFt('14MIS14256', 26, 8, 6),
  rectangularFt('22MIS35064', 16.33, 24.67, 15),
  cylinder('14MIS14257', 240, 72),
  cylinderFt('14MIS14235', 6, 10),
  cylinderFt('16MIS19225', 14, 5),
  cylinderFt('14MIS14269', 8, 6),
  rectangular('14MIS14244', 371, 384, 168),
  cylinder('21MIS33686', 168, 96),
  cylinder('17MIS20696', 150, 78),
  cylinder('17MIS20691', 120, 78),
  cylinder('17MIS20685', 126, 36),
  cylinder('17MIS20693', 144, 78),
  cylinder('17MIS20686', 198, 47.5),
  cylinder('17MIS20694', 60, 54),
  cylinder('17MIS20687', 264, 72),
  cylinder('17MIS20688', 198, 78),
  cylinder('17MIS20695', 94.8, 43.2),
  cylinder('17MIS20692', 108, 78),
]

// Normalized (trimmed/uppercased) so a stray space or casing difference
// between how the serial reaches us (MQTT topic segment vs. SQL column vs.
// route param) doesn't silently miss an otherwise-correct table entry.
function normalizeSerial(serial: string): string {
  return serial.trim().toUpperCase()
}

const BY_SERIAL: Map<string, WetWellDimensionEntry> = new Map(
  ENTRIES.map(entry => [normalizeSerial(entry.serial), entry])
)

export function getWetWellDimensions(serial: string | null | undefined): WetWellDimensionEntry | null {
  if (!serial) {
    return null
  }
  return BY_SERIAL.get(normalizeSerial(serial)) ?? null
}

// Live level/identity fields from OPCAudit_Live, when that lookup succeeded.
export interface OpcStationFields {
  currentLevelFt: number | null
  levelLastSeenAt: string | null
  opcSerialNumber: string | null
  opcStationName: string | null
}

// Wet well record from this table alone (plus OPC fields when known) — what
// the renderer shows before SQL answers, and what the backend returns
// whenever SPUMPSTA can't be reached, so a SQL outage never hides dimensions
// this table already knows. Null when the serial has no entry.
export function staticWetWellRecord(serial: string, opc?: OpcStationFields | null): PumpStationWetWellDimension | null {
  const dims = getWetWellDimensions(serial)
  if (!dims) {
    return null
  }
  return {
    shape: dims.shape,
    dimensionName: null,
    dimensionValue: null,
    dimensionUnits: null,
    volumeGallons: null,
    elevationAtBottom: null,
    material: null,
    comments: null,
    diameterFt: dims.diameterFt,
    depthFt: dims.depthFt,
    lengthFt: dims.lengthFt,
    widthFt: dims.widthFt,
    dimensionsSource: 'spreadsheet',
    sqlParsedDiameterFt: null,
    sqlParsedDepthFt: null,
    capacityGallons: dims.capacityGallons ?? null,
    currentLevelFt: opc?.currentLevelFt ?? null,
    levelLastSeenAt: opc?.levelLastSeenAt ?? null,
    facilityId: null,
    facilityName: null,
    stationType: null,
    basin: null,
    subBasin: null,
    dryWellMaterial: null,
    stationPumpCount: null,
    stationDesignCapacity: null,
    opcSerialNumber: opc?.opcSerialNumber ?? null,
    opcStationName: opc?.opcStationName ?? null,
  }
}
