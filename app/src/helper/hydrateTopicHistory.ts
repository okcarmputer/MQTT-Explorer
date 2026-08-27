import * as q from '../../../backend/src/Model'
import { Base64Message } from '../../../backend/src/Model/Base64Message'
import { rendererRpc, RpcEvents, TopicHistoryResponse, TopicHistoryPoint } from '../eventBus'
import { store } from '../store'
import { AppState } from '../reducers'

const RPC_TIMEOUT_MS = 8000

// Once per node instance, not once per empty-buffer check (see below) — a
// WeakSet so it doesn't leak once a node is gone.
const hydratedNodes = new WeakSet<object>()

function toMessage(point: TopicHistoryPoint): q.Message {
  return {
    payload: Base64Message.fromString(point.v),
    retain: false,
    qos: 0,
    length: point.v.length,
    received: new Date(point.t),
    messageNumber: 0,
  }
}

// Restores chart history that was received before this app session started
// — MQTT itself doesn't retain per-topic history (only the latest retained
// message), and node.messageHistory is otherwise purely in-memory, so every
// restart used to leave charts starting from empty until new live values
// arrived. See backend/src/Model/MessageHistoryStore.ts for the write side.
//
// Deliberately does NOT gate on "the buffer is still empty": a retained MQTT
// message for the topic typically arrives (and gets recorded) within the
// same tick the chart mounts and subscribes, so by the time this ran the
// buffer already had exactly one point — which used to make hydration
// silently no-op, leaving every chart stuck at "one point since restart"
// forever. Instead this merges persisted history in *before* whatever the
// node already has, skipping only persisted points that would overlap
// (same timestamp or later) with the earliest point already present.
//
// Mutates node.messageHistory in place (reassigns the field to a new,
// merged RingBuffer) rather than the caller's own buffer/clone, so every
// reader of node.messageHistory — not just whichever component happened to
// trigger the fetch — benefits. Runs at most once per node instance.
export async function hydrateMessageHistory(node: q.TreeNode<any>, topic: string | undefined): Promise<boolean> {
  if (!topic || hydratedNodes.has(node)) {
    return false
  }
  hydratedNodes.add(node)

  const connectionId = (store.getState() as AppState).connectionManager.selected
  if (!connectionId) {
    return false
  }

  try {
    const response: TopicHistoryResponse = await rendererRpc.call(
      RpcEvents.getTopicHistory,
      { connectionId, topic },
      RPC_TIMEOUT_MS
    )
    if (!response?.points?.length) {
      return false
    }

    const persisted = response.points.slice().sort((a, b) => a.t - b.t)
    const existing = node.messageHistory.toArray()
    const earliestExistingTime = existing.length > 0 ? existing[0].received.getTime() : Infinity
    const toPrepend = persisted.filter(point => point.t < earliestExistingTime)
    if (toPrepend.length === 0) {
      return false
    }

    const merged = new q.RingBuffer<q.Message>(node.messageHistory.capacity, node.messageHistory.maxItems)
    toPrepend.forEach(point => merged.add(toMessage(point)))
    existing.forEach(message => merged.add(message))
    node.messageHistory = merged

    return true
  } catch {
    return false
  }
}
