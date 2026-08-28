import * as q from '../../../backend/src/Model'
import { ChildTopic } from './useTopicChildren'
import { buildSummary } from './usePumpStationSummary'
import { CurrentAnomaly } from './useAnomalyFeed'
import { flowChannels } from './config'

// Same rough token estimate llmService.ts uses (~4 characters/token) — kept
// as a local copy rather than importing from llmService, since that file's
// estimator is a private method, not exported for reuse.
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4)
}

function readFlowChannelValue(node: q.TreeNode<any>, channelId: string): string | undefined {
  const channelNode = node.edges[channelId]?.target
  const payload = channelNode?.message?.payload?.toUnicodeString()
  if (!payload) {
    return undefined
  }
  try {
    const json = JSON.parse(payload)
    return json.Value !== undefined ? String(json.Value) : undefined
  } catch {
    return payload
  }
}

/**
 * Serializes live state across every pump station + flow monitor into one
 * text blob, for use as the `topicContext` argument to
 * llmService.sendMessage — the fleet-wide analog of that function's own
 * single-topic generateTopicContext. Built entirely from primitives other
 * fleet-wide views already use (buildSummary, useCurrentAnomalies's output,
 * flowChannels), so this stays in agreement with what Overview/Anomalies
 * actually show, rather than re-deriving severity/values independently.
 *
 * Deliberately a plain function, not a hook — callers already hold
 * `pumpDevices`/`flowDevices`/`currentAnomalies` from their own hooks
 * (useAnomalyFeed/useCurrentAnomalies) and only need to serialize them at
 * send-time, not resubscribe to anything here.
 */
export function buildFleetSnapshotText(
  pumpDevices: ChildTopic[],
  flowDevices: ChildTopic[],
  currentAnomalies: CurrentAnomaly[]
): string {
  const sections: string[] = []

  sections.push(`Fleet snapshot: ${pumpDevices.length} pump station(s), ${flowDevices.length} flow monitor(s).`)

  // Current problems first — this is the section most fleet-wide questions
  // ("what's in alarm?", "anything critical right now?") actually need, so
  // it comes before the full per-device dump in case truncation below ever
  // has to cut the rest.
  const nonOk = currentAnomalies.filter(a => a.severity !== 'OK')
  sections.push(
    nonOk.length === 0
      ? '\nCurrent Anomalies: none — every device reads OK.'
      : `\nCurrent Anomalies (${nonOk.length}):\n` +
          nonOk
            .map(a => `  [${a.severity}] ${a.deviceType} ${a.deviceKey} — ${a.anomalyType}${a.description ? `: ${a.description}` : ''}`)
            .join('\n')
  )

  if (pumpDevices.length > 0) {
    sections.push('\nPump Stations:')
    pumpDevices.forEach(d => {
      const s = buildSummary(d.node)
      const desc = s.unitStatus['Description']
      const loc = s.unitStatus['Location']
      const header = [d.key, desc, loc].filter(Boolean).join(' — ')

      const alarms = s.digitalInputs
        .filter(di => di.severity !== 'OK')
        .map(di => `${di.description}=${di.alarmDescription || 'Alarm'}(${di.severity})`)
        .join(', ')
      const readings = s.analogInputs.map(a => `${a.label}=${a.value}${a.unit}`).join(', ')
      const runtimes = s.pumpRuntimes.map(r => `${r.label}: ${r.today} today/${r.yesterday} yest.`).join(', ')

      const parts = [
        alarms && `Alarms: ${alarms}`,
        readings && `Readings: ${readings}`,
        runtimes && `Runtimes: ${runtimes}`,
      ].filter(Boolean)
      sections.push(`  Station ${header}${parts.length > 0 ? ` | ${parts.join(' | ')}` : ''}`)
    })
  }

  if (flowDevices.length > 0) {
    sections.push('\nFlow Monitors:')
    flowDevices.forEach(d => {
      const readings = flowChannels
        .map(c => {
          const v = readFlowChannelValue(d.node, c.id)
          return v !== undefined ? `${c.label}=${v}${c.unit}` : undefined
        })
        .filter(Boolean)
        .join(', ')
      sections.push(`  Site ${d.key}${readings ? `: ${readings}` : ''}`)
    })
  }

  const text = sections.join('\n')

  // A full fleet dump can get large — cap it the same way llmService's own
  // context truncation does, rather than risk an oversized request. Current
  // Anomalies (the highest-value section) is always first, so a hard cut
  // here only ever trims off the tail of the per-device dump.
  const TOKEN_LIMIT = 4000
  if (estimateTokens(text) <= TOKEN_LIMIT) {
    return text
  }
  return `${text.slice(0, TOKEN_LIMIT * 4)}\n...[truncated for length]`
}
