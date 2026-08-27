import { Menu, app, BrowserWindow, webContents, MenuItemConstructorOptions, MenuItem } from 'electron'
import openAboutWindow from 'about-window'
import * as path from 'path'

const applicationMenu: MenuItemConstructorOptions = {
  label: 'Application',
  submenu: [
    {
      label: 'About Application',
      click: () => {
        openAboutWindow({
          icon_path: path.join(__dirname, '..', '..', 'icon.png'),
          license: 'CC-BY-ND-4.0',
          homepage: 'https://thomasnordquist.github.io/MQTT-Explorer/',
          bug_report_url: 'https://github.com/thomasnordquist/MQTT-Explorer/issues',
          description: 'Author: Thomas Nordquist',
        })
      },
    },
    {
      type: 'separator' as const,
    },
    {
      label: 'Dev Tools',
      accelerator: 'CmdOrCtrl+Alt+I',
      role: 'toggleDevTools',
    },
    {
      label: 'Quit',
      accelerator: 'Command+Q',
      click: () => {
        app.quit()
      },
    },
  ],
}

const editMenu: MenuItemConstructorOptions = {
  label: 'Edit',
  submenu: [
    {
      label: 'Undo',
      accelerator: 'CmdOrCtrl+Z',
      role: 'undo',
    },
    {
      label: 'Redo',
      accelerator: 'Shift+CmdOrCtrl+Z',
      role: 'redo',
    },
    {
      type: 'separator',
    },
    {
      label: 'Cut',
      accelerator: 'CmdOrCtrl+X',
      role: 'cut',
    },
    {
      label: 'Copy',
      accelerator: 'CmdOrCtrl+C',
      role: 'copy',
    },
    {
      label: 'Paste',
      accelerator: 'CmdOrCtrl+V',
      role: 'paste',
    },
    {
      label: 'Select All',
      accelerator: 'CmdOrCtrl+A',
      role: 'selectAll',
    },
  ],
}

function zoomIn() {
  const window = BrowserWindow.getFocusedWindow()
  if (window) {
    const zoom = window.webContents.getZoomFactor()
    window.webContents.setZoomFactor(Math.min(zoom + 0.1, 3.0))
  }
}

function zoomOut() {
  const window = BrowserWindow.getFocusedWindow()
  if (window) {
    const zoom = window.webContents.getZoomFactor()
    window.webContents.setZoomFactor(Math.max(zoom - 0.1, 0.3))
  }
}

function resetZoom() {
  const window = BrowserWindow.getFocusedWindow()
  if (window) {
    window.webContents.setZoomFactor(1)
  }
}

const viewMenu: MenuItemConstructorOptions = {
  label: 'View',
  submenu: [
    {
      label: 'Default size',
      accelerator: 'CmdOrCtrl+0',
      click: resetZoom,
    },
    {
      label: 'Increase size',
      // 'CmdOrCtrl+Plus' alone only fires when Shift is literally held (most
      // layouts need Shift to type '+') — 'CmdOrCtrl+=' is the unshifted key
      // people actually press, and is what browsers bind for zoom-in, so
      // register both plus the numpad key rather than relying on one string.
      accelerator: 'CmdOrCtrl+=',
      click: zoomIn,
    },
    {
      label: 'Increase size (numpad)',
      accelerator: 'CmdOrCtrl+numadd',
      visible: false,
      click: zoomIn,
    },
    {
      label: 'Increase size (shift)',
      accelerator: 'CmdOrCtrl+Shift+=',
      visible: false,
      click: zoomIn,
    },
    {
      label: 'Reduce size',
      accelerator: 'CmdOrCtrl+-',
      click: zoomOut,
    },
    {
      label: 'Reduce size (numpad)',
      accelerator: 'CmdOrCtrl+numsub',
      visible: false,
      click: zoomOut,
    },
  ],
}

const template: any = [applicationMenu, editMenu, viewMenu]

export const menuTemplate = Menu.buildFromTemplate(template)
