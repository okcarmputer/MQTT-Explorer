import * as React from 'react'
import { connect } from 'react-redux'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { useResizeDetector } from 'react-resize-detector'
import * as q from '../../../backend/src/Model'
import { AppState } from '../reducers'
import { dashboardConfig, mapConfig, Severity, severityColors, severityOrder } from './config'
import { useTopicChildren } from './useTopicChildren'
import { useFlowSiteInfo } from './useFlowSiteInfo'
import { useFlowMeasurements } from './useFlowMeasurements'
import { findManholeRecord, useManholeRecords } from './useManholeInfo'
import { useSqlWetWellInfoMany } from './useSqlWetWellInfo'
import { readGroupFields } from './pumpStationLeaf'
import { useMqttStore } from './store/mqttStore'
import './dashboard.css'

type DeviceKind = 'pump' | 'flow' | 'manhole'

const KIND_LABELS: Record<DeviceKind, string> = {
  pump: 'Pump stations',
  flow: 'Flow monitors',
  manhole: 'Manholes',
}
const KINDS: DeviceKind[] = ['pump', 'flow', 'manhole']
const UNKNOWN_BASIN = 'Unknown'
// How often pump station positions are re-read from the tree. UnitStatus
// Latitude/Longitude are retained and effectively static; this only catches
// stations whose UnitStatus arrives after the tab first renders.
const PUMP_RESCAN_MS = 10000

interface MapDevice {
  id: string
  kind: DeviceKind
  lat: number
  lng: number
  name: string
  subtitle?: string
  basin: string
  severity: Severity
  // Hash route of the device's detail page, if it has one.
  href?: string
  hrefLabel?: string
}

// Rejects missing/zeroed coordinates and anything implausibly far from the
// service area (a swapped lat/long, a 0,0 placeholder).
function toCoordinate(lat: unknown, lng: unknown): [number, number] | undefined {
  const la = Number(lat)
  const ln = Number(lng)
  if (lat === null || lng === null || lat === '' || lng === '' || !Number.isFinite(la) || !Number.isFinite(ln)) {
    return undefined
  }
  if (la < 30 || la > 37 || ln < -85 || ln > -77) {
    return undefined
  }
  return [la, ln]
}

function clean(value: unknown): string | undefined {
  const text = value === null || value === undefined ? '' : String(value).trim()
  return text || undefined
}

function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]!)
}

const ICON_SIZE: Record<DeviceKind, number> = { pump: 28, flow: 24, manhole: 16 }

// Shapes carry the device type, color carries severity. Pump station: the
// supplied pump glyph (assets/ps_icon.webp) drawn in the severity color on a
// white tile — see .cmom-map-pump in dashboard.css. Flow monitor: circle with
// a gauge dial. Manhole: small cover (ring + cross), its ring colored by the
// severity of the flow monitor installed in it.
function iconHtml(kind: DeviceKind, color: string): string {
  if (kind === 'pump') {
    return `<span class="cmom-map-pump" style="background:${color}" aria-hidden="true"><span class="cmom-map-pump__glyph"></span></span>`
  }
  if (kind === 'flow') {
    return `<svg width="24" height="24" viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="10.5" fill="${color}" stroke="#0d1117" stroke-width="1.5"/>
      <path d="M6 15.5a6.5 6.5 0 0 1 12 0" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round"/>
      <path d="M12 15.5l3.5-5" stroke="#fff" stroke-width="2" stroke-linecap="round"/>
    </svg>`
  }
  return `<svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
    <circle cx="8" cy="8" r="6.2" fill="#2b3139" stroke="${color}" stroke-width="2.6"/>
    <path d="M4.6 8h6.8M8 4.6v6.8" stroke="#8b949e" stroke-width="1"/>
  </svg>`
}

