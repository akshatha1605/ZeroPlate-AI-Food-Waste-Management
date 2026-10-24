/**
 * ZeroPlate - Member 2: Demand Forecasting
 * charts.js: Dynamic Data Visualizations with Modern Themes
 */

const ChartManager = {
  instances: {},

  // Harmonious theme palette
  theme: {
    primary: '#10b981',       // Emerald
    primaryLight: 'rgba(16, 185, 129, 0.2)',
    accent: '#06b6d4',        // Cyan
    accentLight: 'rgba(6, 182, 212, 0.2)',
    danger: '#f43f5e',        // Rose/Red for waste & overcooking
    dangerLight: 'rgba(244, 63, 94, 0.2)',
    warning: '#f59e0b',       // Amber
    warningLight: 'rgba(245, 158, 11, 0.2)',
    purple: '#8b5cf6',        // Violet
    textMuted: '#94a3b8',
    gridLines: 'rgba(148, 163, 184, 0.1)',
    fontFamily: "'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, sans-serif"
  },

  destroyChart(id) {
    if (this.instances[id]) {
      this.instances[id].destroy();
      delete this.instances[id];
    }
  },

  /**
   * 1. Forecast Trend Chart: Historical vs Predicted with Confidence Interval
   */
  renderForecastTrendChart(canvasId, dishHistory, tomorrowResult, dishName = 'Dish') {
    this.destroyChart(canvasId);
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;

    // Last 12 days history
    const slice = dishHistory.slice(-12);
    const labels = slice.map(r => {
      const parts = r.date.split('-');
      return `${parts[1]}/${parts[2]}`;
    });
    labels.push('Tomorrow (Est)');

    const consumedData = slice.map(r => r.consumedQtyKg);
    consumedData.push(null); // Last point is forecast, not historical actual

    const cookedData = slice.map(r => r.cookedQtyKg);
    cookedData.push(null);

    // Forecast series: starts at the last historical actual and points to tomorrow's forecast
    const forecastData = new Array(slice.length).fill(null);
    if (slice.length > 0) {
      forecastData[slice.length - 1] = slice[slice.length - 1].consumedQtyKg;
    }
    forecastData.push(tomorrowResult.predictedBaseConsumption);

    // Upper and lower confidence bounds
    const upperBound = new Array(slice.length).fill(null);
    upperBound.push(tomorrowResult.upperBoundKg || tomorrowResult.predictedBaseConsumption * 1.08);

    const lowerBound = new Array(slice.length).fill(null);
    lowerBound.push(tomorrowResult.lowerBoundKg || tomorrowResult.predictedBaseConsumption * 0.92);

    const ctx = canvas.getContext('2d');
    this.instances[canvasId] = new Chart(ctx, {
      type: 'line',
      data: {
        labels,
        datasets: [
          {
            label: 'Actual Consumed (kg)',
            data: consumedData,
            borderColor: this.theme.primary,
            backgroundColor: this.theme.primaryLight,
            borderWidth: 2.5,
            tension: 0.3,
            fill: false,
            pointRadius: 4,
            pointHoverRadius: 6
          },
          {
            label: 'Kitchen Cooked (kg - Actual)',
            data: cookedData,
            borderColor: this.theme.danger,
            borderWidth: 1.8,
            borderDash: [5, 4],
            tension: 0.2,
            fill: false,
            pointRadius: 3
          },
          {
            label: 'ZeroPlate AI Forecast (kg)',
            data: forecastData,
            borderColor: this.theme.accent,
            backgroundColor: this.theme.accentLight,
            borderWidth: 2.5,
            borderDash: [3, 3],
            pointRadius: 6,
            pointBackgroundColor: this.theme.accent,
            fill: false
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            position: 'top',
            labels: {
              color: '#cbd5e1',
              font: { family: this.theme.fontFamily, size: 12 },
              usePointStyle: true,
              boxWidth: 8
            }
          },
          tooltip: {
            backgroundColor: '#0f172a',
            titleColor: '#f8fafc',
            bodyColor: '#e2e8f0',
            borderColor: 'rgba(255,255,255,0.1)',
            borderWidth: 1,
            padding: 10,
            callbacks: {
              afterBody: function(context) {
                if (context[0].label === 'Tomorrow (Est)') {
                  return `95% CI Range: ${tomorrowResult.lowerBoundKg} - ${tomorrowResult.upperBoundKg} kg\nConfidence: ${tomorrowResult.confidenceScore}%`;
                }
                return '';
              }
            }
          }
        },
        scales: {
          x: {
            grid: { color: this.theme.gridLines },
            ticks: { color: this.theme.textMuted, font: { family: this.theme.fontFamily } }
          },
          y: {
            title: { display: true, text: 'Quantity (kg)', color: this.theme.textMuted },
            grid: { color: this.theme.gridLines },
            ticks: { color: this.theme.textMuted, font: { family: this.theme.fontFamily } }
          }
        }
      }
    });
  },

  /**
   * 2. Comparison Chart: Actual Cooked vs ZeroPlate Recommended vs Actual Consumed
   */
  renderComparisonChart(canvasId, comparisonItems) {
    this.destroyChart(canvasId);
    const canvas = document.getElementById(canvasId);
    if (!canvas || !comparisonItems || comparisonItems.length === 0) return;

    const labels = comparisonItems.map(d => d.dishName.length > 15 ? d.dishName.slice(0, 14) + '...' : d.dishName);
    const actualCooked = comparisonItems.map(d => d.cookedQtyKg);
    const recommended = comparisonItems.map(d => d.recommendedQtyKg);
    const actualConsumed = comparisonItems.map(d => d.consumedQtyKg);

    const ctx = canvas.getContext('2d');
    this.instances[canvasId] = new Chart(ctx, {
      type: 'bar',
      data: {
        labels,
        datasets: [
          {
            label: 'Actual Cooked (Unoptimized)',
            data: actualCooked,
            backgroundColor: 'rgba(244, 63, 94, 0.75)',
            borderColor: '#f43f5e',
            borderWidth: 1,
            borderRadius: 5
          },
          {
            label: 'ZeroPlate Recommendation',
            data: recommended,
            backgroundColor: 'rgba(16, 185, 129, 0.85)',
            borderColor: '#10b981',
            borderWidth: 1,
            borderRadius: 5
          },
          {
            label: 'Actual Consumed (Demand)',
            data: actualConsumed,
            backgroundColor: 'rgba(6, 182, 212, 0.8)',
            borderColor: '#06b6d4',
            borderWidth: 1,
            borderRadius: 5
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            position: 'top',
            labels: {
              color: '#cbd5e1',
              font: { family: this.theme.fontFamily, size: 12 },
              usePointStyle: true,
              boxWidth: 8
            }
          },
          tooltip: {
            backgroundColor: '#0f172a',
            titleColor: '#f8fafc',
            bodyColor: '#e2e8f0',
            borderColor: 'rgba(255,255,255,0.1)',
            borderWidth: 1,
            padding: 12,
            callbacks: {
              footer: function(tooltipItems) {
                const index = tooltipItems[0].dataIndex;
                const c = actualCooked[index];
                const r = recommended[index];
                const saved = Math.max(0, c - r).toFixed(1);
                return `Waste Averted by ZeroPlate: ${saved} kg`;
              }
            }
          }
        },
        scales: {
          x: {
            grid: { display: false },
            ticks: { color: this.theme.textMuted, font: { family: this.theme.fontFamily, size: 11 } }
          },
          y: {
            title: { display: true, text: 'Quantity (kg)', color: this.theme.textMuted },
            grid: { color: this.theme.gridLines },
            ticks: { color: this.theme.textMuted, font: { family: this.theme.fontFamily } }
          }
        }
      }
    });
  },

  /**
   * 3. Cumulative Waste Reduction Chart (Baseline vs AI Optimized)
   */
  renderCumulativeWasteChart(canvasId, records) {
    this.destroyChart(canvasId);
    const canvas = document.getElementById(canvasId);
    if (!canvas || !records || records.length === 0) return;

    // Group records by distinct date
    const dateMap = {};
    records.forEach(r => {
      if (!dateMap[r.date]) {
        dateMap[r.date] = { baselineWaste: 0, aiWaste: 0 };
      }
      dateMap[r.date].baselineWaste += r.wasteQtyKg;
      dateMap[r.date].aiWaste += (r.simulatedWasteWithZeroPlate || Math.max(0, (r.consumedQtyKg * 1.055) - r.consumedQtyKg));
    });

    const dates = Object.keys(dateMap).sort();
    let cumBaseline = 0;
    let cumAI = 0;

    const labels = [];
    const baselineSeries = [];
    const aiSeries = [];

    dates.forEach((d, idx) => {
      cumBaseline += dateMap[d].baselineWaste;
      cumAI += dateMap[d].aiWaste;

      // Sample every 2 days to prevent overcrowding
      if (idx % 2 === 0 || idx === dates.length - 1) {
        const parts = d.split('-');
        labels.push(`${parts[1]}/${parts[2]}`);
        baselineSeries.push(parseFloat(cumBaseline.toFixed(1)));
        aiSeries.push(parseFloat(cumAI.toFixed(1)));
      }
    });

    const ctx = canvas.getContext('2d');
    this.instances[canvasId] = new Chart(ctx, {
      type: 'line',
      data: {
        labels,
        datasets: [
          {
            label: 'Cumulative Baseline Waste (No ZeroPlate)',
            data: baselineSeries,
            borderColor: this.theme.danger,
            backgroundColor: this.theme.dangerLight,
            fill: true,
            borderWidth: 2,
            tension: 0.3,
            pointRadius: 2
          },
          {
            label: 'Optimized Waste (With ZeroPlate AI)',
            data: aiSeries,
            borderColor: this.theme.primary,
            backgroundColor: this.theme.primaryLight,
            fill: true,
            borderWidth: 2,
            tension: 0.3,
            pointRadius: 2
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            position: 'top',
            labels: {
              color: '#cbd5e1',
              font: { family: this.theme.fontFamily, size: 12 },
              usePointStyle: true,
              boxWidth: 8
            }
          },
          tooltip: {
            backgroundColor: '#0f172a',
            titleColor: '#f8fafc',
            bodyColor: '#e2e8f0',
            padding: 10,
            callbacks: {
              footer: function(tooltipItems) {
                const index = tooltipItems[0].dataIndex;
                const diff = (baselineSeries[index] - aiSeries[index]).toFixed(1);
                return `Net Food Saved: ${diff} kg`;
              }
            }
          }
        },
        scales: {
          x: {
            grid: { color: this.theme.gridLines },
            ticks: { color: this.theme.textMuted, font: { family: this.theme.fontFamily } }
          },
          y: {
            title: { display: true, text: 'Cumulative Waste (kg)', color: this.theme.textMuted },
            grid: { color: this.theme.gridLines },
            ticks: { color: this.theme.textMuted, font: { family: this.theme.fontFamily } }
          }
        }
      }
    });
  },

  /**
   * 4. Dish Category Waste Breakdown Doughnut Chart
   */
  renderDishWasteDoughnut(canvasId, records) {
    this.destroyChart(canvasId);
    const canvas = document.getElementById(canvasId);
    if (!canvas || !records || records.length === 0) return;

    const categoryMap = {};
    records.forEach(r => {
      const cat = r.category || 'General';
      categoryMap[cat] = (categoryMap[cat] || 0) + r.wasteQtyKg;
    });

    const labels = Object.keys(categoryMap);
    const data = labels.map(k => parseFloat(categoryMap[k].toFixed(1)));
    const colors = [
      '#10b981', '#06b6d4', '#f59e0b', '#ec4899', '#8b5cf6', '#3b82f6', '#14b8a6', '#f43f5e'
    ];

    const ctx = canvas.getContext('2d');
    this.instances[canvasId] = new Chart(ctx, {
      type: 'doughnut',
      data: {
        labels,
        datasets: [
          {
            data,
            backgroundColor: colors.slice(0, labels.length),
            borderColor: '#0f172a',
            borderWidth: 2,
            hoverOffset: 6
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            position: 'right',
            labels: {
              color: '#cbd5e1',
              font: { family: this.theme.fontFamily, size: 11 },
              usePointStyle: true,
              boxWidth: 8
            }
          },
          tooltip: {
            backgroundColor: '#0f172a',
            callbacks: {
              label: function(context) {
                const label = context.label || '';
                const val = context.parsed || 0;
                const total = context.dataset.data.reduce((a, b) => a + b, 0);
                const pct = total > 0 ? ((val / total) * 100).toFixed(1) : 0;
                return `${label}: ${val} kg (${pct}%)`;
              }
            }
          }
        },
        cutout: '68%'
      }
    });
  }
};

window.ChartManager = ChartManager;
