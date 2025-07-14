const Chart = require('chart.js/auto')
const annotationPlugin = require('chartjs-plugin-annotation')
Chart.register(annotationPlugin)
const state = require('./state')

/**
 * Renders or updates the load chart using Chart.js with live data.
 * @param {Array<{time: string, loadTons: number}>} chartData - Array of time/load points
 * @param {number} peakValue - Current peak value for annotation
 */

function renderChart(chartData, peakValue) {
  const canvas = document.getElementById('loadChart')
  if (!canvas) {
    console.warn('⚠️ loadChart element not found.')
    return
  }
  const ctx = canvas.getContext('2d')
  // const labels = chartData.map((point) => point.time)
  // const dataTons = chartData.map((point) => point.loadTons)
  const labels =
    chartData.length > 0 ? chartData.map((point) => point.time) : ['']
  const dataTons =
    chartData.length > 0 ? chartData.map((point) => point.loadTons) : [0]

  const datasets = [
    {
      label: 'Load (tons)',
      data: dataTons,
      borderColor: 'rgba(54, 162, 235, 1)',
      borderWidth: 2,
      fill: true,
      pointRadius: 0.5,
      tension: 0.5,
    },
  ]
  const annotationOptions = {
    annotations: {
      peakLine: {
        type: 'line',
        yMin: peakValue,
        yMax: peakValue,
        borderColor: 'red',
        borderWidth: 1,
        label: {
          content:
            peakValue > 0 ? `Peak: ${peakValue.toFixed(2)} t` : 'Peak: --',
          enabled: true,
          position: 'start',
          backgroundColor: 'rgba(255,0,0,0.2)',
          color: 'red',
          font: {
            size: 14,
            style: 'normal',
            weight: 'bold',
          },
        },
      },
    },
  }
  let chartInstance = state.get('chartInstance') // CHANGED

  if (chartInstance) {
    // Update existing chart
    chartInstance.data.labels = labels
    chartInstance.data.datasets = datasets
    chartInstance.options.plugins.annotation = annotationOptions
    chartInstance.update()
  } else {
    // Create new chart
    chartInstance = new Chart(ctx, {
      type: 'line',
      data: {
        labels,
        datasets,
      },
      options: {
        responsive: true,
        scales: {
          x: { title: { display: true, text: 'Time' } },
          y: { title: { display: true, text: 'Load (tons)' } },
        },
        plugins: { legend: { display: true }, annotation: annotationOptions },
      },
    })
    state.set('chartInstance', chartInstance) // CHANGED
  }
}

/**
 * Destroys the current chart instance for cleanup or reset.
 */
function clearChart() {
  const chartInstance = state.get('chartInstance') // CHANGED
  if (chartInstance) {
    chartInstance.destroy()
    state.set('chartInstance', null) // CHANGED
    console.log('ℹ️ Chart instance cleared.')
  }
  // ✅ Explicitly reset canvas size
  const canvas = document.getElementById('loadChart')
  if (canvas) {
    canvas.width = 800 // or your desired width
    canvas.height = 300 // consistent with your initial height
  }
  renderChart([], 0)
}

module.exports = {
  renderChart,
  clearChart,
}
