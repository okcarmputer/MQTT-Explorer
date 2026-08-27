import * as dotProp from 'dot-prop'
import * as React from 'react'
import * as q from '../../../backend/src/Model'
import PlotHistory from './Chart/Chart'
import { toPlottableValue } from './Sidebar/CodeDiff/util'
import { PlotCurveTypes } from '../reducers/Charts'
import { DecoderFunction, useDecoder } from './hooks/useDecoder'
import { extractPayloadTimestamp } from '../helper/extractPayloadTimestamp'

const parseDuration = require('parse-duration')

interface Props {
  node?: q.TreeNode<any>
  history: q.MessageHistory
  dotPath?: string
  timeInterval?: string
  interpolation?: PlotCurveTypes
  range?: [number?, number?]
  color?: string
  centerNow?: boolean
  axisColor?: string
  gridColor?: string
  pointRingColor?: string
  fillHeight?: boolean
}

function filterUsingTimeRange(startTime: number | undefined, data: Array<q.Message>) {
  if (startTime) {
    const threshold = new Date(Date.now() - startTime)
    const filtered = data.filter(d => d.received >= threshold)
    // The selected time-range window (e.g. "1hr") happening to contain none
    // of this topic's actual history (last reading was 3 hours ago, say)
    // used to render as "No data" even though there's real history just
    // outside the window — fall back to everything available instead, and
    // let Chart's own domain calculation (useCustomXDomain) auto-fit to
    // wherever that data actually is.
    return filtered.length > 0 ? filtered : data
  }

  return data
}

// Prefers the device's own measurement time (parsed out of the payload
// itself, e.g. a "Timestamp" field) over `message.received` (when this app
// received/stored the message) — the two can diverge whenever a message was
// buffered, replayed from persisted history, or delayed in transit, and the
// graph should plot values against when they were actually measured, not
// when this client happened to see them.
function measurementTime(message: q.Message, payload: string | undefined): number {
  if (payload) {
    try {
      const measured = extractPayloadTimestamp(JSON.parse(payload))
      if (measured) {
        return measured.getTime()
      }
    } catch {
      // not JSON — fall through to received time
    }
  }
  return message.received.getTime()
}

function nodeToHistory(decodeMessage: DecoderFunction, startTime: number | undefined, history: q.MessageHistory) {
  return filterUsingTimeRange(startTime, history.toArray())
    .map((message: q.Message) => {
      const decoded = decodeMessage(message)?.message?.toUnicodeString()
      return { x: measurementTime(message, decoded), y: toPlottableValue(decoded) }
    })
    .filter(data => !isNaN(data.y as any)) as any
}

function nodeDotPathToHistory(
  decodeMessage: DecoderFunction,
  startTime: number | undefined,
  history: q.MessageHistory,
  dotPath: string
) {
  return filterUsingTimeRange(startTime, history.toArray())
    .map((message: q.Message) => {
      let json: any = {}
      let decodedText: string | undefined
      try {
        const decoded = decodeMessage(message)?.message
        decodedText = decoded?.toUnicodeString()
        json = decodedText ? JSON.parse(decodedText) : {}
      } catch (ignore) {}

      const value = dotProp.get(json, dotPath)

      return { x: measurementTime(message, decodedText), y: toPlottableValue(value) }
    })
    .filter(data => !isNaN(data.y as any)) as any
}

function TopicPlot(props: Props) {
  const decodeMessage = useDecoder(props.node)
  const startOffset = props.timeInterval ? parseDuration(props.timeInterval) : undefined
  const data = React.useMemo(() => {
    if (!props.node) {
      return []
    }

    return props.dotPath
      ? nodeDotPathToHistory(decodeMessage, startOffset, props.history, props.dotPath)
      : nodeToHistory(decodeMessage, startOffset, props.history)
    // `props.history` itself (not just `.last()`) is a dependency because
    // history hydration (see helper/hydrateTopicHistory.ts) replaces the
    // whole buffer with a new, merged one *without* necessarily changing
    // what its most recent point is — persisted history gets merged in
    // *before* whatever was already there, so `.last()` alone can stay
    // identical across that swap and this memo would never notice until an
    // unrelated dependency (e.g. the time-range toggle) happened to change.
  }, [props.history, props.history.last(), props.history.count(), startOffset, props.dotPath])

  return (
    <PlotHistory
      timeRangeStart={startOffset}
      centerNow={props.centerNow}
      color={props.color}
      axisColor={props.axisColor}
      gridColor={props.gridColor}
      pointRingColor={props.pointRingColor}
      range={props.range}
      interpolation={props.interpolation}
      fillHeight={props.fillHeight}
      data={data}
    />
  )
}

export default TopicPlot
