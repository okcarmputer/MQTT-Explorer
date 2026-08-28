import * as React from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { connect } from 'react-redux'
import Sidebar from './Sidebar'
import TopBar from './TopBar'
import Overview from './Overview'
import FlowMonitors from './FlowMonitors'
import PumpStations from './PumpStations'
import Anomalies from './Anomalies'
import FleetAskPanel from './FleetAskPanel'
import MqttStoreSync from './store/MqttStoreSync'
import { AppState } from '../reducers'
import * as q from '../../../backend/src/Model'
import './dashboard.css'

interface Props {
  heightProperty: any
  paneDefaults: any
  connectionId?: string
  explorer: React.ReactNode
  tree?: q.Tree<any>
}

// Flow Monitors and Pump Stations are routed (their rows link to
// /flow-monitors/:siteId and /pump-stations/:serial); Anomalies has no
// drill-down route but is still addressable at /anomalies (so Overview's
// "Recent Anomalies" widget can link straight to the full feed); Overview
// itself stays local-only, since "/" already means it.
function routedTabForPath(pathname: string): number | null {
  if (pathname.startsWith('/flow-monitors')) return 1
  if (pathname.startsWith('/pump-stations')) return 2
  if (pathname.startsWith('/anomalies')) return 3
  return null
}

/**
 * App shell mirroring the reference Qt/QML app's Main.qml composition: a
 * left Sidebar (nav rail) + a right column of TopBar over the active pane.
 * Explorer stays mounted at all times (display:none when inactive) so the
 * tree/MQTT view underneath is never remounted by nav switches — same
 * behavior as before this restructure, just laid out differently.
 */
function DashboardTabs(props: Props) {
  const location = useLocation()
  const navigate = useNavigate()
  const [localTab, setLocalTab] = React.useState(0)
  const [askOpen, setAskOpen] = React.useState(false)

  const routedTab = routedTabForPath(location.pathname)
  const tab = routedTab !== null ? routedTab : localTab

  const handleSelect = (index: number) => {
    if (index === 1) {
      navigate('/flow-monitors')
    } else if (index === 2) {
      navigate('/pump-stations')
    } else if (index === 3) {
      navigate('/anomalies')
    } else {
      setLocalTab(index)
      if (routedTab !== null) {
        navigate('/')
      }
    }
  }

  const paneStyle = (index: number): React.CSSProperties => ({
    display: tab === index ? 'block' : 'none',
    height: '100%',
    width: '100%',
  })

  // Explorer (ContentView's react-split-pane layout) is meant to stay
  // mounted once visited, so the tree/MQTT view underneath survives nav
  // switches — but `props.explorer` is a ready-made element, and React
  // mounts an element's fiber the moment it appears in the tree regardless
  // of CSS display:none on an ancestor. Since Overview is the default tab,
  // that meant ContentView (and react-split-pane inside it) mounted
  // immediately at app startup while genuinely hidden (0×0), and
  // react-split-pane only measures its container once at mount — it never
  // re-measures on its own later, no matter how many synthetic `resize`
  // events get dispatched afterward (several increasingly aggressive
  // attempts at exactly that all failed to fix this reliably). The actual
  // fix is to not mount it while hidden in the first place: defer
  // rendering `props.explorer` at all until Explorer has been selected at
  // least once, so its first mount happens already visible and measures
  // correctly from the start. Once true, this never goes back to false, so
  // switching away and back still doesn't remount it.
  const [hasVisitedExplorer, setHasVisitedExplorer] = React.useState(tab === 4)
  React.useEffect(() => {
    if (tab === 4) {
      setHasVisitedExplorer(true)
    }
  }, [tab])

  return (
    // 100vh, not 'calc(100vh - 64px)' — that offset was for the old TitleBar
    // banner, which has been removed entirely (Connect/Disconnect/Pause now
    // live in TopBar below instead).
    <div style={{ display: 'flex', height: '100vh', width: '100%' }}>
      <Sidebar activeIndex={tab} onSelect={handleSelect} />
      <div style={{ flex: '1 1 auto', minWidth: 0, display: 'flex', flexDirection: 'column' }}>
        <TopBar onAskClick={() => setAskOpen(true)} />
        <div style={{ flex: 1, minHeight: 0, position: 'relative' }}>
          <MqttStoreSync />
          {/*
            Both children below are absolutely positioned to fill this
            relative parent and OVERLAY each other — not stack in normal
            block flow. Without position:absolute here, the always-mounted
            Explorer pane (a later sibling) gets pushed entirely below the
            fold by the full-height tab-container div before it, even though
            only one of the two is ever display:block at a time. This was
            the actual cause of "Explorer shows nothing".
          */}
          {/* Styling scope for the dashboard panes only (see dashboard.css) — Explorer, below, stays outside it and unstyled by this pass. */}
          <div className="cmom-dashboard" style={{ position: 'absolute', inset: 0, overflow: 'auto' }}>
            <div style={paneStyle(0)}>
              <Overview />
            </div>
            <div style={paneStyle(1)}>
              <FlowMonitors />
            </div>
            <div style={paneStyle(2)}>
              <PumpStations />
            </div>
            <div style={paneStyle(3)}>
              <Anomalies />
            </div>
          </div>
          {/* Not rendered at all until first visited (see hasVisitedExplorer above); stays mounted forever after that so the tree/MQTT view underneath is never remounted by nav switches. */}
          <div style={{ ...paneStyle(4), position: 'absolute', inset: 0 }}>{hasVisitedExplorer ? props.explorer : null}</div>
          {/* Transient drawer, not a tab/route — only mounted while open, so
              it doesn't hold an LLM chat/idle timers alive in the background. */}
          {askOpen && <FleetAskPanel tree={props.tree} onClose={() => setAskOpen(false)} />}
        </div>
      </div>
    </div>
  )
}

const mapStateToProps = (state: AppState) => ({
  tree: state.connection.tree,
})

export default connect(mapStateToProps)(DashboardTabs)
