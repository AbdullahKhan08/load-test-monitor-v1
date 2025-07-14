// settingsManager.js
const fs = require('fs-extra')
const path = require('path')
const state = require('./state')
const { ipcRenderer } = require('electron')
let settingsFile = null
let settingsDir = null

const defaultSettings = {
  companyName: 'Your Company Name',
  defaultTestLocation: 'Your Default Location',
}

/**
 * Loads settings from settings/settings.json and updates state.
 */
async function loadSettings() {
  const userDataPath = await ipcRenderer.invoke('get-user-data-path')
  settingsDir = path.join(userDataPath, 'Settings')
  settingsFile = path.join(settingsDir, 'settings.json')

  if (await fs.pathExists(settingsFile)) {
    try {
      const data = JSON.parse(fs.readFileSync(settingsFile, 'utf-8'))
      state.set('settings', data || defaultSettings)
      console.log('✅ Settings loaded:', data)
    } catch (err) {
      console.error('❌ Failed to parse settings.json, using defaults:', err)
      state.set('settings', defaultSettings)
      await saveSettings(defaultSettings)
    }
  } else {
    console.log('ℹ️ No settings file found, using defaults.')
    state.set('settings', defaultSettings)
    await saveSettings(defaultSettings)
  }
}

/**
 * Saves settings to disk and updates state.
 * @param {object} settings
 */
async function saveSettings(settings) {
  const userDataPath = await ipcRenderer.invoke('get-user-data-path')
  settingsDir = path.join(userDataPath, 'Settings')
  settingsFile = path.join(settingsDir, 'settings.json')
  fs.ensureDirSync(settingsDir) // ensure Settings directory exists
  fs.writeFileSync(settingsFile, JSON.stringify(settings, null, 2))
  state.set('settings', settings)
  console.log('✅ Settings saved:', settings)
}

module.exports = { loadSettings, saveSettings }
