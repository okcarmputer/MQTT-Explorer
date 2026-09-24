import * as React from 'react'
import * as q from '../../../backend/src/Model'
import { usePollingToFetchTreeNode } from '../components/helper/usePollingToFetchTreeNode'
import { useTopicMessage } from './useTopicChildren'
import { dashboardConfig } from './config'

export type DiurnalMeasurementType = 'Flow' | 'Level' | 'Velocity'

export const DIURNAL_MEASUREMENT_TYPES: DiurnalMeasurementType[] = ['Flow', 'Level', 'Velocity']

export interface DiurnalAnomaly {
  siteNumber: string
  measurementTime?: string
  measurementType: DiurnalMeasurementType
  measurementValue?: number
  avgDiurnal?: number
  normDiurnal?: number
  // -3..3, both signs meaningful (unlike the monthly detector's 0..3 scalar
  // topics) — a negative value means "unusually low for this hour", not
  // "no anomaly". Only exactly 0 is "no anomaly" on this tree. See
  // DASHBOARD_INTEGRATION_INSTRUCTIONS.md's "diurnal flow anomalies" section.
  avgAnomalyLevel?: number
  normalAnomalyLevel?: number
}

export function parseDiurnalPayload(node: q.TreeNode<any> | undefined, siteNumber: string, measurementType: DiurnalMeasurementType): DiurnalAnomaly | undefined {
  const payload = node?.message?.payload?.toUnicodeString()
  if (!payload) return undefined
  try {
    const json = JSON.parse(payload)
    return {
      siteNumber,
      measurementTime: json.measurement_time,
      measurementType,
      measurementValue: json.measurement_value,
      avgDiurnal: json.avg_diurnal,
      normDiurnal: json.norm_diurnal,
      avgAnomalyLevel: json.avg_anomaly_level,
      normalAnomalyLevel: json.normal_anomaly_level,
    }
  } catch {
    return undefined
  }
}

/**
 * diurnal_detector.py's hour-of-day flow anomaly for one site + measurement
 * type, from AnomalyDetection/FlowMonitors/{Flow,Level,Velocity}/{siteNumber}
 * — a separate topic tree/engine from the monthly flow_monitors/{site}/{channel}/anomaly
 * scalar topics (see config.ts's diurnalTopicPrefix and anomalyTopicPrefix).
 * Undefined until this detector has published for this site/type — treat
 * that the same as "no comparison yet", not "OK".
 */
export function useDiurnalAnomaly(
  tree: q.Tree<any> | undefined,
  siteNumber: string | undefined,
  measurementType: DiurnalMeasurementType
): DiurnalAnomaly | undefined {
  // diurnal_detector.py's publish_channel() publishes to
  // AnomalyDetection/FlowMonitors/{site_number}/{Flow,Level,Velocity} — site
  // number first, then measurement type (see that function's topic-building
  // comment). Must match that order or this never resolves a node.
  const path = siteNumber ? `${dashboardConfig.flowMonitors.diurnalTopicPrefix}/${siteNumber}/${measurementType}` : ''
  const node = usePollingToFetchTreeNode(siteNumber ? tree : undefined, path)
  const message = useTopicMessage(node)

  return React.useMemo(() => {
    if (!siteNumber) return undefined
    return parseDiurnalPayload(node, siteNumber, measurementType)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [node, message, siteNumber, measurementType])
}

/**
 * Non-hook bulk read of every measurement type's diurnal anomaly for one
 * site node (a child of dashboardConfig.flowMonitors.diurnalTopicPrefix) —
 * for periodic-scan consumers (the Anomalies feed, fleet severity rollups)
 * that can't call useDiurnalAnomaly per-type in a loop.
 */
/**
 * Worst (largest-magnitude) of a diurnal reading's two levels (hour-of-day
 * avg vs. normalized shape) — the same "worse of the two" rule TrendPanel
 * applies inline for its own badge, hoisted here so FlowKpiCard/SiteHealth
 * can share it instead of re-deriving it. Undefined when neither level has
 * published yet ("no comparison yet", not "OK" — see severityFromDiurnalLevel).
 */
export function worstDiurnalAnomalyLevel(d: DiurnalAnomaly | undefined): number | undefined {
  if (!d || (d.avgAnomalyLevel === undefined && d.normalAnomalyLevel === undefined)) {
    return undefined
  }
  return Math.abs(d.normalAnomalyLevel ?? 0) > Math.abs(d.avgAnomalyLevel ?? 0) ? d.normalAnomalyLevel : d.avgAnomalyLevel
}

export function collectDiurnalAnomaliesForSite(siteNode: q.TreeNode<any>, siteNumber: string): DiurnalAnomaly[] {
  const out: DiurnalAnomaly[] = []
  for (const measurementType of DIURNAL_MEASUREMENT_TYPES) {
    const node = siteNode.edges[measurementType]?.target
    const parsed = parseDiurnalPayload(node, siteNumber, measurementType)
    if (parsed) out.push(parsed)
  }
  return out
}
