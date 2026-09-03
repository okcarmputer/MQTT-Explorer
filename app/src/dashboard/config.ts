/**
 * Single source of truth for the CMOM dashboard: topic patterns, severity
 * colors, and thresholds. Edit this file to add/repoint topics or restyle
 * alarm severity — no other file should hard-code these values.
 *
 * Severity model: a site or pump station serial is just a grouping — it does
 * NOT carry a severity itself. Each anomaly type (each Hach channel, each
 * digital/analog input) has its own independent severity. That per-type scan
 * lives in anomalyTypeScan.ts, which looks for a retained `.../anomaly` child
 * next to each channel/input node (literal name "anomaly", not configured
 * here — there's only one convention, so it isn't a per-device-type setting).
 *
 * Severity is ALWAYS computed server-side, by the anomaly-detection repo's
 * detectors, and published to that `.../anomaly` topic — this app only ever
 * reads it (see severityFromPayload below). There is no client-side
 * classification anywhere in this app, digital inputs included; if a
 * severity looks wrong, the fix belongs in the anomaly-detection repo
 * (flow_monitors/detector.py or pump_stations/ps_mqtt.py's
 * classify_di_severity()), not here. A channel/input with no `.../anomaly`
 * topic yet reads as plain "OK" rather than being guessed at.
 */

export type Severity = 'OK' | 'LOW' | 'MODERATE' | 'CRITICAL'

export const severityOrder: Severity[] = ['OK', 'LOW', 'MODERATE', 'CRITICAL']

// Centralized LOW/MODERATE/CRITICAL color map. Every panel must import this
// rather than defining its own colors, so severity always looks the same
// everywhere (Overview tiles, Flow Monitors table, Anomalies feed, etc).
export const severityColors: Record<Severity, string> = {
  OK: '#9e9e9e',
  LOW: '#ffc107',
  MODERATE: '#ff9800',
  CRITICAL: '#f44336',
}

// How long since a device's last message before Overview's "Not Reporting"
// widget counts it. Retained MQTT semantics mean the absence of a *newer*
// message is ambiguous — it could mean the device is actually offline, or
// just as likely that nothing upstream re-published within this window
// (e.g. a slow poll cycle) while the broker still happily serves the old
// retained value. This is a display threshold for that widget only, not a
// claim about device health — see the widget's own label/copy.
export const staleDeviceThresholdMinutes = 30

// Shared refresh cadence for every hook that reads SQL Server directly
// (baseline, history, port info, wet well info, diurnal) rather than MQTT —
// one constant so all SQL-backed panels stay in sync with each other instead
// of drifting to different intervals over time.
export const SQL_POLL_INTERVAL_MS = 5 * 60 * 1000

// Slower cadence for GIS-sourced hooks (wet well info, manhole info) — this
// data comes from asset-management editing, not live telemetry, so it
// changes rarely; polling once a day instead of every 5 minutes is plenty
// and cuts needless load on the SDE database.
export const SQL_GIS_POLL_INTERVAL_MS = 24 * 60 * 60 * 1000

