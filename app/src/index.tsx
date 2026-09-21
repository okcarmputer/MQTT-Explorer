import * as React from 'react'
import * as ReactDOM from 'react-dom/client'
import { connect, Provider } from 'react-redux'
import { ThemeProvider } from '@mui/material/styles'
import { ThemeProvider as LegacyThemeProvider } from '@mui/styles'
import App from './components/App'
import Demo from './components/Demo'
import { AppState } from './reducers'
import './utils/tracking'
import { themes } from './theme'
import { BrowserAuthWrapper } from './components/BrowserAuthWrapper'
import { store } from './store'
import './autoConnectHandler' // Initialize auto-connect handling

function ApplicationRenderer(props: { theme: 'light' | 'dark' }) {
  const theme = props.theme === 'light' ? themes.lightTheme : themes.darkTheme

  // Mirror the selected theme onto the document root so the dashboard's CSS
  // custom properties can respond to it (see dashboard.css's light-theme
  // block). Previously the MUI ThemeProvider below was the *only* thing the
  // toggle drove, while `.cmom-dashboard` hardcoded a dark palette — so
  // switching to light repainted the MUI-styled regions (Explorer tree,
  // dialogs, inputs) and left every dashboard surface dark. That split is
  // what read as "dark mode only affects some sides of the window".
  //
  // Set on documentElement rather than a React-rendered wrapper because some
  // surfaces (MUI Portals for dialogs/menus, and the body background itself)
  // render outside this tree and still need to match.
  React.useEffect(() => {
    document.documentElement.setAttribute('data-cmom-theme', props.theme)
    document.documentElement.style.colorScheme = props.theme
  }, [props.theme])

  return (
    <ThemeProvider theme={theme}>
      <LegacyThemeProvider theme={theme}>
        <App />
        <Demo />
      </LegacyThemeProvider>
    </ThemeProvider>
  )
}

const mapStateToProps = (state: AppState) => ({
  theme: state.settings.get('theme'),
})

const Application = connect(mapStateToProps)(ApplicationRenderer)

const root = ReactDOM.createRoot(document.getElementById('app')!)
root.render(
  <Provider store={store}>
    <BrowserAuthWrapper>
      <Application />
    </BrowserAuthWrapper>
  </Provider>
)
