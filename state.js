// state.js
const EventEmitter = require('events')

class StateManager extends EventEmitter {
  constructor() {
    super()
    this.state = {
      testMetadata: {},
      masterCalibrationData: {},
      chartData: [],
      peakValue: 0,
      isPolling: false,
      chartInstance: null, // ✅ ADDED for Chart.js management
      settings: {}, // ✅ ADDED: settings object (company name)
      isDeviceConnected: false,
      lastLoadTons: 0,
      lastPushTime: 0,
    }
  }

  get(key) {
    return this.state[key]
  }

  set(key, value) {
    if (!(key in this.state)) {
      console.warn(`⚠️ Attempt to set unknown state key: ${key}`)
    }
    this.state[key] = value
    this.emit('change', { key, value })
    console.log(`🔄 State updated: ${key}`, value)
  }

  subscribe(callback) {
    this.on('change', callback)
  }
}

module.exports = new StateManager()
