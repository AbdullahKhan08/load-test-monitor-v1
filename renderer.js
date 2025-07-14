const {
  loadMasterCalibration,
  collectAndSaveCalibration,
  collectAndSaveEquipmentTest,
  resetEquipmentData,
  isTestMetadataComplete,
} = require('./formManager')
const { updateStatus } = require('./utils')
const path = require('path')
const {
  startPolling,
  stopPolling,
  clearChartData,
  resetPeakValue,
  connectDevice,
  client,
} = require('./modbusManager')
const { activateLicense } = require('./licenseManager')
const { downloadReport } = require('./reportManager')
const { clearChart } = require('./chartManager')
const state = require('./state')
const { loadSettings, saveSettings } = require('./settingsManager')
const { ipcRenderer } = require('electron')
// const { app } = require('electron').remote || require('@electron/remote')

// ------------------- Constants --------------------
const calibrationForm = document.getElementById('masterCalibrationForm')
const equipmentForm = document.getElementById('equipmentTestForm')
const startButton = document.getElementById('startButton')
const stopButton = document.getElementById('stopButton')
const downloadButton = document.getElementById('downloadButton')
const clearDataButton = document.getElementById('clearDataButton')
const connectButton = document.getElementById('connectButton')

startButton.disabled = false // make true later
stopButton.disabled = true
downloadButton.disabled = true

// const logoPath = path.join(process.resourcesPath, 'assets', 'long-logo.png')

// Dynamically update the image in the DOM
// document.querySelector('#activationNavbar img').src = `file://${logoPath}`

// ------------------- License Helper --------------------
async function getLicenseFilePath() {
  // ✅ UPDATED: Await userDataPath from main
  const userDataPath = await ipcRenderer.invoke('get-user-data-path') // ✅ ADDED
  return path.join(userDataPath, 'license.json') // ✅ ADDED
}

// ✅ Page toggle helpers
function showActivationPage() {
  document.getElementById('activationPage').style.display = 'block'
  document.getElementById('mainAppPage').style.display = 'none'
}

function showMainApp() {
  document.getElementById('activationPage').style.display = 'none'
  document.getElementById('mainAppPage').style.display = 'block'
}

// ------------------- DOMContentLoaded --------------------
window.addEventListener('DOMContentLoaded', async () => {
  const activationStatus = document.getElementById('activationStatus')
  activationStatus.innerText = 'Checking license...'
  try {
    const result = await ipcRenderer.invoke('check-license') // ✅ UPDATED
    if (result.valid) {
      showMainApp()
      activationStatus.innerText = '✅ License valid. Loading app...'
    } else {
      showActivationPage()
      activationStatus.innerText = '⚠️ ' + result.message
    }
  } catch (err) {
    console.error('❌ License check failed:', err.message)
    showActivationPage()
    activationStatus.innerText = '⚠️ ' + err.message
  }
  try {
    if (typeof loadMasterCalibration === 'function' && calibrationForm) {
      loadMasterCalibration(calibrationForm)
      clearChart()
    }
    await loadSettings()
    // Fix timing issue with logo
    setTimeout(() => {
      loadSettingsIntoForm()
      loadLogoPreview()
      const settings = state.get('settings') || {}
      const locationInput = document.querySelector(
        '#equipmentTestForm [name="location"]'
      )
      if (
        locationInput &&
        (!locationInput.value || locationInput.value.trim() === '') &&
        settings.defaultTestLocation
      ) {
        locationInput.value = settings.defaultTestLocation
        console.log(
          `ℹ️ Loaded default test location: ${settings.defaultTestLocation}`
        )
      } // ✅ PREVIEW logo on app load
    }, 100)
    populateSerialPorts()
  } catch (err) {
    console.error('❌ Error loading settings on startup:', err)
  }
  const testDateInput = document.querySelector(
    '#equipmentTestForm [name="testDate"]'
  )
  if (testDateInput && !testDateInput.value) {
    const today = new Date().toISOString().split('T')[0]
    testDateInput.value = today
  }
})

