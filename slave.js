const modbus = require('jsmodbus')
const net = require('net')

// Create TCP server for now (easier to debug, switch to RTU if needed)

const server = new net.Server()
const holding = Buffer.alloc(4) // 2 registers x 2 bytes each

// Initialize with zero load
// holding.writeUInt16BE(0, 0)

server.listen(8502, () => {
  console.log('✅ SAMAA Load Cell Slave Simulator started on port 8502')
})

const serverTCP = new modbus.server.TCP(server, {
  holding: holding,
})

// Initial test value
let testLoadKg = 0 // Start from 0 for realistic lift simulation

serverTCP.on('connection', () => {
  console.log('✅ Master connected to SAMAA Load Cell Slave Simulator')
})

// Increment weight to simulate lifting
const maxLoadKg = 5000 // 100 tons in kg

const incrementInterval = setInterval(() => {
  if (testLoadKg < maxLoadKg) {
    const increment = Math.random() * 100 + 50 // 50-150 kg increments
    testLoadKg += increment
    if (testLoadKg > maxLoadKg) testLoadKg = maxLoadKg

    const scaledLoad = Math.round(testLoadKg / 10) // kg x 10, per DLC-6
    holding.writeUInt16BE((scaledLoad >> 16) & 0xffff, 0) // High word if needed
    holding.writeUInt16BE(scaledLoad & 0xffff, 2) // Low word

    console.log(
      `Simulated Load: ${testLoadKg.toFixed(2)} kg (${(
        testLoadKg / 1000
      ).toFixed(2)} tons) | Raw: ${scaledLoad}`
    )
  }
}, 1000) // Update every 2 seconds for realistic lift speed

// slave.js
// const modbus = require('jsmodbus')
// const net = require('net')

// // Create TCP server for simulation
// const server = new net.Server()
// const holding = Buffer.alloc(4) // 2 registers x 2 bytes

// server.listen(8502, () => {
//   console.log('✅ SAMAA Load Cell Slave Simulator started on port 8502')
// })

// const serverTCP = new modbus.server.TCP(server, { holding })

// serverTCP.on('connection', () => {
//   console.log('✅ Master connected to SAMAA Load Cell Slave Simulator')
// })

// // === SIMULATION CONFIGURATION ===
// let testLoadKg = 0
// const maxLoadKg = 20000 // 20 tons for testing
// const incrementMin = 20 // min increment per step (kg)
// const incrementMax = 60 // max increment per step (kg)
// const incrementIntervalMs = 1000 // update every second

// let holdingPhase = false
// let holdCounter = 0
// const holdMaxCount = 30 // hold for 30 intervals (~30 sec) before optional drop

// // === SIMULATION LOOP ===
// setInterval(() => {
//   if (!holdingPhase) {
//     // RAMP UP PHASE
//     const increment =
//       Math.random() * (incrementMax - incrementMin) + incrementMin
//     testLoadKg += increment
//     if (testLoadKg >= maxLoadKg) {
//       testLoadKg = maxLoadKg
//       holdingPhase = true
//       console.log(
//         `🛑 Entering HOLD phase at ${testLoadKg.toFixed(2)} kg (${(
//           testLoadKg / 1000
//         ).toFixed(2)} t)`
//       )
//     }
//   } else {
//     // HOLD PHASE
//     holdCounter++
//     if (holdCounter === holdMaxCount) {
//       // Optional drop to test recovery
//       console.log(`🔻 Simulating sudden drop for recovery test.`)
//       testLoadKg -= 3000 // drop by 3 tons
//       if (testLoadKg < 0) testLoadKg = 0
//       holdingPhase = false
//       holdCounter = 0
//     }
//     // else remain at current testLoadKg
//   }

//   // === Write to Modbus Holding Registers ===
//   const scaledLoad = Math.round(testLoadKg / 10) // DLC-6 scaling
//   holding.writeUInt16BE((scaledLoad >> 16) & 0xffff, 0) // High word
//   holding.writeUInt16BE(scaledLoad & 0xffff, 2) // Low word

//   console.log(
//     `📡 Simulated Load: ${testLoadKg.toFixed(2)} kg (${(
//       testLoadKg / 1000
//     ).toFixed(2)} t) | Raw: ${scaledLoad}`
//   )
// }, incrementIntervalMs)
