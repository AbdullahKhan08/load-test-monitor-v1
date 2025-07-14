const fs = require('fs-extra')
const path = require('path')
const PDFDocument = require('pdfkit')
const { clearChart } = require('./chartManager')
const { updateStatus, getTableData } = require('./utils')
const { isTestMetadataComplete } = require('./formManager')
const state = require('./state')
const os = require('os')
const { ipcRenderer } = require('electron')
const { v4: uuidv4 } = require('uuid')

function downloadReport(startButton, stopButton, downloadButton) {
  try {
    const footerHeight = 15
    downloadButton.disabled = true
    const testMetadata = state.get('testMetadata') // ✅ CHANGED
    const chartData = state.get('chartData') // ✅ CHANGED

    if (!isTestMetadataComplete()) {
      alert(
        '⚠️ Calibration or Equipment data incomplete. Please save all data before downloading.'
      )
      updateStatus('Status: Data incomplete.', 'error')
      downloadButton.disabled = false
      return
    }

    if (!state.get('isPolling') && (!testMetadata || !testMetadata.equipment)) {
      alert(
        '⚠️ Equipment test data missing. Please complete and save before downloading.'
      )
      updateStatus('Status: Equipment data missing.', 'error')
      downloadButton.disabled = false
      return
    }

    const tableData = getTableData()
    if (!Array.isArray(tableData) || tableData.length === 0) {
      alert('⚠️ No test data recorded.')
      downloadButton.disabled = false
      return
    }

    const downloadsDir = path.join(os.homedir(), 'Downloads')
    const reportsDir = downloadsDir
    const equipmentNameSanitized = (testMetadata.equipment?.equipmentName || '')
      .replace(/[^a-z0-9]/gi, ' ')
      .substring(0, 30) // keep filename manageable
    const now = new Date()
    const datePart = now.toISOString().split('T')[0] // YYYY-MM-DD
    const timePart = now.toTimeString().split(' ')[0].replace(/:/g, '-') // HH-MM-SS
    const fileName = `${equipmentNameSanitized} Load Test Certificate ${datePart}_${timePart}.pdf`
    const filePath = path.join(reportsDir, fileName)

    const doc = new PDFDocument({ margin: 50, autoFirstPage: true })
    const stream = fs.createWriteStream(filePath)
    doc.pipe(stream)

    let pageNumber = 0

    function addFooter() {
      try {
        pageNumber++ // increment first

        const bottom = doc.page.margins.bottom
        doc.page.margins.bottom = 0
        const footerY = doc.page.height - 40
        // Always show company name on ALL pages
        doc
          .fontSize(10)
          .fillColor('gray')
          .text('Samaa Aerospace LLP', 50, footerY, { align: 'left' })
          .text('Load Test Monitor v1.0', 50, footerY + 12, { align: 'left' })

        // Show page number only from page 2 onwards
        if (pageNumber > 1) {
          doc.text(`Page ${pageNumber}`, -50, doc.page.height - 40, {
            align: 'right',
          })
        }
        doc.text('', 50, 50) // reset cursor
        doc.page.margins.bottom = bottom
      } catch (err) {
        console.error('⚠️ Footer rendering error:', err)
      }
    }

    addFooter() // Footer on first page
    doc.on('pageAdded', addFooter)

    const x = doc.page.margins.left
    let y = doc.page.margins.top
    const rowHeight = 20
    const settings = state.get('settings') || {}
    const companyName =
      settings.companyName || 'Indamer Technics Private Limited'

    const logoPath =
      settings.logoPath || path.join(__dirname, 'assets', 'indamer.png')
    // const logoPath = path.join(__dirname, 'assets', 'indamer.png') // old

    if (fs.existsSync(logoPath)) {
      const logoWidth = 80
      const logoHeight = 60
      const logoX = doc.page.width - doc.page.margins.right - logoWidth
      const logoY = doc.page.margins.top
      doc.image(logoPath, logoX, logoY, {
        width: logoWidth,
        height: logoHeight,
      })
    }

    doc
      .fontSize(14)
      .font('Helvetica-Bold')
      .fillColor('black')
      .text(companyName, { align: 'center' })
    y = doc.y + 10

    // === HEADER ===
    doc.fontSize(12).fillColor('black').text(`Load Test Certificate`, {
      align: 'center',
      continued: false,
    })

    // Add slight vertical spacing
    y = doc.y + 5

    // Test Date with "value" bold
    let baseDate = new Date()
    if (testMetadata.equipment && testMetadata.equipment.testDate) {
      const parsedDate = new Date(testMetadata.equipment.testDate)
      if (!isNaN(parsedDate)) {
        baseDate = parsedDate
      }
    }
    const testDate = baseDate.toLocaleDateString('en-GB')

    //  Calculate certificate validity (1 year from test date)
    const validityDate = new Date(baseDate)
    validityDate.setFullYear(validityDate.getFullYear() + 1)
    validityDate.setDate(validityDate.getDate() - 1)
    const validityDateStr = validityDate.toLocaleDateString()
    doc
      .fontSize(8)
      .fillColor('black')
      .font('Helvetica')
      .text('Test Date: ', x, y, { continued: true })
      .font('Helvetica-Bold')
      .text(testDate)
    y = doc.y + 7 // add extra space before metadata block
    doc
      .fontSize(8)
      .fillColor('black')
      .font('Helvetica')
      .text('Certificate Valid Upto: ', x, y, { continued: true })
      .font('Helvetica-Bold')
      .text(validityDateStr)

    y = doc.y + 15 // Adjust spacing before metadata table

    // === METADATA TABLE ===
    // 1) Remove redundant keys and remove proofLoad
    const calibrationEntries = Object.entries(testMetadata.calibration || {})
    const equipmentEntries = Object.entries(testMetadata.equipment || {})

    const masterEntries = calibrationEntries
    const filteredEquipmentEntries = equipmentEntries.filter(
      ([key]) =>
        ![
          'proofLoad',
          'testedBy',
          'certifiedBy',
          'certificateValidity',
          'testDate',
        ].includes(key)
    )

    const renderSection = (title, entries) => {
      // Add section heading
      doc
        .fontSize(10)
        .font('Helvetica-Bold')
        .fillColor('black')
        .text(title, x, y)
      y = doc.y + 5
      doc.fontSize(9).font('Helvetica')

      const half = Math.ceil(entries.length / 2)
      const leftEntries = entries.slice(0, half)
      const rightEntries = entries.slice(half)

      const colGap = 30
      const colWidth =
        (doc.page.width -
          doc.page.margins.left -
          doc.page.margins.right -
          colGap) /
        2
      const keyWidth = 130 // slightly increased for breathing space
      const valueWidth = colWidth - keyWidth - 10
      const adjustedRowHeight = 22

      for (let i = 0; i < half; i++) {
        const left = leftEntries[i]
        const right = rightEntries[i]
        let rowHeight = adjustedRowHeight

        if (left) {
          const [keyL, valueL] = left
          const cleanKeyL = keyL
            .replace(/([A-Z])/g, ' $1')
            .replace(/^./, (s) => s.toUpperCase())
            .trim()
          const hL = Math.max(
            doc.heightOfString(`${cleanKeyL}:`, { width: keyWidth }),
            doc.heightOfString(valueL, { width: valueWidth })
          )
          rowHeight = Math.max(rowHeight, hL + 6)
        }
        if (right) {
          const [keyR, valueR] = right
          const cleanKeyR = keyR
            .replace(/([A-Z])/g, ' $1')
            .replace(/^./, (s) => s.toUpperCase())
            .trim()
          const hR = Math.max(
            doc.heightOfString(`${cleanKeyR}:`, { width: keyWidth }),
            doc.heightOfString(valueR, { width: valueWidth })
          )
          rowHeight = Math.max(rowHeight, hR + 6)
        }

        // Shading
        if (i % 2 === 0) {
          doc.save()
          doc.rect(x, y, colWidth * 2 + colGap, rowHeight).fill('#f9f9f9')
          doc.restore()
        }

        if (left) {
          const [keyL, valueL] = left
          const cleanKeyL = keyL
            .replace(/([A-Z])/g, ' $1')
            .replace(/^./, (s) => s.toUpperCase())
            .trim()
          doc
            .fillColor('black')
            .text(`${cleanKeyL}:`, x + 5, y + 3, { width: keyWidth })
          doc.text(`${valueL}`, x + 5 + keyWidth, y + 3, { width: valueWidth })
        }
        if (right) {
          const [keyR, valueR] = right
          const cleanKeyR = keyR
            .replace(/([A-Z])/g, ' $1')
            .replace(/^./, (s) => s.toUpperCase())
            .trim()
          const rightX = x + colWidth + colGap
          doc
            .fillColor('black')
            .text(`${cleanKeyR}:`, rightX + 5, y + 3, { width: keyWidth })
          doc.text(`${valueR}`, rightX + 5 + keyWidth, y + 3, {
            width: valueWidth,
          })
        }

        y += rowHeight
      }

      y += 15 // spacing between sections
    }

    // === Render the sections ===
    renderSection('Master Calibration Data', masterEntries)
    renderSection('Tested Equipment Data', filteredEquipmentEntries)

    y += 10 // Padding before chart

    const chartCanvas = document.getElementById('loadChart')
    if (chartCanvas) {
      const chartImage = chartCanvas.toDataURL('image/png')
      const pageWidth =
        doc.page.width - doc.page.margins.left - doc.page.margins.right
      const imageWidth = pageWidth
      const imageHeight = 225
      const imageX = doc.page.margins.left + (pageWidth - imageWidth) / 2

      doc
        .fontSize(10)
        .fillColor('black')
        .text('Load vs Time Chart:', doc.page.margins.left, y, {
          align: 'center',
          width: pageWidth, // ensure true centering
        })
      y = doc.y + 5
      doc.image(chartImage, imageX, y, {
        width: imageWidth,
        height: imageHeight,
      })
      y += imageHeight + 10

      doc
        .fontSize(10)
        .font('Helvetica-Bold')
        .fillColor('black')
        .text(
          `Peak Load During Test: ${state.get('peakValue').toFixed(3)} t`,

          doc.page.margins.left,
          y,
          {
            align: 'center',
            width: pageWidth, // ensure true centering
          }
        )
      y = doc.y + 20
      doc
        .font('Helvetica-Bold')
        .fontSize(10)
        .fillColor('black')
        .text(
          `Proof Load Test Value: ${
            testMetadata.equipment.proofLoad
              ? testMetadata.equipment.proofLoad + ' t'
              : 'N/A'
          }`,
          { align: 'center' }
        )

      y = doc.y + 15
      //   y += imageHeight + 20
    }
    y += 20
    // === SIGNATURE BLOCK ===
    doc
      .font('Helvetica-Bold')
      .fontSize(9)
      .text(`Tested By: ${testMetadata.equipment.testedBy || ''}`, x, y)
      .text(
        `Certified By: ${testMetadata.equipment.certifiedBy || ''}`,
        x + 250,
        y
      )
    y += 15
    // doc.font('Helvetica').text(`Location: ${testMetadata.location || ''}`, x, y)
    // y += 15

    // === FORCE TEST DATA TO NEW PAGE ===
    doc.addPage()
    y = doc.page.margins.top
    // doc.fontSize(14).text('Test Data:', { underline: true })
    y = doc.y + 10

    const colTimeWidth = 180
    const colTonsWidth = 160
    const colkNWidth = 160

    // Test Data Table Header
    doc.save()
    doc
      .rect(x, y, colTimeWidth + colTonsWidth + colkNWidth, rowHeight)
      .fill('#e6e6e6')
    doc
      .fillColor('black')
      .font('Helvetica-Bold')
      .fontSize(10)
      .text('Timestamp', x + 5, y + 5, { width: colTimeWidth - 10 })
      .text('Load (t)', x + colTimeWidth + 5, y + 5, {
        width: colTonsWidth - 10,
        align: 'center',
      })
      .text('Load (kN)', x + colTimeWidth + colTonsWidth + 5, y + 5, {
        width: colkNWidth - 10,
        align: 'center',
      })
    doc.restore()
    y += rowHeight

    tableData.forEach((row, index) => {
      if (
        y + rowHeight >
        doc.page.height - doc.page.margins.bottom - footerHeight - 10
      ) {
        doc.addPage()
        y = doc.page.margins.top

        // Redraw table header
        doc.save()
        doc
          .rect(x, y, colTimeWidth + colTonsWidth + colkNWidth, rowHeight)
          .fill('#e6e6e6')
        doc
          .fillColor('black')
          .font('Helvetica-Bold')
          .fontSize(10)
          .text('Timestamp', x + 5, y + 5, { width: colTimeWidth - 10 })
          .text('Load (t)', x + colTimeWidth + 5, y + 5, {
            width: colTonsWidth - 10,
            align: 'center',
          })
          .text('Load (kN)', x + colTimeWidth + colTonsWidth + 5, y + 5, {
            width: colkNWidth - 10,
            align: 'center',
          })
        doc.restore()
        y += rowHeight
      }

      doc.save()
      if (index % 2 === 0) {
        doc
          .rect(x, y, colTimeWidth + colTonsWidth + colkNWidth, rowHeight)
          .fill('#f9f9f9')
      }
      doc.restore()

      doc
        .fillColor('black')
        .font('Helvetica')
        .fontSize(10)
        .text(row[0] || '', x + 5, y + 5, { width: colTimeWidth - 10 })
        .text(row[1] || '', x + colTimeWidth + 5, y + 5, {
          width: colTonsWidth - 10,
          align: 'center',
        })
        .text(row[2] || '', x + colTimeWidth + colTonsWidth + 5, y + 5, {
          width: colkNWidth - 10,
          align: 'center',
        })
      y += rowHeight
    })

    // y += 30

    doc.end()

    stream.on('finish', async () => {
      const userDataPath = await ipcRenderer.invoke('get-user-data-path')
      const testDataDir = path.join(userDataPath, 'Test Data') // ✅ Recommended
      const testsFilePath = path.join(testDataDir, 'tests.json')

      // ✅ Ensure reports dir exists
      try {
        await fs.ensureDir(testDataDir)
      } catch (e) {
        console.error('❌ Failed to create reports directory:', e)
        return alert('❌ Failed to create reports directory.')
      }

      let tests = []
      if (fs.existsSync(testsFilePath)) {
        try {
          tests = JSON.parse(fs.readFileSync(testsFilePath, 'utf-8'))
        } catch (e) {
          console.error(
            '⚠️ Could not parse existing tests.json. Initializing fresh.',
            e
          )
        }
      }

      // ✅ Double-check required data is defined
      const peakValue = state.get('peakValue')
      if (!testMetadata || !chartData || !Array.isArray(chartData)) {
        console.warn('⚠️ Missing test data for JSON.')
        return
      }

      const testEntry = {
        id: uuidv4(),
        metadata: testMetadata,
        chartData: chartData,
        peakValue: peakValue,
        filePath: filePath,
      }

      try {
        tests.push(testEntry)
        fs.writeFileSync(testsFilePath, JSON.stringify(tests, null, 2))
        console.log('✅ Test metadata saved to tests.json')
      } catch (err) {
        console.error('❌ Failed to write test metadata:', err)
        return alert('❌ Could not save test metadata to file.')
      }

      console.log(`📄 PDF report saved at: ${filePath}`)
      // === Clear state ===

      // Reset system

      const updatedMetadata = { ...testMetadata, equipment: {} }
      state.set('testMetadata', updatedMetadata)
      state.set('chartData', [])
      state.set('peakValue', 0)
      clearChart()
      document.getElementById('dataTableBody').innerHTML = ''
      const equipmentForm = document.getElementById('equipmentTestForm')
      if (equipmentForm) equipmentForm.reset()
      alert(`✅ PDF report saved as ${fileName}`)
      // ✅ Optionally reset status and live readings
      // document.getElementById(
      //   'proofLoadDisplay'
      // ).innerText = `Proof Load: 0.000 t`
      //   document.getElementById('loadValue').innerText = ''
      //   document.getElementById('lastTimestamp').innerText = ''
      //  document.getElementById('peakDisplay').innerText = 'Peak Load: 0.000 t'
      updateStatus('Status: Ready', 'success')
      startButton.disabled = false
      stopButton.disabled = true
      downloadButton.disabled = false
    })

    stream.on('error', (err) => {
      console.error('❌ PDF generation error:', err)
      alert('❌ Failed to generate PDF report. Check console for details.')
      downloadButton.disabled = false
    })
  } catch (err) {
    console.error('❌ Unexpected error during PDF generation:', err)
    alert('❌ Unexpected error during PDF generation.')
    document.getElementById('downloadButton').disabled = false
  }
}

module.exports = { downloadReport }
