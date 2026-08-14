import CssBaseline from '@mui/material/CssBaseline'
import React from 'react'
import { bindActionCreators } from 'redux'
import { connect } from 'react-redux'
import { HashRouter } from 'react-router-dom'
import { Theme } from '@mui/material/styles'
import { withStyles } from '@mui/styles'
import ConfirmationDialog from './ConfirmationDialog'
import ConnectionSetup from './ConnectionSetup/ConnectionSetup'
import ErrorBoundary from './ErrorBoundary'
import Notification from './Layout/Notification'
import UpdateNotifier from './UpdateNotifier'
import { AboutDialog } from './AboutDialog'
import { AppState } from '../reducers'
import { ConfirmationRequest } from '../reducers/Global'
import { globalActions, settingsActions } from '../actions'
;(window as any).global = window

const ContentView = React.lazy(() => import('./Layout/ContentView'))
const DashboardTabs = React.lazy(() => import('../dashboard/DashboardTabs'))

interface Props {
  connectionId: string
  classes: any
  error?: string
  notification?: string
  actions: typeof globalActions
  settingsActions: typeof settingsActions
  launching: boolean
  confirmationRequests: Array<ConfirmationRequest>
  aboutDialogVisible: boolean
}

// The old TitleBar banner (hamburger → Settings drawer, search, title,
// pause/disconnect) is gone — search lived nowhere useful outside Explorer,
// pause/connect/disconnect now live in the dashboard's own TopBar, and
// Settings now lives inline in the Explorer tab (see ExplorerSettings.tsx).
// This app no longer has anything that needs a slide-over "shift" of the
// main content, so there's just one content class now, not a pair.
class App extends React.PureComponent<Props, {}> {
  constructor(props: any) {
    super(props)
    this.state = {}
  }

  private renderNotification() {
    const message = this.props.error || this.props.notification
    const isError = message === this.props.error
    if (message) {
      // Guard in case someone ever calls showError with an error instead of a string
      const str = typeof message === 'string' ? message : JSON.stringify(message)
      return (
        <Notification
          message={str}
          type={isError ? 'error' : 'notification'}
          onClose={() => {
            isError ? this.props.actions.showError(undefined) : this.props.actions.showNotification(undefined)
          }}
        />
      )
    }

    return null
  }

  public componentDidMount() {
    this.props.settingsActions.loadSettings()
  }

  public render() {
    const { content, centerContent, paneDefaults, heightProperty } = this.props.classes

    if (this.props.launching) {
      return null
    }

    return (
      <div className={centerContent}>
        <CssBaseline />
        <HashRouter>
        <ErrorBoundary>
          <ConfirmationDialog confirmationRequests={this.props.confirmationRequests} />
          <AboutDialog
            open={this.props.aboutDialogVisible}
            onClose={() => this.props.actions.toggleAboutDialogVisibility()}
          />
          {this.renderNotification()}
          <div className={centerContent}>
            <div className={content}>
              <React.Suspense fallback={<div />}>
                <DashboardTabs
                  heightProperty={heightProperty}
                  connectionId={this.props.connectionId}
                  paneDefaults={paneDefaults}
                  explorer={
                    <ContentView
                      heightProperty={heightProperty}
                      connectionId={this.props.connectionId}
                      paneDefaults={paneDefaults}
                    />
                  }
                />
              </React.Suspense>
            </div>
          </div>
          <UpdateNotifier />
          <ConnectionSetup />
        </ErrorBoundary>
        </HashRouter>
      </div>
    )
  }
}

const styles = (theme: Theme) => {
  const contentBaseStyle = {
    width: '100vw',
    backgroundColor: theme.palette.background.default,
  }

  return {
    heightProperty: {
      height: '100%',
    },
    paneDefaults: {
      backgroundColor: theme.palette.background.default,
      color: theme.palette.text.primary,
      display: 'block' as const,
      // 100%, not a hardcoded viewport calc — ContentView (the only consumer)
      // is nested inside the dashboard's Sidebar/TopBar shell now, so it
      // needs to fill whatever height its actual container has.
      height: '100%',
    },
    centerContent: {
      width: '100vw',
      overflow: 'hidden' as const,
    },
    content: {
      ...contentBaseStyle,
    },
  }
}

const mapDispatchToProps = (dispatch: any) => ({
  actions: bindActionCreators(globalActions, dispatch),
  settingsActions: bindActionCreators(settingsActions, dispatch),
})

const mapStateToProps = (state: AppState) => ({
  connectionId: state.connection.connectionId,
  error: state.globalState.get('error'),
  notification: state.globalState.get('notification'),
  highlightTopicUpdates: state.settings.get('highlightTopicUpdates'),
  launching: state.globalState.get('launching'),
  confirmationRequests: state.globalState.get('confirmationRequests'),
  aboutDialogVisible: state.globalState.get('aboutDialogVisible'),
})

export default withStyles(styles)(connect(mapStateToProps, mapDispatchToProps)(App))
