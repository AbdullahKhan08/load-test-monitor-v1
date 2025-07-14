// licenseManager.js
const axios = require('axios')
const { machineIdSync } = require('node-machine-id')
const fs = require('fs-extra')
const { signData } = require('./utils')
require('dotenv').config()

// ✅ Allow easy environment override
const SERVER_URL =
  process.env.LICENSE_SERVER_URL || 'https://license-server-0tjb.onrender.com'
const SECRET_KEY = process.env.LICENSE_SECRET // ✅ ADDED fallback for HMAC

/**
 * ✅ Verify signature locally using HMAC SHA256
 * @param {string} licenseKey
 * @param {string} organization
 * @param {string} deviceFingerprint
 * @param {string} signature
 */
function verifySignature(
  licenseKey,
  organization,
  deviceFingerprint,
  signature
) {
  const expectedSig = signData(licenseKey, organization, deviceFingerprint)
  console.log('🔍 Expected:', expectedSig)
  console.log('📄 From File:', signature)
  return expectedSig === signature
}

/**
 * ✅ Check license validity on launch (Local Validation Only)
 * @param {string} licenseFilePath - Full path to license.json inside userData
 */
async function checkLicense(licenseFilePath) {
  if (!fs.existsSync(licenseFilePath)) {
    console.log('ℹ️ No license file found.')
    return { valid: false, message: 'No license found' }
  }
  try {
    const licenseData = await fs.readJSON(licenseFilePath)
    const { licenseKey, organization, deviceFingerprint, signature } =
      licenseData
    if (!licenseKey || !deviceFingerprint || !organization || !signature)
      throw new Error('Invalid license file')

    // ✅ Validate on server with signature
    //     const response = await axios.post(`${SERVER_URL}/validate`, {
    //       licenseKey,
    //       organization,
    //       deviceFingerprint,
    //       signature, // ✅ send signature for added validation
    //     })

    //     if (response.data.success) {
    //       console.log('✅ License valid.')
    //       return { valid: true, message: 'License valid' }
    //     } else {
    //       console.log('❌ License invalid:', response.data.message)
    //       return { valid: false, message: response.data.message }
    //     }
    //   } catch (err) {
    //     console.error('❌ Validation error:', err.message)
    //     return { valid: false, message: err.message }
    //   } // ✅ Local signature validation instead of contacting server
    const isValid = verifySignature(
      licenseKey,
      organization,
      deviceFingerprint,
      signature
    )
    if (isValid) {
      console.log('✅ License valid (local check).')
      return { valid: true, message: 'License valid' }
    } else {
      console.log('❌ License signature mismatch.')
      await fs.remove(licenseFilePath)
      return { valid: false, message: 'Invalid license signature' }
    }
  } catch (err) {
    console.error('❌ Local validation error:', err.message)
    await fs.remove(licenseFilePath)
    return { valid: false, message: err.message }
  }
}

// ✅ Activate license if no license.json found or on user action
/**
 * ✅ Activate license and store securely
 * @param {string} licenseKey
 * @param {string} organization
 * @param {string} licenseFilePath - Full path to license.json inside userData
 */
async function activateLicense(licenseKey, organization, licenseFilePath) {
  try {
    // ✅ Generate secure hardware fingerprint
    const deviceFingerprint = machineIdSync({ original: true })

    const response = await axios.post(`${SERVER_URL}/activate`, {
      licenseKey,
      organization,
      deviceFingerprint,
    })

    if (response.data.status === 'approved') {
      const signature = response.data.signature
      const licenseData = {
        licenseKey,
        organization,
        deviceFingerprint,
        signature,
      }
      // ✅ Store license.json securely in userData path
      await fs.ensureDir(path.dirname(licenseFilePath))
      await fs.writeJSON(licenseFilePath, licenseData, { spaces: 2 })
      console.log('✅ License activated and saved.')
      return { success: true, message: 'Activated', data: licenseData }
    } else {
      console.log('ℹ️ Activation pending:', response.data.message)
      return { success: false, message: response.data.message }
    }
  } catch (err) {
    if (
      err.code === 'ECONNREFUSED' ||
      err.code === 'ENOTFOUND' ||
      err.message.includes('Network Error') ||
      err.message.includes('timeout')
    ) {
      console.error('❌ Network/server error during activation:', err.message)
      return {
        success: false,
        message:
          '❌ Cannot reach server to activate. Please check your network or try again later.',
      }
    }
    // ✅ Extract and return detailed message from server if available
    if (err.response && err.response.data && err.response.data.message) {
      console.error('❌ Activation error:', err.response.data.message)
      return {
        success: false,
        message: err.response.data.message,
      }
    }

    console.error('❌ Activation error:', err.message)
    return {
      success: false,
      message: err.message,
    }
  }
}

module.exports = { checkLicense, activateLicense }