export const dashboardConfig = {
  flowMonitors: {
    // Confirmed against fm_mqtt.py: publishes to flow_monitors/prod/{site_number}/{channel_type},
    // .../site_info, .../ports/{port_id}, .../status — all retained. {site_number} is the
    // wildcard segment enumerated by useTopicChildren. ("prod" is a fixed literal environment
    // segment fm_mqtt.py publishes under, not a device grouping, so it belongs in the prefix.)
    topicPrefix: 'flow_monitors/prod',
    // flow_monitors/prod/data_channel_types is a reference/lookup topic (the
    // catalog of every possible Hach channel id -> name/units/kind), not a
    // site — it sits directly under the same "flow_monitors/prod" prefix as
    // every site number, so anywhere sites get enumerated must exclude it
    // by name (see useTopicChildren's excludeKeys param) or it gets treated
    // as a 182nd "site". Surfaced separately via the Flow Monitors tab's
    // "Data Channel Types" button (DataChannelTypes.tsx) instead.
    metadataChildren: ['data_channel_types'],
    // Confirmed against the broker's retained set: fm_mqtt.py actually
    // publishes this catalog at flow_monitors/data_channel_types/{native,virtual}/{id}
    // — one level up from the site topics, not under "prod" alongside them.
    dataChannelTypesPath: 'flow_monitors/data_channel_types',
    // flow_monitors/detector.py publishes flow_monitors/{site}/{channel}/anomaly
    // and .../baseline (retained) every DETECTOR_INTERVAL_MINUTES — see the
    // anomaly-detection repo's DASHBOARD_INTEGRATION_INSTRUCTIONS.md. A
    // channel with no reading that cycle is skipped, not published as "OK",
    // so a missing leaf here just means "no comparison yet," not "healthy."
    // NOTE this sits at flow_monitors/{site}/... — NOT under topicPrefix's
    // "prod" segment — because detector.py publishes it as a sibling tree to
    // fm_mqtt.py's flow_monitors/prod/{site}/... value topics, not inside it.
    // anomalyTypeScan's collectAnomalyTypes/deviceSeverity need this passed
    // separately so they look for the "anomaly" leaf in the right tree.
    anomalyTopicPrefix: 'flow_monitors',
    // AnomalyDetection/FlowMonitors/diurnal_detector.py's hour-of-day
    // detector — a second, independent engine from the one above, on a
    // deliberately separate topic tree (different casing/namespace). One
    // retained JSON message per site per measurement type; see
    // DASHBOARD_INTEGRATION_INSTRUCTIONS.md's "diurnal flow anomalies"
    // section for the payload shape and the -3..3 (both-signs-meaningful)
    // severity range.
    diurnalTopicPrefix: 'AnomalyDetection/FlowMonitors',
  },
  pumpStations: {
    // Confirmed against opc-logger's logger.py: build_topic() publishes to
    // pump_stations/opcua/12299/{serial}/{node_path} (e.g. .../UnitStatus/SerialNumber,
    // .../DigitalInputs/DigitalInput{n}/Alarm, .../AnalogInputs/AnalogInput{n}/ScaledValue) — all
    // retained. {serial} (the NODE_TREE root, e.g. "14MIS14227") is the wildcard segment
    // enumerated by useTopicChildren; "opcua"/"12299" are fixed literal path segments (the OPC-UA
    // browse root logger.py reads from), not a device grouping, so they belong in the prefix, not
    // as a serial. NODE_TREE's leaf names (UnitStatus, DigitalInputs, AnalogInputs, ACPower,
    // BatteryState, Temperature, ...) are exactly what PumpStationDetail.tsx reads.
    topicPrefix: 'pump_stations/opcua/12299',
    // pump_stations/ps_mqtt.py publishes .../DigitalInputs/DigitalInput{n}/anomaly
    // (retained, server-computed from AlarmDescription via classify_di_severity())
    // every audit cycle; pump_detector.py additionally publishes .../anomaly +
    // .../baseline (shadow-mode) for AnalogInputs/PumpRuntimes/RainInfo — see the
    // anomaly-detection repo's DASHBOARD_INTEGRATION_INSTRUCTIONS.md.
  },
}

export interface FlowChannelConfig {
  // Topic segment under a site, e.g. flow_monitors/{site}/7 — the literal
  // Hach data-channel id, confirmed against hachAPI/getSiteMeasurements.py's
  // CHANNEL_ALLOW_LIST (the site poller only ever fetches these three) and
  // the project readme ("Type 7=Level, 11=Velocity, 15=Flow").
  id: string
  key: 'level' | 'velocity' | 'flow'
  label: string
  unit: string
  // 0-100% denominator for LevelGauge's cylinder fill — only set on the
  // channel(s) that get a gauge instead of a plain number. No pipe/wet-well
  // depth is published per site (that lives in dbo.hach_port_info's
  // dimension, surfaced separately as a site attribute), so this is a
  // flat, editable-here assumption rather than a per-site true depth —
  // adjust if it reads wrong for your sites.
  gaugeMaxInches?: number
}