const iconCache = new Map<string, L.DivIcon>()
function iconFor(kind: DeviceKind, severity: Severity): L.DivIcon {
  const cacheKey = `${kind}:${severity}`
  let icon = iconCache.get(cacheKey)
  if (!icon) {
    const size = ICON_SIZE[kind]
    icon = L.divIcon({
      html: iconHtml(kind, severityColors[severity]),
      className: 'cmom-map-icon',
      iconSize: [size, size],
      iconAnchor: [size / 2, size / 2],
      popupAnchor: [0, -size / 2],
    })
    iconCache.set(cacheKey, icon)
  }
  return icon
}

function popupHtml(device: MapDevice): string {
  const rows = [
    `<strong>${escapeHtml(device.name)}</strong>`,
    device.subtitle ? `<div>${escapeHtml(device.subtitle)}</div>` : '',
    `<div class="cmom-map-popup__meta">${escapeHtml(KIND_LABELS[device.kind].replace(/s$/, ''))} · ${escapeHtml(device.basin)}</div>`,
    `<div><span class="cmom-map-popup__dot" style="background:${severityColors[device.severity]}"></span>${device.severity}</div>`,
    device.href ? `<a href="#${device.href}">${escapeHtml(device.hrefLabel ?? 'Open dashboard')}</a>` : '',
  ]
  return `<div class="cmom-map-popup">${rows.join('')}</div>`
}

function toggle<T>(set: Set<T>, value: T): Set<T> {
  const next = new Set(set)
  if (next.has(value)) {
    next.delete(value)
  } else {
    next.add(value)
  }
  return next
}

