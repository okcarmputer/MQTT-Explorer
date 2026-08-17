import * as React from 'react'
import ReactSplitPaneImport from 'react-split-pane'
import { connect } from 'react-redux'
import { List } from 'immutable'
import { useResizeDetector } from 'react-resize-detector'
import ChartPanel from '../ChartPanel'
import Tree from '../Tree'
import { AppState } from '../../reducers'
import { ChartParameters } from '../../reducers/Charts'
import { Sidebar } from '../Sidebar'
import MobileTabs from './MobileTabs'
import PublishTab from '../Sidebar/PublishTab'
import ExplorerSettings from '../../dashboard/ExplorerSettings'

// Type cast to any to work around React 18 compatibility issues with react-split-pane 0.1.x
const ReactSplitPane = ReactSplitPaneImport as any

interface Props {
  heightProperty: any
  paneDefaults: any
  connectionId?: string
  chartPanelItems: List<ChartParameters>
}

function ContentView(props: Props) {
  // Use different defaults for mobile viewports (<=768px width)
  // Use state for mobile detection that updates on resize
  const [isMobile, setIsMobile] = React.useState(() => typeof window !== 'undefined' && window.innerWidth <= 768)
  const [mobileTab, setMobileTab] = React.useState(0) // 0 = topics, 1 = details, 2 = publish, 3 = charts
  const [height, setHeight] = React.useState<string | number>('100%')
  const [sidebarWidth, setSidebarWidth] = React.useState<string | number>(isMobile ? '100%' : '40%')
  const [detectedHeight, setDetectedHeight] = React.useState(0)
  const [detectedSidebarWidth, setDetectedSidebarWidth] = React.useState(0)

  // Update mobile state on resize
  React.useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth <= 768)
    }

    // Set initial state
    handleResize()

    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  // react-split-pane (the desktop layout below) only sizes its panes
  // correctly if a `resize` event fires *after* it's actually mounted with
  // real layout dimensions — it doesn't re-measure on its own when a
  // previously-hidden/zero-size ancestor becomes visible (this is the same
  // issue documented elsewhere in this codebase: DashboardTabs dispatches
  // one synthetic resize on tab switch for the same reason). A single
  // dispatch at delay 0 is timing-sensitive — if this component's own
  // layout (e.g. ExplorerSettings' height) hasn't settled yet, the pane
  // still ends up effectively invisible at normal window widths, only
  // "recovering" once an actual window resize happens to fire (which is
  // why shrinking the window narrow enough to hit the mobile breakpoint,
  // a completely different CSS-only layout path, "fixes" it). Firing
  // several staggered retries here, local to this component rather than
  // depending on a cross-component signal's exact timing, is far more
  // reliable than a single best-effort dispatch.
  React.useEffect(() => {
    if (isMobile) {
      return
    }
    const dispatch = () => window.dispatchEvent(new Event('resize'))
    const timers = [0, 50, 200, 500].map(delay => window.setTimeout(dispatch, delay))
    return () => timers.forEach(t => window.clearTimeout(t))
  }, [isMobile])

  const { height: resizeHeight, ref: heightRef } = useResizeDetector()
  const { width: resizeWidth, ref: widthRef } = useResizeDetector()

  React.useEffect(() => {
    if (resizeHeight) setDetectedHeight(resizeHeight)
  }, [resizeHeight])

  React.useEffect(() => {
    if (resizeWidth) setDetectedSidebarWidth(resizeWidth)
  }, [resizeWidth])

  const detectSize = React.useCallback((width: any, newHeight: any) => {
    setDetectedHeight(newHeight)
  }, [])

  const detectSidebarSize = React.useCallback((width: any) => {
    setDetectedSidebarWidth(width)
  }, [])

  const closeDrawerCompletelyIfItSitsOnTheEdge = React.useCallback(() => {
    if (detectedHeight < 30) {
      setHeight('100%')
    }
  }, [detectedHeight])

  const closeSidebarCompletelyIfItSitsOnTheEdge = React.useCallback(() => {
    if (detectedSidebarWidth < 30) {
      setSidebarWidth('0%')
    }
  }, [detectedSidebarWidth])

  // Open chart panel on start and when a new chart is added but the panel is closed
  React.useEffect(() => {
    const almostClosed = !isNaN(height as any) && detectedHeight < 30
    if ((!height || height === '100%' || almostClosed) && props.chartPanelItems.count() > 0) {
      setHeight('calc(100% - 250px)')
    }

    if (props.chartPanelItems.count() === 0) {
      setHeight('100%')
    }
  }, [props.chartPanelItems])

  // Expose tab switching functions for other components to call. Only
  // meaningful in the mobile layout, but the hook itself must run
  // unconditionally on every render (not nested inside `if (isMobile)`
  // below) -- React requires the same hooks in the same order on every
  // render of a component, and isMobile can flip mid-session (window
  // resize, or the dashboard's synthetic resize dispatch on tab switch),
  // which previously threw "Rendered more hooks than during the previous
  // render" and crashed/remounted this whole component (wiping the tree).
  React.useEffect(() => {
    if (!isMobile || typeof window === 'undefined') {
      return
    }
    ;(window as any).switchToDetailsTab = () => setMobileTab(1)
    ;(window as any).switchToTopicsTab = () => setMobileTab(0)
    ;(window as any).switchToPublishTab = () => setMobileTab(2)
    ;(window as any).switchToChartsTab = () => setMobileTab(3)
    return () => {
      delete (window as any).switchToDetailsTab
      delete (window as any).switchToTopicsTab
      delete (window as any).switchToPublishTab
      delete (window as any).switchToChartsTab
    }
  }, [isMobile])

  // Scroll to selected topic when returning to tree tab (mobile only)
  React.useEffect(() => {
    if (!isMobile || mobileTab !== 0) {
      return
    }
    // Delay to ensure DOM is rendered
    setTimeout(() => {
      const selectedNode = document.querySelector('.tree .selected')
      if (selectedNode) {
        selectedNode.scrollIntoView({ behavior: 'smooth', block: 'center' })
      }
    }, 100)
  }, [isMobile, mobileTab])

  // Mobile view with tab switcher
  if (isMobile) {
    const mobileContainerStyle: React.CSSProperties = {
      display: 'flex',
      flexDirection: 'column',
      // Fills whatever height its container (the dashboard's Explorer pane)
      // actually has, rather than assuming it sits directly under a single
      // 64px titlebar — it's nested under the dashboard's TopBar too now.
      height: '100%',
      width: '100%',
    }

    const tabContentStyle: React.CSSProperties = {
      flex: 1,
      display: 'flex',
      flexDirection: 'column',
      minHeight: 0, // Critical for flex children with overflow
      width: '100%',
      overflow: 'hidden',
      position: 'relative',
    }

    // Tree container needs explicit height for the Tree component's height: 100% to work
    const treeContainerStyle: React.CSSProperties = {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      width: '100%',
      height: '100%',
    }

    const sidebarContainerStyle: React.CSSProperties = {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      width: '100%',
      height: '100%',
      overflow: 'auto',
    }

    return (
      <div style={mobileContainerStyle}>
        <MobileTabs value={mobileTab} onChange={setMobileTab} />
        <div style={tabContentStyle}>
          {/* Topics tab - keep mounted, toggle visibility */}
          <div style={{ ...treeContainerStyle, display: mobileTab === 0 ? 'block' : 'none' }}>
            <Tree />
          </div>
          {/* Details tab - keep mounted, toggle visibility */}
          <div style={{ ...sidebarContainerStyle, display: mobileTab === 1 ? 'block' : 'none' }}>
            <Sidebar connectionId={props.connectionId} />
          </div>
          {/* Publish tab - keep mounted, toggle visibility */}
          <div style={{ ...sidebarContainerStyle, display: mobileTab === 2 ? 'block' : 'none' }}>
            <PublishTab connectionId={props.connectionId} />
          </div>
          {/* Charts tab - keep mounted, toggle visibility */}
          <div style={{ ...sidebarContainerStyle, display: mobileTab === 3 ? 'block' : 'none' }}>
            <ChartPanel />
          </div>
        </div>
      </div>
    )
  }

  // Desktop view with split panes. cmom-explorer-panel gives Explorer the
  // same rounded/shadowed panel chrome every other tab's cards have, WITHOUT
  // the cmom-dashboard class itself — an earlier pass added that class here
  // too, which also pulled in .cmom-dashboard's typography cascade
  // (monospace font, different base size/line-height) onto the Tree
  // underneath. The tree's own node highlight/selection boxes size
  // themselves to their text using the app's original font metrics; once
  // that font changed out from under them, the highlight box and the text
  // it's supposed to contain fell out of sync, spilling text outside its
  // own box. cmom-explorer-panel below is defined standalone (its own
  // literal colors, not .cmom-dashboard's custom properties) specifically
  // so this chrome can apply without dragging that cascade along with it.
  return (
    <div
      className={props.paneDefaults}
      style={{ display: 'flex', flexDirection: 'column', height: '100%', width: '100%', padding: 16, boxSizing: 'border-box', gap: 12 }}
    >
      <ExplorerSettings />
      <div className="cmom-explorer-panel" style={{ flex: 1, minHeight: 0 }}>
        <span>
          <ReactSplitPane
            step={20}
            primary="second"
            className={props.heightProperty}
            split="vertical"
            minSize={0}
            size={sidebarWidth}
            onChange={(size: number) => setSidebarWidth(size)}
            onDragFinished={closeSidebarCompletelyIfItSitsOnTheEdge}
            allowResize
            style={{ height: '100%' }}
            pane1Style={{ overflowX: 'hidden' }}
            resizerStyle={{ height: '100%' }}
          >
            <span>
              <ReactSplitPane
                step={10}
                split="horizontal"
                minSize={0}
                size={height}
                allowResize
                style={{ height: '100%' }}
                pane1Style={{ maxHeight: '100%' }}
                pane2Style={{ borderTop: '1px solid #999', display: 'flex' }}
                onChange={(size: number) => setHeight(size)}
                onDragFinished={closeDrawerCompletelyIfItSitsOnTheEdge}
              >
                <Tree />
                {/** Passing height constraints via flex options down */}
                <div
                  ref={heightRef}
                  style={{
                    flex: 1,
                    display: 'flex',
                    height: '100%',
                    width: '100%',
                  }}
                >
                  {/** Resize detector must not be in the scroll zone, it needs to detect actual available size */}
                  <ChartPanel />
                </div>
              </ReactSplitPane>
            </span>
            <div ref={widthRef} style={{ height: '100%' }}>
              <div
                className={props.paneDefaults}
                style={{
                  minWidth: '250px',
                  height: '100%',
                  overflowY: 'auto',
                  overflowX: 'hidden',
                }}
              >
                <Sidebar connectionId={props.connectionId} />
              </div>
            </div>
          </ReactSplitPane>
        </span>
      </div>
    </div>
  )
}

const mapStateToProps = (state: AppState) => ({
  chartPanelItems: state.charts.get('charts'),
})

export default connect(mapStateToProps)(ContentView)
