/**
 * Simplified Event System V2
 *
 * This provides a simpler, more type-safe way to define and use events.
 * Instead of factory functions like makeConnectionStateEvent(id),
 * you can now use: Events.connectionState(id)
 */

import { UpdateInfo } from 'builder-util-runtime'
import { Base64MessageDTO } from '../backend/src/Model/Base64Message'
import { DataSourceState, MqttOptions } from '../backend/src/DataSource'
import { RpcEvent } from './EventSystem/Rpc'

export type EventV2<MessageType> = {
  topic: string
}

// Simple event definitions (no parameters)
export const Events = {
  // Connection management
  addMqttConnection: { topic: 'connection/add/mqtt' } as EventV2<AddMqttConnectionV2>,
  removeConnection: { topic: 'connection/remove' } as EventV2<string>,
  updateAvailable: { topic: 'app/update/available' } as EventV2<UpdateInfo>,

  // Parameterized events (for connection-specific events)
  connectionState: (connectionId: string) => ({ topic: `conn/state/${connectionId}` }) as EventV2<DataSourceState>,
  connectionMessage: (connectionId: string) => ({ topic: `conn/${connectionId}` }) as EventV2<MqttMessageV2>,
  publish: (connectionId: string) => ({ topic: `conn/publish/${connectionId}` }) as EventV2<MqttMessageV2>,
}

// RPC Events - type-safe request/response patterns
export const RpcEvents = {
  getAppVersion: { topic: 'getAppVersion' } as RpcEvent<void, string>,
  writeToFile: { topic: 'writeFile' } as RpcEvent<{ filePath: string; data: string; encoding?: string }, void>,
  readFromFile: { topic: 'readFromFile' } as RpcEvent<{ filePath: string; encoding?: string }, Buffer>,
  openDialog: { topic: 'openDialog' } as RpcEvent<OpenDialogOptionsV2, OpenDialogReturnValueV2>,
  saveDialog: { topic: 'saveDialog' } as RpcEvent<SaveDialogOptionsV2, SaveDialogReturnValueV2>,
  uploadCertificate: { topic: 'uploadCertificate' } as RpcEvent<CertificateUploadRequest, CertificateUploadResponse>,
  llmChat: { topic: 'llm/chat' } as RpcEvent<LlmChatRequest, LlmChatResponse>,
  getFlowMonitorBaseline: {
    topic: 'sql/flow-monitor-baseline',
  } as RpcEvent<FlowMonitorBaselineRequest, FlowMonitorBaselineResponse>,
  getFlowMonitorHistory: {
    topic: 'sql/flow-monitor-history',
  } as RpcEvent<FlowMonitorHistoryRequest, FlowMonitorHistoryResponse>,
  getFlowMonitorPortInfo: {
    topic: 'sql/flow-monitor-port-info',
  } as RpcEvent<FlowMonitorPortInfoRequest, FlowMonitorPortInfoResponse>,
  getPumpStationWetWellInfoBatch: {
    topic: 'sql/pump-station-wet-well-info-batch',
  } as RpcEvent<PumpStationWetWellInfoBatchRequest, PumpStationWetWellInfoBatchResponse>,
  getManholeInfo: {
    topic: 'sql/manhole-info',
  } as RpcEvent<void, ManholeInfoResponse>,
  getFlowMonitorDiurnalAnomalies: {
    topic: 'sql/flow-monitor-diurnal-anomalies',
  } as RpcEvent<FlowMonitorDiurnalAnomaliesRequest, FlowMonitorDiurnalAnomaliesResponse>,
  getTopicHistory: {
    topic: 'history/topic',
  } as RpcEvent<TopicHistoryRequest, TopicHistoryResponse>,
}

// Type definitions
export interface AddMqttConnectionV2 {
  id: string
  options: MqttOptions
}

export interface MqttMessageV2 {
  topic: string
  payload: Base64MessageDTO | null
  qos: 0 | 1 | 2
  retain: boolean
  messageId: number | undefined
}

export interface CertificateUploadRequest {
  filename: string
  data: string // base64 encoded
}

export interface CertificateUploadResponse {
  name: string
  data: string // base64 encoded
}

// LLM Chat RPC types
export interface LlmChatRequest {
  messages: Array<{
    role: 'system' | 'user' | 'assistant'
    content: string
  }>
  topicContext?: string
}

export interface LlmChatResponse {
  response: string
}

// SQL reporting RPC types — direct SQL Server reads for report-style data
// (baselines, historical comparisons) that doesn't need MQTT's live-update
// semantics. See src/sqlReporting.ts for the query itself.
export interface FlowMonitorBaselineRequest {
  siteNumber: string
}

export interface FlowMonitorChannelBaseline {
  channelId: '7' | '11' | '15'
  observedValue: number | null
  baselineMean: number | null
  baselineStdDev: number | null
  alarmLevel: 0 | 1 | 2 | 3 | null
  comparedAt: string | null
}

export interface FlowMonitorBaselineResponse {
  configured: boolean // false if SQL_* env vars aren't set — caller should treat as "unavailable," not an error
  siteNumber: string
  channels: FlowMonitorChannelBaseline[]
}

