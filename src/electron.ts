import * as log from 'electron-log'
import * as path from 'path'
import * as dotenv from 'dotenv'
import ConfigStorage from '../backend/src/ConfigStorage'
import { MessageHistoryStore } from '../backend/src/Model/MessageHistoryStore'
import { app, BrowserWindow, Menu, dialog } from 'electron'
import { autoUpdater } from 'electron-updater'
import { ConnectionManager } from '../backend/src/index'
import { promises as fsPromise } from 'fs'
// import { electronTelemetryFactory } from 'electron-telemetry'
import { menuTemplate } from './MenuTemplate'
import buildOptions from './buildOptions'
import {
  waitForDevServer,
  isDev,
  runningUiTestOnCi,
  loadDevTools,
  enableMcpIntrospection,
  getRemoteDebuggingPort,
} from './development'
import { shouldAutoUpdate, handleAutoUpdate } from './autoUpdater'
import { registerCrashReporter } from './registerCrashReporter'
import { makeOpenDialogRpc, makeSaveDialogRpc } from '../events/OpenDialogRequest'
import { getAppVersion, writeToFile, readFromFile } from '../events'
import { backendRpc, backendEvents } from '../events/EventSystem/EventBus'
import { RpcEvents } from '../events/EventsV2'
import {
  getFlowMonitorBaseline,
  getFlowMonitorHistory,
  getFlowMonitorPortInfo,
  getPumpStationWetWellInfo,
  getManholeInfo,
} from './sqlReporting'

// SQL_SERVER/SQL_DATABASE/SQL_USER/etc (see src/sqlReporting.ts) have to be
// real process.env vars for the desktop app the same way docker-compose sets
// them for the browser/server deployment — but a double-clicked .exe has no
// shell to inherit them from, so without this every SQL-backed RPC silently
// reports "not configured" even when SQL Server itself is reachable and the
// query is correct. Loads a plain KEY=value .env file from the same
// userData folder settings.json/message-history.json already live in (see
// the ConfigStorage/MessageHistoryStore setup below) — user-writable and
// stable across installs, unlike trying to set Windows system/user env vars
// and relying on a relaunch to pick them up. Silently does nothing if the
// file doesn't exist (MQTT-only is still a fully supported mode).
const envFilePath = path.join(app.getPath('userData'), '.env')
const dotenvResult = dotenv.config({ path: envFilePath })
// One line either way so "SQL reads return configured:false" is diagnosable
// from the log alone next time, instead of re-deriving this from scratch —
// this exact silent-failure shape (env vars simply never reaching the
// process) is what happened before this loader existed.
console.log(
  dotenvResult.error
    ? `[env] No .env file at ${envFilePath} (${(dotenvResult.error as NodeJS.ErrnoException).code ?? 'error'}) — SQL reporting stays unconfigured unless SQL_SERVER etc are set some other way.`
    : `[env] Loaded ${Object.keys(dotenvResult.parsed ?? {}).length} var(s) from ${envFilePath}`
)

registerCrashReporter()

// if (!isDev() && !runningUiTestOnCi()) {
//   const electronTelemetry = electronTelemetryFactory('9b0c8ca04a361eb8160d98c5', buildOptions)
// }

// disable-dev-shm-usage is required to run the debug console
app.commandLine.appendSwitch('--no-sandbox --disable-dev-shm-usage')

// Enable remote debugging for MCP introspection
const remoteDebuggingPort = getRemoteDebuggingPort()
if (remoteDebuggingPort) {
  app.commandLine.appendSwitch('--remote-debugging-port', remoteDebuggingPort.toString())
  log.info(`Remote debugging enabled on port ${remoteDebuggingPort}`)
}