// ------------------- Activation Handler --------------------
document.getElementById('activateBtn').addEventListener('click', async () => {
  const licenseKey = document.getElementById('licenseKeyInput').value.trim()
  const organization = document.getElementById('organizationInput').value.trim()
  const activationStatus = document.getElementById('activationStatus')

  if (!licenseKey || !organization) {
    activationStatus.innerText = '⚠️ Please fill in all fields.'
    return
  }
  activationStatus.innerText = 'Activating...'

  const licenseFilePath = await getLicenseFilePath() // ✅ ADDED
  const result = await activateLicense(
    licenseKey,
    organization,
    licenseFilePath
  )
  if (result.success) {
    activationStatus.innerText = '✅ License activated. Restarting...'
    setTimeout(() => {
      window.location.reload() // reload to auto-validate
    }, 2000)
  } else {
    activationStatus.innerText = '❌ ' + result.message
  }
})

// ------------------- Logo Upload --------------------
document.getElementById('uploadLogoBtn').addEventListener('click', async () => {
  const filePath = await ipcRenderer.invoke('select-logo')
  if (filePath) {
    // document.getElementById('logoPathDisplay').innerText = filePath

    const settings = state.get('settings') || {}
    settings.logoPath = filePath
    state.set('settings', settings)
    await saveSettings(settings)
    loadLogoPreview()
  }
})

function loadLogoPreview() {
  const settings = state.get('settings') || {}
  const logoPreview = document.getElementById('logoPreview')
  if (logoPreview && settings.logoPath) {
    logoPreview.src = `file://${settings.logoPath}?t=${Date.now()}` // ✅ Force refresh
  }
}

function loadSettingsIntoForm() {
  const settings = state.get('settings') || {}
  document.getElementById('companyNameInput').value =
    settings.companyName || 'Your Company Name'
  document.getElementById('defaultLocationInput').value =
    settings.defaultTestLocation || 'Your Default Location'
}

// ------------------- Settings Form Save --------------------
document
  .getElementById('settingsForm')
  .addEventListener('submit', async (e) => {
    e.preventDefault()

    const companyName = document.getElementById('companyNameInput').value.trim()
    const defaultLocation = document
      .getElementById('defaultLocationInput')
      .value.trim()

    if (!companyName || !defaultLocation) {
      alert('⚠️ Please fill all required fields.')
      return
    }
    const currentSettings = state.get('settings') || {}
    currentSettings.companyName = companyName
    currentSettings.defaultTestLocation = defaultLocation

    try {
      await saveSettings(currentSettings)
      alert('✅ Settings saved.')
    } catch (err) {
      console.error('❌ Error saving settings:', err)
      alert('❌ Failed to save settings.')
    }
  })

// ------------------- Serial Port Logic --------------------
async function populateSerialPorts() {
  try {
    const response = await ipcRenderer.invoke('list-serial-ports')
    if (!response.success) {
      throw new Error(response.error || 'Unknown error')
    }
    const ports = response.ports
    const select = document.getElementById('serialPortSelect')
    select.innerHTML = '<option value="">Select Serial Port</option>'
    ports.forEach((port) => {
      const option = document.createElement('option')
      option.value = port.path
      option.textContent = `${port.path} (${port.manufacturer || 'Unknown'})`
      select.appendChild(option)
    })
    updateStatus('Status: Serial ports loaded', 'success')
  } catch (err) {
    console.error('❌ Failed to list serial ports:', err)
    updateStatus('Status: Failed to list serial ports', 'error')
    alert('❌ Failed to list serial ports. Check console for details.')
  }
}

// ✅ Load settings and calibration on startup
// window.addEventListener('DOMContentLoaded', async () => {
//   try {
//     if (typeof loadMasterCalibration === 'function' && calibrationForm) {
//       loadMasterCalibration(calibrationForm)
//       clearChart()
//     }
//     await loadSettings()
//     // Fix timing issue with logo
//     setTimeout(() => {
//       loadSettingsIntoForm()
//       loadLogoPreview()
//       const settings = state.get('settings') || {}
//       const locationInput = document.querySelector(
//         '#equipmentTestForm [name="location"]'
//       )
//       if (
//         locationInput &&
//         (!locationInput.value || locationInput.value.trim() === '') &&
//         settings.defaultTestLocation
//       ) {
//         locationInput.value = settings.defaultTestLocation
//         console.log(
//           `ℹ️ Loaded default test location: ${settings.defaultTestLocation}`
//         )
//       } // ✅ PREVIEW logo on app load
//     }, 100)
//     populateSerialPorts()
//   } catch (err) {
//     console.error('❌ Error loading settings on startup:', err)
//   }
// })

