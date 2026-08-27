import sql from 'mssql'
import {
  FlowMonitorBaselineResponse,
  FlowMonitorChannelBaseline,
  FlowMonitorHistoryResponse,
  FlowMonitorHistoryPoint,
  FlowMonitorPortInfoResponse,
  FlowMonitorPortDimension,
  PumpStationWetWellInfoResponse,
} from '../events/EventsV2'
import { getWetWellDimensions } from './wetWellDimensions'

/**
 * Direct SQL Server reads for report-style data (baselines, historical
 * comparisons) — separate from the MQTT-based live values the rest of the
 * dashboard uses. Deliberately narrow: one parameterized, read-only query,
 * not a generic SQL-from-the-browser endpoint (that would be a SQL
 * injection / data-exfiltration surface on a web-facing server). Called
 * only through the existing authenticated Socket.io RPC channel — see
 * src/server.ts's RpcEvents.getFlowMonitorBaseline handler.
 *
 * Config is entirely via env vars — never hardcode credentials here.
 * Unconfigured (no SQL_SERVER) is a normal, expected state: the dashboard
 * still works MQTT-only, this is additive.
 */

let pool: sql.ConnectionPool | undefined
let poolPromise: Promise<sql.ConnectionPool> | undefined

export function isSqlReportingConfigured(): boolean {
  return Boolean(process.env.SQL_SERVER)
}

function getPool(): Promise<sql.ConnectionPool> {
  if (pool) {
    return Promise.resolve(pool)
  }
  if (poolPromise) {
    return poolPromise
  }

  const config: sql.config = {
    server: process.env.SQL_SERVER as string,
    database: process.env.SQL_DATABASE || 'flow_monitor',
    user: process.env.SQL_USER,
    password: process.env.SQL_PASSWORD,
    port: process.env.SQL_PORT ? parseInt(process.env.SQL_PORT, 10) : 1433,
    options: {
      encrypt: process.env.SQL_ENCRYPT !== 'false',
      trustServerCertificate: process.env.SQL_TRUST_SERVER_CERT === 'true',
    },
    pool: {
      max: 5,
      min: 0,
      idleTimeoutMillis: 30000,
    },
  }

  const newPoolPromise: Promise<sql.ConnectionPool> = new sql.ConnectionPool(config)
    .connect()
    .then((connectedPool: sql.ConnectionPool) => {
      pool = connectedPool
      pool.on('error', (err: Error) => {
        console.error('[sqlReporting] Pool error, will reconnect on next query:', err.message)
        pool = undefined
        poolPromise = undefined
      })
      return connectedPool
    })
    .catch((err: Error) => {
      poolPromise = undefined
      throw err
    })

  poolPromise = newPoolPromise
  return newPoolPromise
}

// Bridges the two site identifiers in play (see
// Anomaly_Detection/DASHBOARD_INTEGRATION_INSTRUCTIONS.md Part 1a):
// hach_flow_monitors.SiteNumber (Hach numeric, matches the MQTT topic
// segment) <-> hach_flow_monitors.SiteID (CHA string, what
// comparison_results is keyed on). This query does that translation and
// reads the latest comparison_results row in one round trip.
const QUERY = `
SELECT TOP 1
    cr.hach_flow_mgd,        cr.cha_avg_flow_mgd_mean,  cr.cha_avg_flow_mgd_sd,  cr.flow_alarm,
    cr.hach_velocity_fps,    cr.cha_avg_vel_fps_mean,   cr.cha_avg_vel_fps_sd,   cr.velocity_alarm,
    cr.hach_level_in,        cr.cha_avg_depth_mean,     cr.cha_avg_depth_sd,     cr.level_alarm,
    cr.compared_at
FROM dbo.hach_flow_monitors hfm
INNER JOIN dbo.comparison_results cr ON cr.site_id = hfm.SiteID
WHERE hfm.SiteNumber = @siteNumber
ORDER BY cr.compared_at DESC;
`

