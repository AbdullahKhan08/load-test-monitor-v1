const crypto = require('crypto')
require('dotenv').config()

/**
 * Updates the status badge with the provided text and status type.
 * @param {string} text
 * @param {'info' | 'success' | 'error' | 'warning'} statusType
 */
function updateStatus(text, statusType = 'info') {
  const statusEl = document.getElementById('status')
  if (!statusEl) {
    console.warn('⚠️ Status element not found.')
    return
  }
  statusEl.innerText = text

  const statusStyles = {
    info: { background: '#e0e7ef', color: '#0a3a71' },
    success: { background: '#d4edda', color: '#155724' },
    error: { background: '#f8d7da', color: '#721c24' },
    warning: { background: '#fff3cd', color: '#856404' },
  }

  const style = statusStyles[statusType] || statusStyles.info
  statusEl.style.background = style.background
  statusEl.style.color = style.color
}

/**
 * Collects the current data table rows into an array for report generation.
 * @returns {string[][]} Table data as array of [timestamp, kg, tons].
 */
function getTableData() {
  /** @type {string[][]} */
  const data = []
  const rows = document.querySelectorAll('#dataTableBody tr')

  rows.forEach((row) => {
    const cells = row.querySelectorAll('td')
    data.push([
      cells[0]?.textContent?.trim() || '',
      cells[1]?.textContent?.trim() || '',
      cells[2]?.textContent?.trim() || '',
    ])
  })

  return data
}

function signData(licenseKey, organization, deviceFingerprint) {
  // const secret = process.env.LICENSE_SECRET
  const secret = 'your secret'
  const payload = `${licenseKey}|${organization}|${deviceFingerprint}`
  return crypto.createHmac('sha256', secret).update(payload).digest('hex')
}

module.exports = { getTableData, updateStatus, signData }