// History for the per-site drill-down trend chart — same comparison_results
// source as the baseline RPC above, but every row in the lookback window
// instead of just the latest, so the chart can plot observed values against
// the CHA baseline mean/SD bounds over time.
export interface FlowMonitorHistoryRequest {
  siteNumber: string
  hours: number
}

export interface FlowMonitorHistoryPoint {
  comparedAt: string
  flow: number | null
  flowMean: number | null
  flowStdDev: number | null
  flowAlarm: 0 | 1 | 2 | 3 | null
  velocity: number | null
  velocityMean: number | null
  velocityStdDev: number | null
  velocityAlarm: 0 | 1 | 2 | 3 | null
  level: number | null
  levelMean: number | null
  levelStdDev: number | null
  levelAlarm: 0 | 1 | 2 | 3 | null
}

export interface FlowMonitorHistoryResponse {
  configured: boolean
  siteNumber: string
  points: FlowMonitorHistoryPoint[]
}

// diurnal_detector.py's own SQL table — separate from comparison_results/
// FlowMonitorHistory above (that's the monthly/CHA detector). Lives on the
// dev SQL Server today (see Anomaly_Detection/DEV_SETUP.md), so this reads
// through its own pool (see isDiurnalReportingConfigured/SQL_DIURNAL_* in
// src/sqlReporting.ts), not the main SQL_SERVER one. Row-per-(site, channel,
// AnomalyType) — a site/channel can have up to two rows per MeasurementTime,
// one for AnomalyType 'Avg' and one for 'Normalized'; not deduped/collapsed
// here since the dashboard-side UX decision (show both vs. pick the worse
// one) belongs to the caller, same as the MQTT payload's own two fields.
export interface FlowMonitorDiurnalAnomaliesRequest {
  siteNumber: string
  hours: number
}

export interface FlowMonitorDiurnalAnomalyRow {
  anomalyId: number
  siteNumber: string
  siteLocation: string | null
  measurementType: 'Flow' | 'Level' | 'Velocity'
  // 'Avg' | 'Normalized' — which baseline this row was compared against.
  anomalyType: string
  // -3..3, signed: negative = below baseline, positive = above. Severity is
  // ABS(anomalyValue); the sign is direction, not severity — don't sort on
  // this raw value expecting worst-first (see the SQL doc's own caveat).
  anomalyValue: number
  measurementValue: number | null
  avgDiurnal: number | null
  normDiurnal: number | null
  measurementTime: string
  detectedAt: string
}

export interface FlowMonitorDiurnalAnomaliesResponse {
  configured: boolean
  siteNumber: string
  rows: FlowMonitorDiurnalAnomalyRow[]
}

// Pipe/port physical dimensions from dbo.hach_port_info — a site can have
// more than one port (multiple rows), each with its own shape/dimension.
// Deliberately narrow to the fields the dashboard actually displays (Shape,
// DimenstionName/Value/Units — that first one really is misspelled in the
// SQL schema, kept verbatim); LevelUnits/AreaUnits/FlowUnits/
// LevelAreaMultiplier/HeadFlowLevel aren't shown anywhere and aren't
// selected.
export interface FlowMonitorPortInfoRequest {
  siteNumber: string
}

export interface FlowMonitorPortDimension {
  portId: number | null
  channels: string | null
  shape: string | null
  dimensionName: string | null
  dimensionValue: number | null
  dimensionUnits: string | null
}

export interface FlowMonitorPortInfoResponse {
  configured: boolean
  siteNumber: string
  ports: FlowMonitorPortDimension[]
}

// Wet well physical dimensions, mirroring FlowMonitorPortDimension's shape/
// dimension convention — reads from a table the user is creating separately
// (working name: dbo.pump_station_wet_well), keyed by pump station serial
// rather than a flow monitor site number. Until that table exists,
// getPumpStationWetWellInfoBatch degrades to configured:true with an empty list
// (see src/sqlReporting.ts), same "unavailable, not an error" contract as
// every other SQL-backed read in this app.
//
// Batched: one request covers every serial a page needs (the station list
// used to fire one request per row), answered with two SQL queries total.
export interface PumpStationWetWellInfoBatchRequest {
  serials: string[]
}

// Keyed by the serial exactly as requested.
export interface PumpStationWetWellInfoBatchResponse {
  results: Record<string, PumpStationWetWellInfoResponse>
}