export async function getFlowMonitorBaseline(siteNumber: string): Promise<FlowMonitorBaselineResponse> {
  if (!isSqlReportingConfigured()) {
    return { configured: false, siteNumber, channels: [] }
  }

  const connectedPool = await getPool()
  const result = await connectedPool.request().input('siteNumber', sql.VarChar(50), siteNumber).query(QUERY)

  const row = result.recordset[0]
  if (!row) {
    return { configured: true, siteNumber, channels: [] }
  }

  const channels: FlowMonitorChannelBaseline[] = [
    {
      channelId: '15',
      observedValue: row.hach_flow_mgd,
      baselineMean: row.cha_avg_flow_mgd_mean,
      baselineStdDev: row.cha_avg_flow_mgd_sd,
      alarmLevel: row.flow_alarm,
      comparedAt: row.compared_at ? new Date(row.compared_at).toISOString() : null,
    },
    {
      channelId: '11',
      observedValue: row.hach_velocity_fps,
      baselineMean: row.cha_avg_vel_fps_mean,
      baselineStdDev: row.cha_avg_vel_fps_sd,
      alarmLevel: row.velocity_alarm,
      comparedAt: row.compared_at ? new Date(row.compared_at).toISOString() : null,
    },
    {
      channelId: '7',
      observedValue: row.hach_level_in,
      baselineMean: row.cha_avg_depth_mean,
      baselineStdDev: row.cha_avg_depth_sd,
      alarmLevel: row.level_alarm,
      comparedAt: row.compared_at ? new Date(row.compared_at).toISOString() : null,
    },
  ]

  return { configured: true, siteNumber, channels }
}

// Same site-number-to-site-id join as getFlowMonitorBaseline, but every
// comparison_results row within the lookback window (not just the latest)
// so the drill-down trend chart can plot observed values against the CHA
// baseline bounds over time. comparison_results already carries one row per
// detector cycle with both the observed reading and that cycle's baseline —
// hach_site_measures (raw, higher-frequency Hach readings with no baseline
// attached) isn't needed for this chart.
const HISTORY_QUERY = `
SELECT
    cr.compared_at,
    cr.hach_flow_mgd,        cr.cha_avg_flow_mgd_mean,  cr.cha_avg_flow_mgd_sd,  cr.flow_alarm,
    cr.hach_velocity_fps,    cr.cha_avg_vel_fps_mean,   cr.cha_avg_vel_fps_sd,   cr.velocity_alarm,
    cr.hach_level_in,        cr.cha_avg_depth_mean,     cr.cha_avg_depth_sd,     cr.level_alarm
FROM dbo.hach_flow_monitors hfm
INNER JOIN dbo.comparison_results cr ON cr.site_id = hfm.SiteID
WHERE hfm.SiteNumber = @siteNumber
  AND cr.compared_at >= DATEADD(HOUR, -@hours, GETUTCDATE())
ORDER BY cr.compared_at ASC;
`

export async function getFlowMonitorHistory(siteNumber: string, hours: number): Promise<FlowMonitorHistoryResponse> {
  if (!isSqlReportingConfigured()) {
    return { configured: false, siteNumber, points: [] }
  }

  const connectedPool = await getPool()
  const result = await connectedPool
    .request()
    .input('siteNumber', sql.VarChar(50), siteNumber)
    .input('hours', sql.Int, hours)
    .query(HISTORY_QUERY)

  const points: FlowMonitorHistoryPoint[] = result.recordset.map((row: any) => ({
    comparedAt: new Date(row.compared_at).toISOString(),
    flow: row.hach_flow_mgd,
    flowMean: row.cha_avg_flow_mgd_mean,
    flowStdDev: row.cha_avg_flow_mgd_sd,
    flowAlarm: row.flow_alarm,
    velocity: row.hach_velocity_fps,
    velocityMean: row.cha_avg_vel_fps_mean,
    velocityStdDev: row.cha_avg_vel_fps_sd,
    velocityAlarm: row.velocity_alarm,
    level: row.hach_level_in,
    levelMean: row.cha_avg_depth_mean,
    levelStdDev: row.cha_avg_depth_sd,
    levelAlarm: row.level_alarm,
  }))

  return { configured: true, siteNumber, points }
}

// dbo.hach_port_info: one row per port on a site, carrying the pipe/channel
// shape and physical dimension used to convert level readings to flow.
// SiteNumber here is the same Hach numeric identifier hach_flow_monitors
// and the MQTT topic segment use — no SiteID join needed, unlike the
// comparison_results queries above. "DimenstionName" is the actual (typo'd)
// column name in the SQL schema, kept verbatim rather than aliased, so this
// query stays a literal match against what's really in the database.
const PORT_INFO_QUERY = `
SELECT
    PortID, Channels, Shape, DimenstionName, DimensionValue, DimensionUnits
FROM dbo.hach_port_info
WHERE SiteNumber = @siteNumber
ORDER BY PortID;
`