// Single source for which Hach channels are measurements worth surfacing as
// a live reading (Overview device cards, the Flow Monitors table, and
// FlowMonitorDetail's trend panels all import this — no second hard-coded
// copy of channel ids/units).
export const flowChannels: FlowChannelConfig[] = [
  { id: '7', key: 'level', label: 'Level', unit: 'inches', gaugeMaxInches: 60 },
  { id: '11', key: 'velocity', label: 'Velocity', unit: 'fps' },
  { id: '15', key: 'flow', label: 'Flow', unit: 'gpm' },
]

export function severityFromPayload(payload: string | undefined | null): Severity {
  if (!payload) {
    return 'OK'
  }

  const upper = payload.trim().toUpperCase()
  if (upper.includes('CRITICAL')) return 'CRITICAL'
  if (upper.includes('MODERATE')) return 'MODERATE'
  if (upper.includes('LOW')) return 'LOW'
  return 'OK'
}

// diurnal_detector.py's flag_level() ladder, per the anomaly-detection repo's
// own table:
//   -3/3 = Critical Alert (Red)   value >= peak_mean ± 3σ
//   -2/2 = Moderate Alert (Orange) value >= peak_mean ± 2σ
//   -1/1 = Low Alert (Yellow)      value >= peak_mean ± 1σ
//    0   = None (Green)            within ±1σ of baseline
//    4   = Temporary (Blue)        non-anomalous state change (e.g. location
//          update) — explicitly informational, NOT severity-ranked.
// Maps by magnitude onto the app's LOW/MODERATE/CRITICAL vocabulary so
// diurnal anomalies can share severityColors/severityOrder/alarm counts with
// every other severity source; 4 maps to OK since it isn't a severity at all
// (see diurnalFlagLabel/diurnalFlagColor below for its own "Temporary"/blue
// display, which callers should check for separately when they want to show
// it as informational rather than silently dropping it).
export function severityFromDiurnalLevel(level: number | undefined | null): Severity {
  if (level === undefined || level === null || Number.isNaN(level) || level === 4) {
    return 'OK'
  }

  const magnitude = Math.abs(level)
  if (magnitude >= 3) return 'CRITICAL'
  if (magnitude === 2) return 'MODERATE'
  if (magnitude === 1) return 'LOW'
  return 'OK'
}

// Exact repo palette for the diurnal ladder's own label/color, distinct from
// severityColors — kept separate because flag 4 ("Temporary") has no
// equivalent in the LOW/MODERATE/CRITICAL model above (blue, informational,
// not an alert), so it can't be represented as a Severity at all.
const DIURNAL_FLAG_COLORS: Record<number, string> = {
  [-3]: '#f44336',
  [-2]: '#ff9800',
  [-1]: '#ffc107',
  0: '#4caf50',
  1: '#ffc107',
  2: '#ff9800',
  3: '#f44336',
  4: '#2196f3',
}

export function diurnalFlagLabel(level: number | undefined | null): string {
  if (level === undefined || level === null || Number.isNaN(level)) return 'No comparison yet'
  if (level === 4) return 'Temporary'
  if (level === 0) return 'None'
  const magnitude = Math.abs(level)
  if (magnitude === 3) return 'Critical Alert'
  if (magnitude === 2) return 'Moderate Alert'
  if (magnitude === 1) return 'Low Alert'
  return `Level ${level}`
}

export function diurnalFlagColor(level: number | undefined | null): string {
  if (level === undefined || level === null || Number.isNaN(level)) return severityColors.OK
  return DIURNAL_FLAG_COLORS[level] ?? severityColors.OK
}
