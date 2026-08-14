import * as React from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import Sidebar from './Sidebar'
import TopBar from './TopBar'
import Overview from './Overview'
import FlowMonitors from './FlowMonitors'
import PumpStations from './PumpStations'
import Anomalies from './Anomalies'
import MqttStoreSync from './store/MqttStoreSync'
import './dashboard.css'

interface Props {
  heightProperty: any
  paneDefaults: any
  connectionId?: string
  explorer: React.ReactNode
}

// Flow Monitors and Pump Stations are routed (their rows link to
// /flow-monitors/:siteId and /pump-stations/:serial); the other tabs are
// not, so the nav rail stays in sync with the URL only for those two.
function routedTabForPath(pathname: string): number | null {
  if (pathname.startsWith('/flow-monitors')) return 1
  if (pathname.startsWith('/pump-stations')) return 2
  return null
}

/**
 * App shell mirroring the reference Qt/QML app's Main.qml composition: a
 * left Sidebar (nav rail) + a right column of TopBar over the active pane.
 * Explorer stays mounted at all times (display:none when inactive) so the
 * tree/MQTT view underneath is never remounted by nav switches — same
 * behavior as before this restructure, just laid out differently.
 */
export default function DashboardTabs(props: Props) {
  const location = useLocation()
  const navigate = useNavigate()
  const [localTab, setLocalTab] = React.useState(0)

  const routedTab = routedTabForPath(location.pathname)
  const tab = routedTab !== null ? routedTab : localTab

  const handleSelect = (index: number) => {
    if (index === 1) {
      navigate('/flow-monitors')
    } else if (index === 2) {
      navigate('/pump-stations')
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

  // Explorer (ContentView's react-split-pane layout) is always mounted,
  // just display:none until this tab is active — react-split-pane measures
  // its container's size to lay out its panes, and a display:none ancestor
  // reports zero size. If that measurement happened while hidden (e.g. on
  // first mount, since Overview is the default tab), the panes can end up
  // sized wrong even after switching to Explorer, since react-split-pane
  // doesn't re-measure on visibility change — only on window resize. Firing
  // a synthetic resize event when this tab becomes active forces that
  // re-measurement.
  React.useEffect(() => {
    if (tab === 4) {
      const id = window.setTimeout(() => window.dispatchEvent(new Event('resize')), 0)
      return () => window.clearTimeout(id)
    }
  }, [tab])

  return (
    // 100vh, not 'calc(100vh - 64px)' — that offset was for the old TitleBar
    // banner, which has been removed entirely (Connect/Disconnect/Pause now
    // live in TopBar below instead).
    <div style={{ display: 'flex', height: '100vh', width: '100%' }}>
      <Sidebar activeIndex={tab} onSelect={handleSelect} />
      <div style={{ flex: '1 1 auto', minWidth: 0, display: 'flex', flexDirection: 'column' }}>
        <TopBar />
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
          {/* Explorer stays mounted at all times so the tree/MQTT view underneath is never remounted by nav switches. */}
          <div style={{ ...paneStyle(4), position: 'absolute', inset: 0 }}>{props.explorer}</div>
        </div>
      </div>
    </div>
  )
}