export async function getFlowMonitorPortInfo(siteNumber: string): Promise<FlowMonitorPortInfoResponse> {
  if (!isSqlReportingConfigured()) {
    return { configured: false, siteNumber, ports: [] }
  }

  const connectedPool = await getPool()
  const result = await connectedPool.request().input('siteNumber', sql.VarChar(50), siteNumber).query(PORT_INFO_QUERY)

  const ports: FlowMonitorPortDimension[] = result.recordset.map((row: any) => ({
    portId: row.PortID,
    channels: row.Channels,
    shape: row.Shape,
    dimensionName: row.DimenstionName,
    dimensionValue: row.DimensionValue,
    dimensionUnits: row.DimensionUnits,
  }))

  return { configured: true, siteNumber, ports }
}

// Pulls wet well physical info straight out of the GIS pump station table
// (SPUMPSTA_H) plus the live level reading from OPCAudit_Live, joined by the
// FacilityID-prefix convention the OPC station names follow (e.g. "204
// Eastcliff" -> FacilityID 204). There is no dedicated wet well dimensions
// table — GIS only carries WetWellVolume (gallons) as a structured field;
// physical dimensions (diameter/depth), when known at all, are buried in
// freeform Comments text like "4' dia X 19' deep wet well" and are parsed
// out in JS below rather than in T-SQL.
const WET_WELL_QUERY = `
WITH StationCurrent AS (
    SELECT *,
        ROW_NUMBER() OVER (
            PARTITION BY FacilityID
            ORDER BY EditDate DESC, GDB_ARCHIVE_OID DESC
        ) AS rn
    FROM [sde].[gisadmin].[SPUMPSTA_H]
    WHERE GDB_TO_DATE = '9999-12-31 00:00:00.0000000'
),
-- Resolved for @serial specifically, not ranked/tiebroken against sibling
-- OPC serials sharing the same FacilityID (the original multi-station
-- version of this query does that ranking to pick one "best" row per
-- facility for a station list — here we already know exactly which serial
-- we want, so filtering by SerialNumber up front avoids a losing tiebreak
-- silently excluding a valid, real serial from its own detail page).
ThisOpcStation AS (
    SELECT
        SerialNumber,
        MAX(Description) AS StationName,
        TRY_CAST(
            LEFT(MAX(Description), NULLIF(CHARINDEX(' ', MAX(Description)) - 1, -1))
            AS INT
        ) AS ParsedFacilityID
    FROM [flow_monitor].[dbo].[OPCAudit_Live]
    WHERE FieldName IN ('UnacknowledgedAlarms', 'Timezone')
      AND SerialNumber = @serial
    GROUP BY SerialNumber
),
LevelReadings AS (
    SELECT
        SerialNumber,
        TRY_CAST(Value AS FLOAT) AS CurrentLevelFt,
        LastSeenAt AS LevelLastSeenAt
    FROM [flow_monitor].[dbo].[OPCAudit_Live]
    WHERE FieldName = 'ScaledValue'
      AND PointName = 'AnalogInput1'
      AND Description LIKE '%Wet Well Level%'
      AND SerialNumber = @serial
)
SELECT TOP 1
    p.FacilityID,
    p.FacilityName,
    p.Type AS StationType,
    p.Basin,
    p.SubBasin,
    p.WetWellVolume,
    p.ElevationAtBottom,
    p.WetWellMaterial,
    p.DryWellMaterial,
    p.NumberOfPumps AS StationPumpCount,
    p.DesignCapacity AS StationDesignCapacity,
    p.Comments AS StationComments,
    ol.SerialNumber AS OPC_SerialNumber,
    ol.StationName AS OPC_StationName,
    lr.CurrentLevelFt,
    lr.LevelLastSeenAt
FROM ThisOpcStation ol
INNER JOIN StationCurrent p
    ON TRY_CAST(p.FacilityID AS INT) = ol.ParsedFacilityID
    AND p.rn = 1
    AND p.Enabled = 1
LEFT JOIN LevelReadings lr
    ON lr.SerialNumber = ol.SerialNumber;
`

