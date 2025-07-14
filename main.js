const { app, BrowserWindow, ipcMain, dialog } = require('electron')
const fs = require('fs-extra')
const path = require('path')
const { SerialPort } = require('serialport')
const { checkLicense } = require('./licenseManager')
require('dotenv').config()

if (process.env.NODE_ENV === 'development') {
  require('electron-reload')(process.cwd(), {
    electron: process.cwd() + '/node_modules/.bin/electron',
    ignored: /reports|settings/,
  })
}

let splash
let mainWindow

ipcMain.handle('list-serial-ports', async () => {
  try {
    const ports = await SerialPort.list()
    // console.log('✅ Available serial ports:', ports)
    return { success: true, ports }
  } catch (err) {
    console.error('❌ Failed to list serial ports:', err)
    return { success: false, error: err.message }
  }
})

ipcMain.handle('get-user-data-path', () => {
  const userDataPath = app.getPath('userData')
  console.log('✅ userDataPath:', userDataPath)
  return userDataPath
})

// ✅ ADDED: Handle license check via IPC
ipcMain.handle('check-license', async () => {
  // const licensePath = (app.getPath('userData'), 'license.json')
  const licensePath = path.join(app.getPath('userData'), 'license.json')
  const result = await checkLicense(licensePath)
  return result
})

ipcMain.handle('select-logo', async () => {
  const result = await dialog.showOpenDialog({
    title: 'Select Logo Image',
    filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg'] }],
    properties: ['openFile'],
  })

  if (result.canceled || result.filePaths.length === 0) return null

  const src = result.filePaths[0]
  const userDataPath = app.getPath('userData')
  const logosDir = path.join(userDataPath, 'Settings')
  await fs.ensureDir(logosDir)

  const dest = path.join(logosDir, 'logo.png')
  await fs.copyFile(src, dest)

  return dest // return copied logo path
})

function createSplash() {
  splash = new BrowserWindow({
    width: 600,
    height: 400,
    transparent: true,
    frame: false,
    alwaysOnTop: true,
    resizable: false,
  })
  // ✅ Attempt to load splash.html safely
  splash.loadFile(path.join(__dirname, 'splash.html')).catch((err) => {
    console.error('⚠️ Failed to load splash.html:', err)
    createMainWindow() // fallback immediately
    if (splash && !splash.isDestroyed()) splash.close()
  })

  // Normal splash duration flow
  setTimeout(() => {
    // Prevent double-calling if fallback already called createMainWindow
    if (splash && !mainWindow) {
      createMainWindow()
      if (splash && !splash.isDestroyed()) splash.close()
    }
  }, 3000) // show splash for 3 seconds
}

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 850,
    height: 650,
    fullscreen: true,
    show: false,
    icon: path.join(__dirname, 'assets/logo.png'),
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    },
  })
  // mainWindow.loadFile('index.html')
  mainWindow.loadFile(path.join(__dirname, 'index.html'))
  mainWindow.once('ready-to-show', () => {
    mainWindow.show()
  })
}

app.whenReady().then(() => {
  createSplash()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createMainWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
