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

export const dashboardConfig = {
  flowMonitors: {
    // Confirmed against fm_mqtt.py: publishes to flow_monitors/{site_number}/{channel_type},
    // .../site_info, .../ports/{port_id}, .../status — all retained. {site_number} is the
    // wildcard segment enumerated by useTopicChildren.
    topicPrefix: 'flow_monitors',
    // No flow_monitors/{site}/{channel}/anomaly topic is published yet — anomaly severity is
    // currently computed by detector.py and written to SQL Server only (per the anomaly-detection
    // repo's rewrite: Flow_Monitor_Anomalies, one row per channel per cycle, no site-level
    // aggregate), consumed by Grafana, not MQTT. Until detector.py (or a sibling script) publishes
    // a retained anomaly leaf per channel, that leaf simply won't be found and severity reads OK.
  },
  pumpStations: {
    // Confirmed against ps_mqtt.py: publishes to pump_stations/{serial}/UnitStatus,
    // .../AnalogInputs/AnalogInput{n}, .../DigitalInputs/DigitalInput{n}, etc — all retained.
    // opcua/12299/{serial}... is only the OPC-UA node-ID namespace ps_mqtt.py reads FROM, not
    // an MQTT topic anything publishes to — the two-scheme mismatch noted in earlier docs
    // doesn't apply to this broker's actual data.
    topicPrefix: 'pump_stations',
    // Same as flow monitors: no pump_stations/{serial}/{input}/anomaly topic is published yet
    // (anomaly-detection repo now writes to OPC_Anomalies, per-input, no station-level aggregate).
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
}

// Single source for which Hach channels are measurements worth surfacing as
// a live reading (Overview device cards, the Flow Monitors table, and
// FlowMonitorDetail's trend panels all import this — no second hard-coded
// copy of channel ids/units).
export const flowChannels: FlowChannelConfig[] = [
  { id: '7', key: 'level', label: 'Level', unit: 'inches' },
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

/**
 * Digital input severity, computed client-side straight from the raw
 * pump_stations/{serial}/DigitalInputs/DigitalInput{n} payload — no detector
 * publish needed, unlike every other severity value in this app. Used by
 * both DigitalInputRow (per-device display) and anomalyTypeScan (fleet-wide
 * rollup / Anomalies feed), so the two stay in agreement.
 */
export function digitalInputSeverity(alarm: boolean, alarmDescription: string | undefined | null): Severity {
  if (!alarm) {
    return 'OK'
  }

  const desc = (alarmDescription || '').toLowerCase()
  if (desc.includes('alarm') || desc.includes('fail')) return 'CRITICAL'
  if (desc.includes('exceeded')) return 'MODERATE'
  if (desc.includes('running') || desc.includes('normal')) return 'LOW'
  return 'OK'
}