// Pulls "4' dia X 19' deep", "10' DIA X 12' DEEP WET WELL", "8' dia x 16'
// deep", etc. out of freeform Comments text. Case-insensitive, tolerant of
// straight/curly apostrophes and "diameter"/"deep"/"depth" spellings. Not
// every station's Comments contains this — most don't — so both may be null.
function parseDiameterAndDepthFt(comments: string | null): { diameterFt: number | null; depthFt: number | null } {
  if (!comments) {
    return { diameterFt: null, depthFt: null }
  }
  const diaMatch = comments.match(/(\d+(?:\.\d+)?)\s*['’]?\s*(?:dia(?:meter)?)\b/i)
  const depthMatch = comments.match(/(\d+(?:\.\d+)?)\s*['’]?\s*deep\b|(\d+(?:\.\d+)?)\s*['’]?\s*depth\b/i)
  const diameterFt = diaMatch ? parseFloat(diaMatch[1]) : null
  const depthFt = depthMatch ? parseFloat(depthMatch[1] ?? depthMatch[2]) : null
  return { diameterFt, depthFt }
}

export async function getPumpStationWetWellInfo(serial: string): Promise<PumpStationWetWellInfoResponse> {
  // The static shape/dimension table (src/wetWellDimensions.ts) is local
  // data, not SQL-backed — it's available (and authoritative over the
  // freeform-Comments regex parse) regardless of whether SQL reporting is
  // configured for this process.
  const staticDims = getWetWellDimensions(serial)

  if (!isSqlReportingConfigured()) {
    return {
      configured: false,
      serial,
      wetWell: staticDims
        ? {
            shape: staticDims.shape,
            dimensionName: null,
            dimensionValue: null,
            dimensionUnits: null,
            volumeGallons: null,
            elevationAtBottom: null,
            material: null,
            comments: null,
            diameterFt: staticDims.diameterFt,
            depthFt: staticDims.depthFt,
            lengthFt: staticDims.lengthFt,
            widthFt: staticDims.widthFt,
            currentLevelFt: null,
            levelLastSeenAt: null,
            facilityId: null,
            facilityName: null,
            stationType: null,
            basin: null,
            subBasin: null,
            dryWellMaterial: null,
            stationPumpCount: null,
            stationDesignCapacity: null,
            opcSerialNumber: null,
            opcStationName: null,
          }
        : null,
    }
  }

  const connectedPool = await getPool()
  const result = await connectedPool.request().input('serial', sql.VarChar(50), serial).query(WET_WELL_QUERY)

  const row = result.recordset[0]
  if (!row) {
    return {
      configured: true,
      serial,
      wetWell: null,
    }
  }

  const parsed = parseDiameterAndDepthFt(row.StationComments)
  const shape = staticDims?.shape ?? null
  const diameterFt = staticDims?.diameterFt ?? parsed.diameterFt
  const depthFt = staticDims?.depthFt ?? parsed.depthFt

  return {
    configured: true,
    serial,
    wetWell: {
      shape,
      dimensionName: null,
      dimensionValue: null,
      dimensionUnits: null,
      volumeGallons: row.WetWellVolume,
      elevationAtBottom: row.ElevationAtBottom,
      material: row.WetWellMaterial,
      comments: row.StationComments,
      diameterFt,
      depthFt,
      lengthFt: staticDims?.lengthFt ?? null,
      widthFt: staticDims?.widthFt ?? null,
      currentLevelFt: row.CurrentLevelFt,
      levelLastSeenAt: row.LevelLastSeenAt ? new Date(row.LevelLastSeenAt).toISOString() : null,
      facilityId: row.FacilityID !== undefined && row.FacilityID !== null ? String(row.FacilityID) : null,
      facilityName: row.FacilityName,
      stationType: row.StationType,
      basin: row.Basin,
      subBasin: row.SubBasin,
      dryWellMaterial: row.DryWellMaterial,
      stationPumpCount: row.StationPumpCount,
      stationDesignCapacity: row.StationDesignCapacity,
      opcSerialNumber: row.OPC_SerialNumber,
      opcStationName: row.OPC_StationName,
    },
  }
}