function useMapDevices(tree?: q.Tree<any>): { devices: MapDevice[]; missingCoordinates: Record<DeviceKind, number> } {
  const flowDevices = useTopicChildren(tree, dashboardConfig.flowMonitors.topicPrefix, dashboardConfig.flowMonitors.metadataChildren)
  const pumpDevices = useTopicChildren(tree, dashboardConfig.pumpStations.topicPrefix)
  const flowStore = useMqttStore(s => s.flowMonitors)
  const pumpStore = useMqttStore(s => s.pumpStations)
  const siteInfo = useFlowSiteInfo(flowDevices)
  const flowMeasurements = useFlowMeasurements(flowDevices)
  const manholes = useManholeRecords()
  const wetWells = useSqlWetWellInfoMany(React.useMemo(() => pumpDevices.map(d => d.key), [pumpDevices]))

  const [pumpTick, setPumpTick] = React.useState(0)
  React.useEffect(() => {
    const interval = setInterval(() => setPumpTick(t => t + 1), PUMP_RESCAN_MS)
    return () => clearInterval(interval)
  }, [])

  const pumpUnitStatus = React.useMemo(
    () => pumpDevices.map(d => ({ key: d.key, status: readGroupFields(d.node.edges['UnitStatus']?.target) })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [pumpDevices, pumpTick]
  )

  return React.useMemo(() => {
    const devices: MapDevice[] = []
    const missingCoordinates: Record<DeviceKind, number> = { pump: 0, flow: 0, manhole: 0 }

    pumpUnitStatus.forEach(({ key, status }) => {
      const coordinate = toCoordinate(status.Latitude, status.Longitude)
      if (!coordinate) {
        missingCoordinates.pump++
        return
      }
      const wetWell = wetWells[key]?.wetWell
      devices.push({
        id: `pump:${key}`,
        kind: 'pump',
        lat: coordinate[0],
        lng: coordinate[1],
        name: clean(status.Description) ?? key,
        subtitle: [clean(wetWell?.facilityName), key].filter(Boolean).join(' · '),
        basin: clean(wetWell?.basin) ?? UNKNOWN_BASIN,
        severity: pumpStore[key]?.severity ?? 'OK',
        href: `/pump-stations/${key}`,
      })
    })

    // Flow monitor -> its manhole record (for WRRF basin, and so the manhole
    // marker can show the monitor's severity). Same matching as the detail
    // page: site_info "name" first, then the site number.
    const siteForManhole = new Map<number, string>()
    flowDevices.forEach(d => {
      const info = siteInfo[d.key] ?? {}
      const record = manholes ? findManholeRecord(manholes, [info.name, d.key]) : undefined
      if (record?.manholeObjectId !== null && record?.manholeObjectId !== undefined) {
        siteForManhole.set(record.manholeObjectId, d.key)
      }
      // site_info only republishes once a day and only on change, so the
      // copy on each measurement payload covers a site whose site_info
      // hasn't arrived (or carries no usable position).
      const fromPayload = flowMeasurements[d.key]?.site
      const coordinate =
        toCoordinate(info.latitude, info.longitude) ?? toCoordinate(fromPayload?.latitude, fromPayload?.longitude)
      if (!coordinate) {
        missingCoordinates.flow++
        return
      }
      devices.push({
        id: `flow:${d.key}`,
        kind: 'flow',
        lat: coordinate[0],
        lng: coordinate[1],
        name: clean(info.name) ?? fromPayload?.siteName ?? d.key,
        subtitle: [clean(info.location), d.key].filter(Boolean).join(' · '),
        basin: clean(record?.wrrfBasin) ?? fromPayload?.basin ?? UNKNOWN_BASIN,
        severity: flowStore[d.key]?.severity ?? 'OK',
        href: `/flow-monitors/${d.key}`,
      })
    })

    const seenManholes = new Set<number>()
    ;(manholes ?? []).forEach(record => {
      if (record.manholeObjectId === null || seenManholes.has(record.manholeObjectId)) {
        return
      }
      seenManholes.add(record.manholeObjectId)
      const coordinate = toCoordinate(record.manholeY, record.manholeX)
      if (!coordinate) {
        missingCoordinates.manhole++
        return
      }
      const siteKey = siteForManhole.get(record.manholeObjectId)
      devices.push({
        id: `manhole:${record.manholeObjectId}`,
        kind: 'manhole',
        lat: coordinate[0],
        lng: coordinate[1],
        name: clean(record.manholeFacilityId) ?? `Manhole ${record.manholeObjectId}`,
        subtitle: [clean(record.manholeLocation), record.flowMeterId ? `Flow meter ${record.flowMeterId}` : undefined]
          .filter(Boolean)
          .join(' · '),
        basin: clean(record.wrrfBasin) ?? UNKNOWN_BASIN,
        severity: siteKey ? flowStore[siteKey]?.severity ?? 'OK' : 'OK',
        href: siteKey ? `/flow-monitors/${siteKey}` : undefined,
        hrefLabel: 'Open flow monitor',
      })
    })

    return { devices, missingCoordinates }
  }, [pumpUnitStatus, wetWells, pumpStore, flowDevices, siteInfo, flowMeasurements, manholes, flowStore])
}

interface Props {
  tree?: q.Tree<any>
}

/**
 * Map tab: every pump station, flow monitor and manhole with coordinates,
 * drawn on OpenStreetMap and held within South Carolina (mapConfig). Filters
 * by device type, basin and severity. Severity is the same per-device rollup
 * the other tabs show (useMqttStore); a manhole shows the severity of the
 * flow monitor installed in it.
 *
 * Coordinates: pump stations from UnitStatus/Latitude|Longitude (MQTT), flow
 * monitors from site_info latitude/longitude, else the measurement payload's
 * Latitude/Longitude (MQTT), manholes from the GIS table (SQL,
 * getManholeInfo). Basin: pump stations use SPUMPSTA's Basin (SQL); flow
 * monitors and manholes use REWAFLOWMETER's wrrfbasin (SQL), and a flow
 * monitor with no manhole record falls back to its measurement payload's
 * Basin (hach_flow_monitors).
 */
function DeviceMap({ tree }: Props) {
  const { devices, missingCoordinates } = useMapDevices(tree)
  const [kinds, setKinds] = React.useState<Set<DeviceKind>>(() => new Set(KINDS))
  // Hidden rather than shown, so a basin that first appears later is visible.
  const [hiddenBasins, setHiddenBasins] = React.useState<Set<string>>(() => new Set())
  const [severities, setSeverities] = React.useState<Set<Severity>>(() => new Set(severityOrder))

  const basins = React.useMemo(() => {
    const counts = new Map<string, number>()
    devices.forEach(d => counts.set(d.basin, (counts.get(d.basin) ?? 0) + 1))
    return Array.from(counts.entries()).sort(([a], [b]) =>
      a === UNKNOWN_BASIN ? 1 : b === UNKNOWN_BASIN ? -1 : a.localeCompare(b)
    )
  }, [devices])

  const visible = React.useMemo(
    () => devices.filter(d => kinds.has(d.kind) && !hiddenBasins.has(d.basin) && severities.has(d.severity)),
    [devices, kinds, hiddenBasins, severities]
  )

  const countBy = <K,>(key: (d: MapDevice) => K, value: K) => devices.filter(d => key(d) === value).length

  // A plain ref, not useResizeDetector's returned `ref`: that one's `.current`
  // is state that is still null when the mount effect below runs, so the
  // map was never created. The detector watches this ref instead.
  const containerRef = React.useRef<HTMLDivElement>(null)
  const { width, height } = useResizeDetector<HTMLDivElement>({ targetRef: containerRef })
  const mapRef = React.useRef<L.Map | null>(null)
  const layerRef = React.useRef<L.LayerGroup | null>(null)
  const fittedRef = React.useRef(false)

  React.useEffect(() => {
    const container = containerRef.current
    if (!container) {
      return
    }
    const stateBounds = L.latLngBounds(mapConfig.bounds)
    const map = L.map(container, {
      maxBounds: stateBounds.pad(0.02),
      maxBoundsViscosity: 1,
      zoomSnap: 0.25,
    })
    L.tileLayer(mapConfig.tileUrl, { attribution: mapConfig.tileAttribution, maxZoom: mapConfig.maxZoom }).addTo(map)
    map.fitBounds(stateBounds)
    mapRef.current = map
    layerRef.current = L.layerGroup().addTo(map)
    return () => {
      map.remove()
      mapRef.current = null
      layerRef.current = null
      markersRef.current.clear()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // The pane is display:none until the tab is opened, so the map is sized
  // (and the zoom-out limit computed) whenever the container's size changes.
  React.useEffect(() => {
    const map = mapRef.current
    if (!map || !width || !height) {
      return
    }
    map.invalidateSize()
    const minZoom = map.getBoundsZoom(L.latLngBounds(mapConfig.bounds), false)
    map.setMinZoom(minZoom)
    if (map.getZoom() < minZoom) {
      map.setZoom(minZoom)
    }
  }, [width, height])

  // Markers are kept and updated in place, never cleared and rebuilt: the
  // device list recomputes on every live MQTT update, and removing a marker
  // closes its open popup — which is why popups used to flash and vanish.
  const markersRef = React.useRef(new Map<string, { marker: L.Marker; severity: Severity; popup: string }>())
  React.useEffect(() => {
    const layer = layerRef.current
    if (!layer) {
      return
    }
    const markers = markersRef.current
    const keep = new Set<string>()
    visible.forEach(device => {
      keep.add(device.id)
      const popup = popupHtml(device)
      // Worse severity draws on top; manholes sit under everything.
      const zIndexOffset = severityOrder.indexOf(device.severity) * 1000 + (device.kind === 'manhole' ? 0 : 500)
      const entry = markers.get(device.id)
      if (!entry) {
        const marker = L.marker([device.lat, device.lng], {
          icon: iconFor(device.kind, device.severity),
          title: device.name,
          zIndexOffset,
        })
          .bindPopup(popup)
          .addTo(layer)
        markers.set(device.id, { marker, severity: device.severity, popup })
        return
      }
      const position = entry.marker.getLatLng()
      if (position.lat !== device.lat || position.lng !== device.lng) {
        entry.marker.setLatLng([device.lat, device.lng])
      }
      if (entry.severity !== device.severity) {
        entry.marker.setIcon(iconFor(device.kind, device.severity))
        entry.marker.setZIndexOffset(zIndexOffset)
        entry.severity = device.severity
      }
      if (entry.popup !== popup) {
        entry.marker.setPopupContent(popup)
        entry.popup = popup
      }
    })
    markers.forEach((entry, id) => {
      if (!keep.has(id)) {
        layer.removeLayer(entry.marker)
        markers.delete(id)
      }
    })
  }, [visible])

  // First time devices are known (and the map has a size), zoom to them
  // rather than the whole state.
  React.useEffect(() => {
    const map = mapRef.current
    if (!map || fittedRef.current || !width || !height || devices.length === 0) {
      return
    }
    fittedRef.current = true
    map.fitBounds(L.latLngBounds(devices.map(d => [d.lat, d.lng] as [number, number])), { padding: [24, 24] })
  }, [devices, width, height])

  const totalMissing = missingCoordinates.pump + missingCoordinates.flow + missingCoordinates.manhole

  return (
    <div className="cmom-map">
      <aside className="cmom-map__filters">
        <section>
          <div className="cmom-label">Device type</div>
          {KINDS.map(kind => (
            <label key={kind} className="cmom-map__option">
              <input type="checkbox" checked={kinds.has(kind)} onChange={() => setKinds(prev => toggle(prev, kind))} />
              <span className="cmom-map__glyph" dangerouslySetInnerHTML={{ __html: iconHtml(kind, severityColors.OK) }} />
              <span className="cmom-map__option-label">{KIND_LABELS[kind]}</span>
              <span className="cmom-map__count">{countBy(d => d.kind, kind)}</span>
            </label>
          ))}
        </section>

        <section>
          <div className="cmom-map__section-head">
            <span className="cmom-label">Anomaly</span>
            <button
              type="button"
              className="cmom-map__link"
              onClick={() => setSeverities(new Set<Severity>(['LOW', 'MODERATE', 'CRITICAL']))}
            >
              Anomalies only
            </button>
            <button type="button" className="cmom-map__link" onClick={() => setSeverities(new Set(severityOrder))}>
              All
            </button>
          </div>
          {[...severityOrder].reverse().map(severity => (
            <label key={severity} className="cmom-map__option">
              <input
                type="checkbox"
                checked={severities.has(severity)}
                onChange={() => setSeverities(prev => toggle(prev, severity))}
              />
              <span className="cmom-map__dot" style={{ background: severityColors[severity] }} />
              <span className="cmom-map__option-label">{severity}</span>
              <span className="cmom-map__count">{countBy(d => d.severity, severity)}</span>
            </label>
          ))}
        </section>

        <section>
          <div className="cmom-map__section-head">
            <span className="cmom-label">Basin</span>
            <button type="button" className="cmom-map__link" onClick={() => setHiddenBasins(new Set())}>
              All
            </button>
            <button
              type="button"
              className="cmom-map__link"
              onClick={() => setHiddenBasins(new Set(basins.map(([basin]) => basin)))}
            >
              None
            </button>
          </div>
          {basins.map(([basin, count]) => (
            <label key={basin} className="cmom-map__option">
              <input
                type="checkbox"
                checked={!hiddenBasins.has(basin)}
                onChange={() => setHiddenBasins(prev => toggle(prev, basin))}
              />
              <span className="cmom-map__option-label">{basin}</span>
              <span className="cmom-map__count">{count}</span>
            </label>
          ))}
          {basins.length === 0 && <div className="cmom-map__note">Waiting for device data…</div>}
        </section>

        <div className="cmom-map__note">
          Showing {visible.length} of {devices.length}.
          {totalMissing > 0 &&
            ` ${totalMissing} without coordinates (${missingCoordinates.pump} pump, ${missingCoordinates.flow} flow, ${missingCoordinates.manhole} manhole) aren't on the map.`}
        </div>
      </aside>
      <div ref={containerRef} className="cmom-map__canvas" />
    </div>
  )
}

const mapStateToProps = (state: AppState) => ({
  tree: state.connection.tree,
})

export default connect(mapStateToProps)(DeviceMap)
