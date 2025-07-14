const express = require('express')
const mongoose = require('mongoose')
// const crypto = require('crypto')
const cors = require('cors')
const { signData } = require('./utils')
require('dotenv').config()
const app = express()
app.use(express.json())
app.use(cors())

// ✅ MongoDB connection
const URI = process.env.MONGODB_URI
const SECRET_KEY = process.env.LICENSE_SECRET
// console.log('server secret key', SECRET_KEY)
// ✅ ADDED fallback for HMAC

mongoose
  .connect(URI)
  .then(() => console.log('✅ Connected to MongoDB Atlas'))
  .catch((err) => {
    console.error('❌ MongoDB connection error:', err)
    process.exit(1)
  })

// ✅ License Schema
const licenseSchema = new mongoose.Schema({
  licenseKey: { type: String, required: true },
  organization: { type: String, required: true },
  maxDevices: { type: Number, default: 1 },
  activatedDevices: { type: [String], default: [] },
  issuedAt: { type: Date, default: Date.now },
  expiresAt: { type: Date },
  status: { type: String, default: 'active' },
  notes: { type: String },
})

// ✅ Activation Request Schema
const activationRequestSchema = new mongoose.Schema({
  licenseKey: { type: String, required: true },
  organization: { type: String, required: true },
  deviceFingerprint: { type: String, required: true },
  requestedAt: { type: Date, default: Date.now },
  status: { type: String, default: 'pending' }, // pending, approved, rejected
  notes: { type: String },
})

// ✅ Models
const License = mongoose.model('License', licenseSchema)
const ActivationRequest = mongoose.model(
  'ActivationRequest',
  activationRequestSchema
)

// ✅ HMAC Signature generator
// function signData(data, secret = SECRET_KEY) {
//   console.log('server secret key', secret)
//   return crypto.createHmac('sha256', secret).update(data).digest('hex')
// }

// 🟩 ACTIVATE ENDPOINT
app.post('/activate', async (req, res) => {
  const { licenseKey, organization, deviceFingerprint } = req.body

  if (!licenseKey || !organization || !deviceFingerprint) {
    return res.status(400).json({ success: false, message: 'Missing fields' })
  }

  try {
    const license = await License.findOne({ licenseKey })
    if (!license)
      return res
        .status(404)
        .json({ success: false, message: 'License not found' })
    if (license.status !== 'active')
      return res
        .status(403)
        .json({ success: false, message: 'License inactive' })
    if (license.organization !== organization)
      return res
        .status(403)
        .json({ success: false, message: 'Organization mismatch' })
    if (license.expiresAt && new Date() > license.expiresAt) {
      return res
        .status(403)
        .json({ success: false, message: 'License expired' })
    }

    const existingRequest = await ActivationRequest.findOne({
      licenseKey,
      organization,
      deviceFingerprint,
    })

    if (existingRequest) {
      if (existingRequest.status === 'approved') {
        // ✅ Check device limit and activate
        if (!license.activatedDevices.includes(deviceFingerprint)) {
          if (license.activatedDevices.length >= license.maxDevices) {
            return res
              .status(403)
              .json({ success: false, message: 'Device limit reached' })
          }
          license.activatedDevices.push(deviceFingerprint)
          await license.save()
          console.log(
            `✅ Device ${deviceFingerprint} activated under license ${licenseKey}`
          )
        }

        // const payload = `${licenseKey}|${organization}|${deviceFingerprint}`
        // const signature = signData(payload)
        const signature = signData(licenseKey, organization, deviceFingerprint)
        return res.json({ success: true, status: 'approved', signature })
      } else if (existingRequest.status === 'rejected') {
        return res
          .status(403)
          .json({ success: false, message: 'Request rejected' })
      } else {
        return res.json({
          success: true,
          status: 'pending',
          message: 'Awaiting admin approval',
        })
      }
    }

    // ✅ Create a new activation request if none exists
    const newRequest = new ActivationRequest({
      licenseKey,
      organization,
      deviceFingerprint,
    })
    await newRequest.save()
    console.log(
      `✅ Activation request created for ${deviceFingerprint} under license ${licenseKey}`
    )

    return res.json({
      success: true,
      status: 'pending',
      message: 'Activation request submitted. Awaiting admin approval.',
    })
  } catch (err) {
    console.error(err)
    return res.status(500).json({ success: false, message: 'Server error' })
  }
})

// 🟩 VALIDATE ENDPOINT WITH SIGNATURE CHECK
// app.post('/validate', async (req, res) => {
//   const { licenseKey, organization, deviceFingerprint, signature } = req.body

//   if (!licenseKey || !organization || !deviceFingerprint || !signature) {
//     return res.status(400).json({ success: false, message: 'Missing fields' })
//   }

//   try {
//     const license = await License.findOne({ licenseKey })
//     if (!license || license.status !== 'active') {
//       return res
//         .status(403)
//         .json({ success: false, message: 'License invalid or inactive' })
//     }
//     if (license.organization !== organization) {
//       return res
//         .status(403)
//         .json({ success: false, message: 'Organization mismatch' })
//     }
//     if (license.expiresAt && new Date() > license.expiresAt) {
//       return res
//         .status(403)
//         .json({ success: false, message: 'License expired' })
//     }

//     const activationRequest = await ActivationRequest.findOne({
//       licenseKey,
//       organization,
//       deviceFingerprint,
//       status: 'approved',
//     })

//     if (!activationRequest) {
//       return res.status(403).json({
//         success: false,
//         message: 'Device not authorized (no approved request)',
//       })
//     }

//     if (!license.activatedDevices.includes(deviceFingerprint)) {
//       return res
//         .status(403)
//         .json({ success: false, message: 'Device not activated under license' })
//     }

//     // ✅ Signature verification
//     const expectedSignature = signData(
//       `${licenseKey}|${organization}|${deviceFingerprint}`
//     )
//     if (signature !== expectedSignature) {
//       return res
//         .status(403)
//         .json({ success: false, message: 'Signature mismatch' })
//     }

//     console.log(
//       `✅ Validation success for device ${deviceFingerprint} under license ${licenseKey}`
//     )
//     return res.json({ success: true, message: 'License valid' })
//   } catch (err) {
//     console.error(err)
//     return res.status(500).json({ success: false, message: 'Server error' })
//   }
// })

// ✅ Start server
const PORT = process.env.PORT || 3000
app.listen(PORT, () => console.log(`✅ License server running on port ${PORT}`))
