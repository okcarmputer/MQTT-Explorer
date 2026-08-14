import { create } from 'zustand'
import { Severity } from '../config'
import { ConnectionHealth } from '../../reducers/Connection'

/**
 * Shared, MQTT-derived state (current values distilled to a per-device
 * severity, plus broker connection status) that any panel can subscribe to
 * directly — without reading through the Explorer tree component the way
 * useTopicChildren/useDeviceSeverities do. Written to in exactly one place,
 * MqttStoreSync; every other consumer only reads.
 *
 * Deliberately narrow: this does NOT replace the tree for anything that
 * needs message history or per-channel structure (TopicPlot, digital/analog
 * input breakdowns) — those keep reading the tree directly via useTopicChildren.
 * This store only carries what Overview's tiles, the device tables, and
 * similar summary panels need: key, last-update time, rollup severity.
 */
export interface DeviceSnapshot {
  key: string
  lastUpdate: number
  severity: Severity
}

interface MqttStoreState {
  connected: boolean
  health?: ConnectionHealth
  host?: string
  flowMonitors: Record<string, DeviceSnapshot>
  pumpStations: Record<string, DeviceSnapshot>
  setConnection: (connected: boolean, health: ConnectionHealth | undefined, host: string | undefined) => void
  setFlowMonitors: (devices: Record<string, DeviceSnapshot>) => void
  setPumpStations: (devices: Record<string, DeviceSnapshot>) => void
}

export const useMqttStore = create<MqttStoreState>(set => ({
  connected: false,
  health: undefined,
  host: undefined,
  flowMonitors: {},
  pumpStations: {},
  setConnection: (connected, health, host) => set({ connected, health, host }),
  setFlowMonitors: flowMonitors => set({ flowMonitors }),
  setPumpStations: pumpStations => set({ pumpStations }),
}))