export interface PumpStationWetWellDimension {
  // 'cylinder' | 'rectangular' | null (unknown) — from the static OPC-serial
  // dimensions table (events/wetWellDimensions.ts) when available, else parsed
  // out of freeform Comments text.
  shape: 'cylinder' | 'rectangular' | null
  dimensionName: string | null
  dimensionValue: number | null
  dimensionUnits: string | null
  // Below: sourced from SPUMPSTA_H / OPCAudit_Live directly (see
  // getPumpStationWetWellInfoBatch) rather than the not-yet-created
  // pump_station_wet_well table the fields above were originally meant for.
  volumeGallons: number | null // SPUMPSTA_H.WetWellVolume
  elevationAtBottom: number | null // SPUMPSTA_H.ElevationAtBottom
  material: string | null // SPUMPSTA_H.WetWellMaterial
  comments: string | null // SPUMPSTA_H.Comments — sometimes carries a freeform "X' dia X Y' deep" note
  diameterFt: number | null // static table first, else parsed out of comments
  depthFt: number | null // static table first, else parsed out of comments
  // Plan-view dimensions for rectangular wells only (static table); null for
  // cylindrical/unknown wells.
  lengthFt: number | null
  widthFt: number | null
  // Which of the two possible sources diameterFt/depthFt (and, when present,
  // lengthFt/widthFt/capacityGallons) actually came from — the dashboard
  // shows this explicitly per the two-halves wet well card (SQL/SPUMPSTA
  // side vs. records-spreadsheet side) rather than silently picking a
  // winner the way the backend already does for the merged value above.
  dimensionsSource: 'spreadsheet' | 'sql-comments' | null
  // The Comments-text-parsed diameter/depth even when the spreadsheet value
  // won and is what diameterFt/depthFt above actually hold — so the card
  // can show both when they disagree instead of only ever showing the
  // spreadsheet's number. Null whenever Comments didn't parse to a value,
  // regardless of which source won.
  sqlParsedDiameterFt: number | null
  sqlParsedDepthFt: number | null
  // Wet well capacity as given in the records spreadsheet (events/wetWellDimensions.ts)
  // — distinct from volumeGallons below (SPUMPSTA.WetWellVolume, a separate
  // GIS field) since the two sources can disagree the same way diameter/depth can.
  capacityGallons: number | null
  currentLevelFt: number | null // live "Wet Well Level" analog reading
  levelLastSeenAt: string | null

  // GIS attributes (SPUMPSTA_H), shown alongside the tank gauge as
  // read-only context rather than folded into the gauge itself.
  facilityId: string | null
  facilityName: string | null
  stationType: string | null
  basin: string | null
  subBasin: string | null
  dryWellMaterial: string | null
  stationPumpCount: number | null
  stationDesignCapacity: number | null

  // OPC station link (OPCAudit_Live), same join used to source currentLevelFt.
  opcSerialNumber: string | null
  opcStationName: string | null
}

export interface PumpStationWetWellInfoResponse {
  configured: boolean
  serial: string
  wetWell: PumpStationWetWellDimension | null
  // Set only on the renderer's placeholder (static dimensions table only)
  // while the SQL answer is still in flight — GIS fields are null because
  // they haven't loaded yet, not because they're missing.
  pending?: boolean
}

// Manhole + flow meter GIS attributes — direct SQL Server read of
// [sde].[gisadmin].[REWAFLOWMETER] left-joined to [sde].[gisadmin].[SMANHOLE]
// (see src/sqlReporting.ts's getManholeInfo), replacing the earlier
// MQTT-published flow_monitors/manhole_info topic tree as this app's source
// for this data. Bulk fetch (no request params, one row per flow meter,
// matched to its manhole where the join finds one) — the frontend matches a
// site to its row client-side by trying several candidate keys against
// flowMeterId/installCurrentMhId/manholeFacilityId, same as before, since
// source data quality on those ids is inconsistent (see useManholeInfo.ts).
export interface ManholeRecord {
  manholeObjectId: number | null
  manholeFacilityId: string | null
  manholeLocation: string | null
  manholeInstallDate: string | null
  rimElevation: number | null
  manholeAccessDiameter: number | null
  manholeDepthFt: number | null
  manholeStatus: string | null
  manholeX: number | null
  manholeY: number | null
  flowMeterX: number | null
  flowMeterY: number | null
  comment: string | null
  flowMeterObjectId: number | null
  flowMeterId: string | null
  wrrfBasin: string | null
  installMhId: string | null
  installCurrentMhId: string | null
  flowMeterInstallDate: string | null
  flowMeterStatus: string | null
  diameter: number | null
  flowMeterLocationDesc: string | null
  serialNum: string | null
  phase: string | null
}

export interface ManholeInfoResponse {
  configured: boolean
  records: ManholeRecord[]
}

// Locally-persisted MQTT message history (see backend/src/Model/MessageHistoryStore.ts)
// — lets a chart hydrate with values received before the current app
// session (normally lost on restart, since messageHistory/RingBuffer only
// ever held live in-memory data). `v` is the message payload's decoded
// unicode string (not base64), matching Base64Message.toUnicodeString().
export interface TopicHistoryRequest {
  connectionId: string
  topic: string
}

export interface TopicHistoryPoint {
  t: number
  v: string
}

export interface TopicHistoryResponse {
  points: TopicHistoryPoint[]
}

// Dialog types (browser-compatible versions)
import type { OpenDialogOptions, OpenDialogReturnValue, SaveDialogOptions, SaveDialogReturnValue } from './DialogTypes'

export type OpenDialogOptionsV2 = OpenDialogOptions
export type OpenDialogReturnValueV2 = OpenDialogReturnValue
export type SaveDialogOptionsV2 = SaveDialogOptions
export type SaveDialogReturnValueV2 = SaveDialogReturnValue