app.whenReady().then(() => {
  backendRpc.on(makeOpenDialogRpc(), async request =>
    dialog.showOpenDialog(BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0], request)
  )

  backendRpc.on(makeSaveDialogRpc(), async request =>
    dialog.showSaveDialog(BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0], request)
  )

  backendRpc.on(getAppVersion, async () => app.getVersion())

  backendRpc.on(writeToFile, async ({ filePath, data, encoding }) => {
    await fsPromise.writeFile(filePath, Buffer.from(data, 'base64'), { encoding: encoding as BufferEncoding })
  })

  backendRpc.on(readFromFile, async ({ filePath, encoding }) => {
    if (encoding) {
      const content = await fsPromise.readFile(filePath, { encoding: encoding as BufferEncoding })
      return Buffer.from(content)
    }
    return fsPromise.readFile(filePath)
  })

  // Certificate upload handler - works for both Electron and browser mode via IPC
  backendRpc.on(RpcEvents.uploadCertificate, async ({ filename, data }) =>
    // In Electron, we just return the data as-is since it's already read
    // The client will use it directly
    ({
      name: filename,
      data,
    })
  )

  // Direct SQL Server reads for report-style data (baselines, historical
  // comparisons, port/pipe dimensions) — previously registered only in
  // src/server.ts (browser/server mode), which meant these hooks hung
  // forever with no response in the Electron desktop app (no handler on
  // this RPC topic at all). Same env-var config (SQL_SERVER etc) applies
  // here; unconfigured still degrades to "unavailable", not an error — see
  // src/sqlReporting.ts.
  backendRpc.on(RpcEvents.getFlowMonitorBaseline, async ({ siteNumber }) => {
    try {
      return await getFlowMonitorBaseline(siteNumber)
    } catch (error) {
      console.error('[SQL] getFlowMonitorBaseline failed:', error instanceof Error ? error.message : error)
      return { configured: true, siteNumber, channels: [] }
    }
  })

  backendRpc.on(RpcEvents.getFlowMonitorHistory, async ({ siteNumber, hours }) => {
    try {
      return await getFlowMonitorHistory(siteNumber, hours)
    } catch (error) {
      console.error('[SQL] getFlowMonitorHistory failed:', error instanceof Error ? error.message : error)
      return { configured: true, siteNumber, points: [] }
    }
  })

  backendRpc.on(RpcEvents.getFlowMonitorPortInfo, async ({ siteNumber }) => {
    try {
      return await getFlowMonitorPortInfo(siteNumber)
    } catch (error) {
      console.error('[SQL] getFlowMonitorPortInfo failed:', error instanceof Error ? error.message : error)
      return { configured: true, siteNumber, ports: [] }
    }
  })

  backendRpc.on(RpcEvents.getPumpStationWetWellInfo, async ({ serial }) => {
    try {
      return await getPumpStationWetWellInfo(serial)
    } catch (error) {
      console.error('[SQL] getPumpStationWetWellInfo failed:', error instanceof Error ? error.message : error)
      return { configured: true, serial, wetWell: null }
    }
  })

  backendRpc.on(RpcEvents.getManholeInfo, async () => {
    try {
      return await getManholeInfo()
    } catch (error) {
      console.error('[SQL] getManholeInfo failed:', error instanceof Error ? error.message : error)
      return { configured: true, records: [] }
    }
  })

  messageHistoryStore.init(backendRpc).catch(error => console.error('[MessageHistoryStore] init failed:', error))
})

autoUpdater.logger = log
log.info('App starting...')

const messageHistoryStore = new MessageHistoryStore(path.join(app.getPath('userData'), 'message-history.json'))
const connectionManager = new ConnectionManager(backendEvents, messageHistoryStore)
connectionManager.manageConnections()

const configStorage = new ConfigStorage(path.join(app.getPath('userData'), 'settings.json'), backendRpc)
configStorage.init()

// Keep a global reference of the window object, if you don't, the window will
// be closed automatically when the JavaScript object is garbage collected.
let mainWindow: BrowserWindow | undefined

async function createWindow() {
  if (isDev()) {
    await waitForDevServer()
    loadDevTools()
  }

  const iconPath = path.join(__dirname, '..', '..', 'icon.png')
  // Create the browser window.
  mainWindow = new BrowserWindow({
    width: 1024,
    height: 720,
    show: false,
    webPreferences: {
      ...({ enableRemoteModule: true } as any),
      contextIsolation: false,
      nodeIntegration: true,
      devTools: true,
      sandbox: false,
    },
    icon: iconPath,
  })

  // Hides the native File/Edit/View menu bar (Windows/Linux — macOS's menu
  // lives in the OS top bar regardless). The application menu itself stays
  // set via Menu.setApplicationMenu below purely so its accelerators keep
  // working with no visible bar — in particular View's Ctrl+Plus/Ctrl+-/
  // Ctrl+0 zoom shortcuts (see MenuTemplate.ts), which the user explicitly
  // wants to keep.
  mainWindow.setMenuBarVisibility(false)
  mainWindow.setAutoHideMenuBar(true)

  mainWindow.once('ready-to-show', () => {
    if (mainWindow) {
      runningUiTestOnCi() && mainWindow.setFullScreen(true)
      mainWindow.show()
    }
  })

  // Load the index.html of the app.
  if (isDev()) {
    mainWindow.loadURL('http://localhost:8080')
  } else {
    mainWindow.loadFile('app/build/index.html')
  }

  // Emitted when the window is closed.
  mainWindow.on('close', () => {
    connectionManager.closeAllConnections()
  })

  // Emitted when the window is closed.
  mainWindow.on('closed', () => {
    // Dereference the window object, usually you would store windows
    // in an array if your app supports multi windows, this is the time
    // when you should delete the corresponding element.
    mainWindow = undefined
    app.quit()
  })
}

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.on('ready', () => {
  Menu.setApplicationMenu(menuTemplate)
  createWindow()

  if (shouldAutoUpdate(buildOptions)) {
    handleAutoUpdate()
  }
})

app.on('before-quit', () => {
  messageHistoryStore.destroy().catch(error => console.error('[MessageHistoryStore] flush on quit failed:', error))
})

// Quit when all windows are closed.
app.on('window-all-closed', () => {
  // On macOS it is common for applications and their menu bar
  // to stay active until the user quits explicitly with Cmd + Q
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('activate', () => {
  // On macOS it's common to re-create a window in the app when the
  // dock icon is clicked and there are no other windows open.
  if (mainWindow === null) {
    createWindow()
  }
})

// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and require them here.