// fetch todays date
// window.addEventListener('DOMContentLoaded', () => {
//   const testDateInput = document.querySelector(
//     '#equipmentTestForm [name="testDate"]'
//   )
//   if (testDateInput && !testDateInput.value) {
//     const today = new Date().toISOString().split('T')[0]
//     testDateInput.value = today
//   }
// })

// ------------------- Button Events --------------------
document.getElementById('connectButton').addEventListener('click', async () => {
  const selectedPort = document.getElementById('serialPortSelect').value
  if (!selectedPort) {
    alert('⚠️ Please select a serial port to connect.')
    updateStatus('Status: No serial port selected', 'error')
    return
  }
  const connected = await connectDevice(selectedPort)
  updateStatus(
    connected
      ? `Status: Connected to ${selectedPort}`
      : 'Status: Connection failed',
    connected ? 'success' : 'error'
  )
  startButton.disabled = !connected
  // if (connected) {
  //   updateStatus(`Status: Connected to ${selectedPort}`, 'success')
  //   startButton.disabled = false // ✅ Enable start button after connection
  // } else {
  //   updateStatus('Status: Connection failed', 'error')
  // }
  // connectButton.disabled = false
})

startButton.addEventListener('click', () => {
  if (!isTestMetadataComplete()) {
    alert(
      '⚠️ Calibration or Equipment data incomplete. Please save all data before starting.'
    )
    updateStatus('Status: Data incomplete.', 'error')
    return
  }
  startPolling(
    startButton,
    stopButton,
    downloadButton,
    calibrationForm,
    equipmentForm
  )
})

stopButton.addEventListener('click', () =>
  stopPolling(startButton, stopButton, downloadButton)
)

document
  .getElementById('saveCalibrationButton')
  .addEventListener('click', (e) => {
    e.preventDefault()
    if (calibrationForm) {
      collectAndSaveCalibration(calibrationForm)
    }
  })

document
  .getElementById('saveEquipmentButton')
  .addEventListener('click', (e) => {
    e.preventDefault()
    if (equipmentForm) {
      collectAndSaveEquipmentTest(equipmentForm)
    }
  })

// ✅ Download Report with final validation
downloadButton.addEventListener('click', () => {
  if (!isTestMetadataComplete()) {
    alert(
      '⚠️ Calibration or Equipment data incomplete. Please save all data before downloading report.'
    )
    updateStatus('Status: Data incomplete.', 'error')
    return
  }
  downloadReport(startButton, stopButton, downloadButton)
})

clearDataButton.addEventListener('click', () => {
  const chartData = state.get('chartData') || []
  const tableHasData =
    document.getElementById('dataTableBody').children.length > 0
  if (chartData.length === 0 && !tableHasData) {
    alert('⚠️ No data to clear.')
    return
  }

  if (confirm('Clear all collected data? This cannot be undone.')) {
    if (state.get('isPolling')) {
      stopPolling(startButton, stopButton, downloadButton)
      console.log('✅ Polling stopped due to data clear.')
    }
    try {
      if (client && client.isOpen) {
        client.close((err) => {
          if (err) {
            console.error('❌ Error closing Modbus client:', err)
          } else {
            console.log('ℹ️ Modbus client connection closed.')
          }
        })
      }
    } catch (err) {
      console.error('⚠️ Error closing Modbus client:', err)
    }
    state.set('isDeviceConnected', false)
    // Clear chart data and reset visuals
    clearChartData()
    resetPeakValue()
    clearChart()

    // Clear data table
    document.getElementById('dataTableBody').innerHTML = ''
    // Clear displayed values
    document.getElementById('loadValue').innerText = '0.000 t / 0.00 kN'
    document.getElementById('lastTimestamp').innerText = 'Last Update: -'
    document.getElementById('peakDisplay').innerText = 'Peak Load: 0.000 t'
    document.getElementById('proofLoadDisplay').innerText =
      'Proof Load: 0.000 t'

    if (equipmentForm) equipmentForm.reset()
    // Preserve calibration, clear only equipment
    // Clear equipment data in state while preserving calibration
    resetEquipmentData()
    // Reset buttons
    updateStatus('Status: Ready', 'info')
    connectButton.disabled = false
    startButton.disabled = false
    stopButton.disabled = true
    downloadButton.disabled = true
    alert('✅ Data cleared.')
  }
})
