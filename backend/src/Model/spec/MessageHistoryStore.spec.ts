import { expect } from 'chai'
import fs from 'fs-extra'
import os from 'os'
import path from 'path'
import 'mocha'
import { compactPayload, isChartedTopic, MessageHistoryStore } from '../MessageHistoryStore'

const DAY_MS = 24 * 60 * 60 * 1000
const NOW = Date.parse('2026-09-24T12:00:00Z')
const SCALED = 'pump_stations/opcua/12299/14MIS14257/AnalogInputs/AnalogInput1/ScaledValue'
const FLOW = 'flow_monitors/15225/7'

function opcPayload(value: number, sourceTimestamp: string) {
  return JSON.stringify({
    server: 'opc-mosquitto',
    node_id: 'ns=2;s=12299.14MIS14257.AnalogInputs.AnalogInput1.ScaledValue',
    value,
    datatype: null,
    source_timestamp: sourceTimestamp,
    server_timestamp: `${sourceTimestamp}.533943`,
    status_code: 'Good',
  })
}

describe('MessageHistoryStore', () => {
  let dir: string

  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), 'history-store-'))
  })

  afterEach(async () => {
    await fs.remove(dir)
  })

  it('records only charted topics', () => {
    expect(isChartedTopic(SCALED)).to.eq(true)
    expect(isChartedTopic(FLOW)).to.eq(true)
    expect(isChartedTopic('flow_monitors/20246/3')).to.eq(true)
    expect(isChartedTopic('flow_monitors/prod/20246/3')).to.eq(false)
    expect(isChartedTopic('flow_monitors/15225/7/anomaly')).to.eq(false)
    expect(isChartedTopic('flow_monitors/poller_status')).to.eq(false)
    expect(isChartedTopic('flow_monitors/15225/site_info')).to.eq(false)
    expect(isChartedTopic('flow_monitors/15225/ports/1')).to.eq(false)
    expect(isChartedTopic('flow_monitors/data_channel_types/native/3')).to.eq(false)
    expect(isChartedTopic('pump_stations/opcua/12299/14MIS14257/UnitStatus/LastUpdate')).to.eq(false)
    expect(isChartedTopic('$SYS/broker/uptime')).to.eq(false)
  })

  it('compacts payloads to the first non-null timestamp and the value', () => {
    expect(JSON.parse(compactPayload(opcPayload(3.6, '2026-08-25T14:04:33')))).to.deep.eq({
      source_timestamp: '2026-08-25T14:04:33',
      value: 3.6,
    })
    const flow = JSON.stringify({
      SiteNumber: '15225',
      Time: '2026-08-24T13:00:00',
      UpdateTime: 'x',
      Value: 3.3,
      SiteName: 'FM250-16',
      Latitude: 34.8,
      Longitude: -82.4,
      Basin: 'Reedy',
    })
    expect(compactPayload(flow)).to.eq('{"Time":"2026-08-24T13:00:00","Value":3.3}')
    const nullSource = JSON.stringify({ value: 1, source_timestamp: null, server_timestamp: '2026-08-25T14:04:33' })
    expect(compactPayload(nullSource)).to.eq('{"server_timestamp":"2026-08-25T14:04:33","value":1}')
    expect(compactPayload('42')).to.eq('42')
    expect(compactPayload('not json')).to.eq('not json')
  })

  it('persists across a restart', async () => {
    const store = new MessageHistoryStore(dir, () => NOW)
    await store.load()
    store.record('conn', SCALED, opcPayload(1, '2026-09-24T11:00:00'), NOW - 2000)
    store.record('conn', SCALED, opcPayload(2, '2026-09-24T11:01:00'), NOW - 1000)
    store.record('conn', '$SYS/broker/uptime', '100 seconds', NOW)
    await store.flush()

    expect(await fs.readdir(dir)).to.deep.eq(['2026-09-24.ndjson'])

    const reopened = new MessageHistoryStore(dir, () => NOW)
    await reopened.load()
    const points = reopened.getPoints('conn', SCALED)
    expect(points.map(p => JSON.parse(p.v).value)).to.deep.eq([1, 2])
    expect(points.map(p => p.t)).to.deep.eq([NOW - 2000, NOW - 1000])
    expect(reopened.getPoints('conn', '$SYS/broker/uptime')).to.deep.eq([])
  })

  it('skips a re-delivered identical reading', async () => {
    const store = new MessageHistoryStore(dir, () => NOW)
    await store.load()
    store.record('conn', SCALED, opcPayload(1, '2026-09-24T11:00:00'), NOW - 2000)
    store.record('conn', SCALED, opcPayload(1, '2026-09-24T11:00:00'), NOW - 1000)
    expect(store.getPoints('conn', SCALED)).to.have.length(1)
  })

  it('drops expired points and deletes expired day files', async () => {
    const old = new Date(NOW - 40 * DAY_MS).toISOString().slice(0, 10)
    await fs.writeFile(
      path.join(dir, `${old}.ndjson`),
      `${JSON.stringify({ c: 'conn', p: SCALED, t: NOW - 40 * DAY_MS, v: '1' })}\n`
    )
    await fs.writeFile(
      path.join(dir, '2026-09-23.ndjson'),
      `${JSON.stringify({ c: 'conn', p: SCALED, t: NOW - DAY_MS, v: '2' })}\n{"truncated\n`
    )

    const store = new MessageHistoryStore(dir, () => NOW)
    await store.load()

    expect(store.getPoints('conn', SCALED).map(p => p.v)).to.deep.eq(['2'])
    expect(await fs.readdir(dir)).to.deep.eq(['2026-09-23.ndjson'])
  })

  it('loads history stored under the old flow_monitors/prod tree as the current topic', async () => {
    await fs.writeFile(
      path.join(dir, '2026-09-23.ndjson'),
      `${JSON.stringify({ c: 'conn', p: 'flow_monitors/prod/15225/7', t: NOW - DAY_MS, v: '1' })}\n`
    )

    const store = new MessageHistoryStore(dir, () => NOW)
    await store.load()
    store.record('conn', FLOW, '2', NOW)

    expect(store.getPoints('conn', FLOW).map(p => p.v)).to.deep.eq(['1', '2'])
    expect(store.getPoints('conn', 'flow_monitors/prod/15225/7')).to.deep.eq([])
  })

  it('reports a failed flush and retries it', async () => {
    const store = new MessageHistoryStore(dir, () => NOW)
    await store.load()
    store.record('conn', SCALED, opcPayload(1, '2026-09-24T11:00:00'), NOW)
    // A directory where today's file should be makes the append fail.
    await fs.mkdirp(path.join(dir, '2026-09-24.ndjson'))
    await store.flush()
    expect(store.getStatus().lastFlushError).to.be.a('string')

    await fs.remove(path.join(dir, '2026-09-24.ndjson'))
    await store.flush()
    expect(store.getStatus().lastFlushError).to.eq(undefined)
    const lines = (await fs.readFile(path.join(dir, '2026-09-24.ndjson'), 'utf8')).trim().split('\n')
    expect(lines).to.have.length(1)
  })
})
