/**
 * ZeroPlate - Member 2: Demand Forecasting
 * app.js: Main Controller, UI Event Bindings, Simulation & Integration Layer
 */

document.addEventListener('DOMContentLoaded', () => {
  // Application State
  const state = {
    activeTab: 'tab-forecast',
    targetDate: getTomorrowDateStr(),
    mealSession: 'Lunch',
    projectedHeadcount: 280,
    weather: 'Sunny',
    eventType: 'Regular',
    algorithm: 'hybrid',
    safetyBufferPct: 6.5,
    selectedTrendDishId: 'D01',
    auditSessionFilter: 'All',
    dataFilter: {
      search: '',
      session: 'All',
      wasteRate: 'All'
    },
    simBuffer: 6.5,
    simCompliance: 90
  };

  // Cache DOM Elements
  const dom = {
    // Nav
    tabs: document.querySelectorAll('.tab-btn'),
    panes: document.querySelectorAll('.tab-pane'),
    
    // Top KPIs
    kpiWasteReduction: document.getElementById('kpi-waste-reduction-pct'),
    kpiWasteSavedSub: document.getElementById('kpi-waste-saved-kg-sub'),
    kpiAccuracy: document.getElementById('kpi-accuracy-pct'),
    kpiCostSaved: document.getElementById('kpi-cost-saved'),
    kpiCo2Saved: document.getElementById('kpi-co2-saved'),

    // Tab 1: Forecast Controls
    forecastDate: document.getElementById('forecast-date'),
    forecastSession: document.getElementById('forecast-session'),
    forecastHeadcount: document.getElementById('forecast-headcount'),
    forecastWeather: document.getElementById('forecast-weather'),
    forecastEvent: document.getElementById('forecast-event'),
    forecastAlgorithm: document.getElementById('forecast-algorithm'),
    sliderSafetyBuffer: document.getElementById('slider-safety-buffer'),
    valSafetyBuffer: document.getElementById('val-safety-buffer'),
    btnRunForecast: document.getElementById('btn-run-forecast'),
    btnPrintPrep: document.getElementById('btn-print-prep'),

    // Tab 1: Outputs
    summaryTotalPrep: document.getElementById('summary-total-prep'),
    summaryTotalPortions: document.getElementById('summary-total-portions'),
    summaryTotalPredicted: document.getElementById('summary-total-predicted'),
    summaryTotalCost: document.getElementById('summary-total-cost'),
    prepCardsContainer: document.getElementById('prep-cards-container'),
    selectChartDish: document.getElementById('select-chart-dish'),

    // Tab 2: Audit
    auditSessionFilter: document.getElementById('audit-session-filter'),
    auditAccuracyVal: document.getElementById('audit-accuracy-val'),
    auditOvercookingAverted: document.getElementById('audit-overcooking-averted'),
    auditStockoutsVal: document.getElementById('audit-stockouts-val'),
    auditActualWaste: document.getElementById('audit-actual-waste'),
    auditTableBody: document.getElementById('audit-table-body'),

    // Tab 3: Simulator
    simSliderBuffer: document.getElementById('sim-slider-buffer'),
    simValBuffer: document.getElementById('sim-val-buffer'),
    simSliderCompliance: document.getElementById('sim-slider-compliance'),
    simValCompliance: document.getElementById('sim-val-compliance'),
    simResultWasteSaved: document.getElementById('sim-result-waste-saved'),
    simResultPctBadge: document.getElementById('sim-result-pct-badge'),
    simResultCostSaved: document.getElementById('sim-result-cost-saved'),
    simResultCo2Saved: document.getElementById('sim-result-co2-saved'),
    simResultMealsRescued: document.getElementById('sim-result-meals-rescued'),
    simResultStockoutRisk: document.getElementById('sim-result-stockout-risk'),

    // Tab 4: Data Store
    dataSearchInput: document.getElementById('data-search-input'),
    dataSessionFilter: document.getElementById('data-session-filter'),
    dataWasteFilter: document.getElementById('data-waste-filter'),
    dataRecordsCount: document.getElementById('data-records-count'),
    masterDataTableBody: document.getElementById('master-data-table-body'),
    btnExportCsv: document.getElementById('btn-export-csv'),
    btnExportJson: document.getElementById('btn-export-json'),
    btnResetData: document.getElementById('btn-reset-data'),

    // Modals
    modalRecord: document.getElementById('modal-record'),
    btnQuickAddRecord: document.getElementById('btn-quick-add-record'),
    btnCloseModalRecord: document.getElementById('btn-close-modal-record'),
    btnCancelRecord: document.getElementById('btn-cancel-record'),
    formKitchenRecord: document.getElementById('form-kitchen-record'),
    recordId: document.getElementById('record-id'),
    recordDate: document.getElementById('record-date'),
    recordSession: document.getElementById('record-session'),
    recordDishSelect: document.getElementById('record-dish-select'),
    recordHeadcount: document.getElementById('record-headcount'),
    recordCooked: document.getElementById('record-cooked'),
    recordConsumed: document.getElementById('record-consumed'),
    recordWeather: document.getElementById('record-weather'),
    recordEvent: document.getElementById('record-event'),
    previewWasteKg: document.getElementById('preview-waste-kg'),
    previewWastePct: document.getElementById('preview-waste-pct'),
    previewAiSaved: document.getElementById('preview-ai-saved'),

    modalMath: document.getElementById('modal-math'),
    btnOpenMath: document.getElementById('btn-open-math'),
    btnCloseModalMath: document.getElementById('btn-close-modal-math'),
    btnCloseMathDone: document.getElementById('btn-close-math-done'),

    toastContainer: document.getElementById('toast-container')
  };

  // Helper date utility
  function getTomorrowDateStr() {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return d.toISOString().split('T')[0];
  }

  function getTodayDateStr() {
    return new Date().toISOString().split('T')[0];
  }

  // Toast System
  function showToast(message, type = 'success') {
    const toast = document.createElement('div');
    toast.className = 'toast';
    const icon = type === 'success' 
      ? '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#10b981" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>'
      : '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/></svg>';
    toast.innerHTML = `${icon}<span>${message}</span>`;
    dom.toastContainer.appendChild(toast);
    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateX(20px)';
      toast.style.transition = 'all 0.3s ease';
      setTimeout(() => toast.remove(), 300);
    }, 3500);
  }

  // --- INITIALIZATION ---
  function init() {
    dom.forecastDate.value = state.targetDate;
    dom.recordDate.value = getTodayDateStr();

    // Populate Dish Select in Modal and Catalog options
    populateDishCatalogSelects();

    // Setup Event Listeners
    setupNavListeners();
    setupForecastListeners();
    setupAuditListeners();
    setupSimulatorListeners();
    setupDataStoreListeners();
    setupModalListeners();

    // Initial Computations & Renders
    updateGlobalKpiBar();
    runDemandForecast();
    renderAuditView();
    renderSimulatorView();
    renderMasterDataTable();
  }

  function populateDishCatalogSelects() {
    const catalog = window.kitchenDB.getCatalog();
    dom.recordDishSelect.innerHTML = '';
    catalog.forEach(d => {
      const opt = document.createElement('option');
      opt.value = d.id;
      opt.textContent = `${d.name} (${d.category})`;
      dom.recordDishSelect.appendChild(opt);
    });
  }

  // --- NAVIGATION CONTROLLER ---
  function setupNavListeners() {
    dom.tabs.forEach(tab => {
      tab.addEventListener('click', () => {
        const targetId = tab.getAttribute('data-tab');
        state.activeTab = targetId;

        dom.tabs.forEach(t => {
          t.classList.remove('active');
          t.setAttribute('aria-selected', 'false');
        });
        dom.panes.forEach(p => p.classList.remove('active'));

        tab.classList.add('active');
        tab.setAttribute('aria-selected', 'true');
        document.getElementById(targetId).classList.add('active');

        // Resize / trigger charts for smooth display
        if (targetId === 'tab-forecast') {
          updateTrendChart();
        } else if (targetId === 'tab-comparison') {
          renderAuditView();
        } else if (targetId === 'tab-reduction') {
          renderSimulatorView();
        } else if (targetId === 'tab-data') {
          renderMasterDataTable();
        }
      });
    });
  }

  // --- TOP GLOBAL KPI UPDATE ---
  function updateGlobalKpiBar() {
    const records = window.kitchenDB.getRecords();
    const sim = window.ForecastingEngine.simulateWasteReduction(records, 6.5, 90);
    const accuracy = window.ForecastingEngine.evaluateHistoricalAccuracy(records);

    dom.kpiWasteReduction.textContent = `${sim.reductionPercentage}%`;
    dom.kpiWasteSavedSub.textContent = `~${sim.netWasteSavedKg.toLocaleString()} kg food averted from landfill`;
    dom.kpiAccuracy.textContent = `${accuracy.accuracyPct}%`;
    dom.kpiCostSaved.textContent = `₹${Math.round(sim.netCostSavings).toLocaleString()}`;
    dom.kpiCo2Saved.textContent = sim.co2ePreventedKg.toLocaleString();
  }

  // --- DELIVERABLE 2 & 3: DEMAND FORECAST & PREPARATION RECOMMENDATIONS ---
  function setupForecastListeners() {
    dom.sliderSafetyBuffer.addEventListener('input', (e) => {
      state.safetyBufferPct = parseFloat(e.target.value);
      dom.valSafetyBuffer.textContent = `${state.safetyBufferPct.toFixed(1)}%`;
      runDemandForecast();
    });

    dom.btnRunForecast.addEventListener('click', () => {
      state.targetDate = dom.forecastDate.value || getTomorrowDateStr();
      state.mealSession = dom.forecastSession.value;
      state.projectedHeadcount = parseInt(dom.forecastHeadcount.value, 10) || 280;
      state.weather = dom.forecastWeather.value;
      state.eventType = dom.forecastEvent.value;
      state.algorithm = dom.forecastAlgorithm.value;

      runDemandForecast();
      showToast(`Generated next-day forecast for ${state.mealSession} session!`);
    });

    dom.selectChartDish.addEventListener('change', (e) => {
      state.selectedTrendDishId = e.target.value;
      updateTrendChart();
    });

    dom.btnPrintPrep.addEventListener('click', () => {
      window.print();
    });
  }

  let currentSessionPlan = null;

  function runDemandForecast() {
    currentSessionPlan = window.ForecastingEngine.generateSessionPlan({
      targetDate: dom.forecastDate.value || state.targetDate,
      mealSession: dom.forecastSession.value || state.mealSession,
      projectedHeadcount: parseInt(dom.forecastHeadcount.value, 10) || state.projectedHeadcount,
      forecastWeather: dom.forecastWeather.value || state.weather,
      eventType: dom.forecastEvent.value || state.eventType,
      safetyBufferPct: state.safetyBufferPct,
      algorithm: dom.forecastAlgorithm.value || state.algorithm
    });

    // Update Summary Header
    dom.summaryTotalPrep.textContent = `${currentSessionPlan.totalRecommendedKg} kg`;
    dom.summaryTotalPortions.textContent = `~${Math.round(currentSessionPlan.totalRecommendedKg / 0.35)} portions`;
    dom.summaryTotalPredicted.textContent = `${currentSessionPlan.totalPredictedKg} kg`;
    dom.summaryTotalCost.textContent = `₹${Math.round(currentSessionPlan.totalEstimatedCost).toLocaleString()}`;

    // Render Dish Recommendation Cards
    renderPrepCards(currentSessionPlan.recommendations);

    // Populate Dish selector for trend chart if needed
    populateTrendDishSelect(currentSessionPlan.recommendations);

    // Update Chart
    updateTrendChart();
  }

  function renderPrepCards(recommendations) {
    dom.prepCardsContainer.innerHTML = '';

    recommendations.forEach(rec => {
      const card = document.createElement('div');
      card.className = 'prep-card';

      const portions = Math.round(rec.recommendedQtyKg / 0.28);
      const batch1 = rec.batchSchedule ? rec.batchSchedule.batch1QtyKg : rec.recommendedQtyKg;
      const batch2 = rec.batchSchedule ? rec.batchSchedule.batch2QtyKg : 0;

      card.innerHTML = `
        <div>
          <div class="prep-card-header">
            <div>
              <span class="dish-badge-cat">${rec.category}</span>
              <h4 class="prep-dish-title">${rec.dishName}</h4>
            </div>
            <div class="prep-rec-pill">
              <div class="prep-rec-val">${rec.recommendedQtyKg} <span style="font-size:0.85rem;">kg</span></div>
              <div class="prep-rec-sub">Recommended Prep</div>
            </div>
          </div>

          <div class="prep-stats-grid" style="margin-top: 0.9rem;">
            <div class="prep-stat-item">
              <span class="prep-stat-label">Predicted Demand:</span>
              <span class="prep-stat-val">${rec.predictedConsumptionKg} kg</span>
            </div>
            <div class="prep-stat-item">
              <span class="prep-stat-label">Safety Buffer:</span>
              <span class="prep-stat-val" style="color: var(--primary);">+${rec.safetyBufferPct}%</span>
            </div>
            <div class="prep-stat-item">
              <span class="prep-stat-label">Portions Count:</span>
              <span class="prep-stat-val">~${portions} servings</span>
            </div>
            <div class="prep-stat-item">
              <span class="prep-stat-label">Est. Raw Cost:</span>
              <span class="prep-stat-val">₹${Math.round(rec.estimatedCost)}</span>
            </div>
          </div>
        </div>

        <!-- Staged Batch Preparation Box -->
        <div class="batch-schedule-box">
          <div class="batch-schedule-title">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
            Staged Batch Cooking Plan
          </div>
          <div class="batch-step">
            <span><strong>Batch 1 (Service Start):</strong></span>
            <span style="color: var(--primary); font-weight:700;">${batch1} kg (65%)</span>
          </div>
          <div class="batch-step">
            <span><strong>Batch 2 (Mid-Service Trigger):</strong></span>
            <span style="color: #38bdf8; font-weight:700;">${batch2} kg (35%)</span>
          </div>
        </div>

        <div style="display: flex; justify-content: space-between; align-items: center; border-top: 1px solid var(--border-subtle); padding-top: 0.75rem;">
          <span style="font-size: 0.75rem; color: var(--text-muted);">Confidence Score: <strong style="color: var(--primary);">${rec.confidenceScore}%</strong></span>
          <button class="btn btn-secondary btn-sm btn-inspect-dish" data-dish-id="${rec.dishId}">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
            Factors Breakdown
          </button>
        </div>
      `;

      dom.prepCardsContainer.appendChild(card);
    });

    // Bind Factor Breakdown buttons
    dom.prepCardsContainer.querySelectorAll('.btn-inspect-dish').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const dishId = e.currentTarget.getAttribute('data-dish-id');
        openDishFactorsModal(dishId);
      });
    });
  }

  function populateTrendDishSelect(recommendations) {
    const prevSelected = dom.selectChartDish.value;
    dom.selectChartDish.innerHTML = '';
    recommendations.forEach(r => {
      const opt = document.createElement('option');
      opt.value = r.dishId;
      opt.textContent = `${r.dishName} (${r.category})`;
      dom.selectChartDish.appendChild(opt);
    });

    if (prevSelected && recommendations.some(r => r.dishId === prevSelected)) {
      dom.selectChartDish.value = prevSelected;
      state.selectedTrendDishId = prevSelected;
    } else if (recommendations.length > 0) {
      dom.selectChartDish.value = recommendations[0].dishId;
      state.selectedTrendDishId = recommendations[0].dishId;
    }
  }

  function updateTrendChart() {
    const dishId = state.selectedTrendDishId || 'D01';
    const records = window.kitchenDB.getRecords();
    const dishHistory = window.ForecastingEngine.getDishHistory(records, dishId, dom.forecastSession.value || state.mealSession);
    const catalog = window.kitchenDB.getCatalog();
    const dishMeta = catalog.find(d => d.id === dishId) || { name: 'Dish' };

    const tomorrowResult = window.ForecastingEngine.forecastHybrid({
      records,
      dishId,
      targetDate: dom.forecastDate.value || state.targetDate,
      mealSession: dom.forecastSession.value || state.mealSession,
      projectedHeadcount: parseInt(dom.forecastHeadcount.value, 10) || state.projectedHeadcount,
      forecastWeather: dom.forecastWeather.value || state.weather,
      eventType: dom.forecastEvent.value || state.eventType
    });

    window.ChartManager.renderForecastTrendChart(
      'canvas-forecast-trend',
      dishHistory,
      tomorrowResult,
      dishMeta.name
    );
  }

  function openDishFactorsModal(dishId) {
    const catalog = window.kitchenDB.getCatalog();
    const dish = catalog.find(d => d.id === dishId);
    if (!dish) return;

    const records = window.kitchenDB.getRecords();
    const hybrid = window.ForecastingEngine.forecastHybrid({
      records,
      dishId,
      targetDate: dom.forecastDate.value || state.targetDate,
      mealSession: dom.forecastSession.value || state.mealSession,
      projectedHeadcount: parseInt(dom.forecastHeadcount.value, 10) || state.projectedHeadcount,
      forecastWeather: dom.forecastWeather.value || state.weather,
      eventType: dom.forecastEvent.value || state.eventType
    });

    const b = hybrid.factorBreakdown;
    alert(
      `ZeroPlate AI Breakdown for: ${dish.name}\n` +
      `-------------------------------------------\n` +
      `• Base Trimmed Mean: ${b.baseline} kg\n` +
      `• Day-of-Week Seasonality Index: ×${b.dayFactor}\n` +
      `• Headcount Scaling Factor: ×${b.headcountFactor}\n` +
      `• Weather Multiplier (${dom.forecastWeather.value}): ×${b.weatherFactor}\n` +
      `• Event Factor (${dom.forecastEvent.value}): ×${b.eventFactor}\n` +
      `-------------------------------------------\n` +
      `= Final Predicted Consumption: ${hybrid.predictedBaseConsumption} kg\n` +
      `• 95% Confidence Interval: [${hybrid.lowerBoundKg} kg - ${hybrid.upperBoundKg} kg]\n` +
      `• Model Confidence Score: ${hybrid.confidenceScore}%`
    );
  }

  // --- DELIVERABLE 4: AUDIT VIEW & COMPARISON CHART ---
  function setupAuditListeners() {
    dom.auditSessionFilter.addEventListener('change', (e) => {
      state.auditSessionFilter = e.target.value;
      renderAuditView();
    });
  }

  function renderAuditView() {
    let records = window.kitchenDB.getRecords();
    if (state.auditSessionFilter !== 'All') {
      records = records.filter(r => r.mealSession === state.auditSessionFilter);
    }

    const accuracy = window.ForecastingEngine.evaluateHistoricalAccuracy(records);

    dom.auditAccuracyVal.textContent = `${accuracy.accuracyPct}%`;
    dom.auditOvercookingAverted.textContent = `${accuracy.wasteAvertedKg.toLocaleString()} kg`;
    dom.auditStockoutsVal.textContent = `${accuracy.stockoutIncidents} (${accuracy.stockoutRatePct}%)`;
    dom.auditActualWaste.textContent = `${accuracy.totalActualWasteKg.toLocaleString()} kg`;

    // Group comparison data by unique dishes for the comparison chart
    const dishSummaryMap = {};
    // Take recent 25 records to keep chart readable
    const sample = records.slice(0, 36);
    sample.forEach(r => {
      if (!dishSummaryMap[r.dishName]) {
        dishSummaryMap[r.dishName] = {
          dishName: r.dishName,
          cookedQtyKg: 0,
          recommendedQtyKg: 0,
          consumedQtyKg: 0,
          count: 0
        };
      }
      dishSummaryMap[r.dishName].cookedQtyKg += r.cookedQtyKg;
      dishSummaryMap[r.dishName].recommendedQtyKg += r.recommendedQtyKg;
      dishSummaryMap[r.dishName].consumedQtyKg += r.consumedQtyKg;
      dishSummaryMap[r.dishName].count++;
    });

    const comparisonItems = Object.values(dishSummaryMap).map(d => ({
      dishName: d.dishName,
      cookedQtyKg: parseFloat((d.cookedQtyKg / d.count).toFixed(1)),
      recommendedQtyKg: parseFloat((d.recommendedQtyKg / d.count).toFixed(1)),
      consumedQtyKg: parseFloat((d.consumedQtyKg / d.count).toFixed(1))
    }));

    window.ChartManager.renderComparisonChart('canvas-comparison-chart', comparisonItems);

    // Render Table (most recent 20 records)
    dom.auditTableBody.innerHTML = '';
    const tableSlice = records.slice(0, 20);

    tableSlice.forEach(r => {
      const tr = document.createElement('tr');
      const variance = (r.cookedQtyKg - r.recommendedQtyKg).toFixed(1);
      const isPositive = parseFloat(variance) >= 0;
      const aiSaved = Math.max(0, r.wasteQtyKg - (r.simulatedWasteWithZeroPlate || 0)).toFixed(1);

      tr.innerHTML = `
        <td><strong>${r.date}</strong> <span class="badge-cell badge-session">${r.mealSession}</span></td>
        <td>${r.dishName}</td>
        <td><strong style="color: var(--danger);">${r.cookedQtyKg} kg</strong></td>
        <td><strong style="color: var(--primary);">${r.recommendedQtyKg} kg</strong></td>
        <td><strong style="color: var(--accent);">${r.consumedQtyKg} kg</strong></td>
        <td>
          <span class="${isPositive ? 'variance-positive' : 'variance-negative'}">
            ${isPositive ? '+' : ''}${variance} kg
          </span>
        </td>
        <td>${r.wasteQtyKg} kg (${r.wastePercentage}%)</td>
        <td><span class="badge-cell badge-waste-low">+${aiSaved} kg Saved</span></td>
      `;
      dom.auditTableBody.appendChild(tr);
    });
  }

  // --- DELIVERABLE 5: WASTE REDUCTION SIMULATOR ---
  function setupSimulatorListeners() {
    dom.simSliderBuffer.addEventListener('input', (e) => {
      state.simBuffer = parseFloat(e.target.value);
      dom.simValBuffer.textContent = `${state.simBuffer.toFixed(1)}%`;
      renderSimulatorView();
    });

    dom.simSliderCompliance.addEventListener('input', (e) => {
      state.simCompliance = parseInt(e.target.value, 10);
      dom.simValCompliance.textContent = `${state.simCompliance}%`;
      renderSimulatorView();
    });
  }

  function renderSimulatorView() {
    const records = window.kitchenDB.getRecords();
    const result = window.ForecastingEngine.simulateWasteReduction(
      records,
      state.simBuffer,
      state.simCompliance
    );

    dom.simResultWasteSaved.textContent = `${result.netWasteSavedKg.toLocaleString()} kg`;
    dom.simResultPctBadge.textContent = `${result.reductionPercentage}% Waste Reduction`;
    dom.simResultCostSaved.textContent = `₹${Math.round(result.netCostSavings).toLocaleString()}`;
    dom.simResultCo2Saved.textContent = `${result.co2ePreventedKg.toLocaleString()} kg`;
    dom.simResultMealsRescued.textContent = `~${result.mealsRescued.toLocaleString()} meals rescued`;
    dom.simResultStockoutRisk.textContent = `${result.estimatedStockoutRisk}%`;

    // Render Cumulative Charts
    window.ChartManager.renderCumulativeWasteChart('canvas-cumulative-waste', records);
    window.ChartManager.renderDishWasteDoughnut('canvas-dish-breakdown', records);
  }

  // --- DELIVERABLE 1: KITCHEN DATA STORE MANAGEMENT ---
  function setupDataStoreListeners() {
    dom.dataSearchInput.addEventListener('input', (e) => {
      state.dataFilter.search = e.target.value.toLowerCase();
      renderMasterDataTable();
    });

    dom.dataSessionFilter.addEventListener('change', (e) => {
      state.dataFilter.session = e.target.value;
      renderMasterDataTable();
    });

    dom.dataWasteFilter.addEventListener('change', (e) => {
      state.dataFilter.wasteRate = e.target.value;
      renderMasterDataTable();
    });

    dom.btnExportCsv.addEventListener('click', () => {
      const csv = window.kitchenDB.exportToCSV();
      downloadFile(csv, 'ZeroPlate_Member2_Historical_Records.csv', 'text/csv');
      showToast('Exported historical kitchen records to CSV!');
    });

    dom.btnExportJson.addEventListener('click', () => {
      const json = window.kitchenDB.exportToJSON();
      downloadFile(json, 'ZeroPlate_Member2_Historical_Records.json', 'application/json');
      showToast('Exported historical kitchen records to JSON!');
    });

    dom.btnResetData.addEventListener('click', () => {
      if (confirm('Reset kitchen records to default 35-day realistic sample dataset?')) {
        window.kitchenDB.resetToDefault();
        updateGlobalKpiBar();
        runDemandForecast();
        renderAuditView();
        renderSimulatorView();
        renderMasterDataTable();
        showToast('Sample dataset restored successfully!');
      }
    });
  }

  function renderMasterDataTable() {
    let records = window.kitchenDB.getRecords();

    // Apply Filters
    if (state.dataFilter.search) {
      records = records.filter(r => 
        r.dishName.toLowerCase().includes(state.dataFilter.search) ||
        r.id.toLowerCase().includes(state.dataFilter.search) ||
        r.category.toLowerCase().includes(state.dataFilter.search)
      );
    }

    if (state.dataFilter.session !== 'All') {
      records = records.filter(r => r.mealSession === state.dataFilter.session);
    }

    if (state.dataFilter.wasteRate === 'High') {
      records = records.filter(r => r.wastePercentage >= 15);
    } else if (state.dataFilter.wasteRate === 'Moderate') {
      records = records.filter(r => r.wastePercentage >= 8 && r.wastePercentage < 15);
    } else if (state.dataFilter.wasteRate === 'Low') {
      records = records.filter(r => r.wastePercentage < 8);
    }

    dom.dataRecordsCount.textContent = `Showing ${records.length} records`;
    dom.masterDataTableBody.innerHTML = '';

    records.slice(0, 50).forEach(r => {
      const tr = document.createElement('tr');
      const wasteBadgeClass = r.wastePercentage >= 15 ? 'badge-waste-high' : 'badge-waste-low';

      tr.innerHTML = `
        <td style="font-family: monospace; font-size: 0.76rem;">${r.id}</td>
        <td><strong>${r.date}</strong> <span style="font-size:0.72rem; color:var(--text-muted);">${r.dayOfWeek.slice(0, 3)}</span></td>
        <td><span class="badge-cell badge-session">${r.mealSession}</span></td>
        <td><strong>${r.dishName}</strong></td>
        <td><span style="font-size: 0.76rem; color: var(--text-muted);">${r.category}</span></td>
        <td>${r.headcount}</td>
        <td><span class="badge-cell badge-weather">${r.weather}</span> <span style="font-size:0.7rem; color:var(--text-muted);">${r.eventType}</span></td>
        <td>${r.cookedQtyKg}</td>
        <td>${r.consumedQtyKg}</td>
        <td><strong style="color: var(--danger);">${r.wasteQtyKg}</strong></td>
        <td><span class="badge-cell ${wasteBadgeClass}">${r.wastePercentage}%</span></td>
        <td style="color: #f59e0b; font-weight:600;">₹${Math.round(r.totalWasteCost)}</td>
        <td>
          <button class="btn btn-secondary btn-sm btn-icon-only btn-delete-row" data-id="${r.id}" title="Delete Record">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#f43f5e" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
          </button>
        </td>
      `;
      dom.masterDataTableBody.appendChild(tr);
    });

    // Bind delete row
    dom.masterDataTableBody.querySelectorAll('.btn-delete-row').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const id = e.currentTarget.getAttribute('data-id');
        if (confirm(`Delete record ${id}?`)) {
          window.kitchenDB.deleteRecord(id);
          updateGlobalKpiBar();
          renderMasterDataTable();
          showToast(`Record ${id} removed`);
        }
      });
    });
  }

  function downloadFile(content, fileName, contentType) {
    const a = document.createElement('a');
    const file = new Blob([content], { type: contentType });
    a.href = URL.createObjectURL(file);
    a.download = fileName;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  // --- MODAL CONTROLLERS ---
  function setupModalListeners() {
    // Quick Add
    dom.btnQuickAddRecord.addEventListener('click', () => {
      dom.recordId.value = '';
      dom.recordDate.value = getTodayDateStr();
      dom.recordCooked.value = '';
      dom.recordConsumed.value = '';
      updateModalAutoCalc();
      dom.modalRecord.classList.add('active');
    });

    dom.btnCloseModalRecord.addEventListener('click', () => {
      dom.modalRecord.classList.remove('active');
    });

    dom.btnCancelRecord.addEventListener('click', () => {
      dom.modalRecord.classList.remove('active');
    });

    // Real-time live auto-calc preview inside modal
    dom.recordCooked.addEventListener('input', updateModalAutoCalc);
    dom.recordConsumed.addEventListener('input', updateModalAutoCalc);

    // Save record submit
    dom.formKitchenRecord.addEventListener('submit', (e) => {
      e.preventDefault();
      const cooked = parseFloat(dom.recordCooked.value);
      const consumed = parseFloat(dom.recordConsumed.value);

      if (isNaN(cooked) || isNaN(consumed)) {
        alert('Please specify valid numeric quantities');
        return;
      }

      const dishId = dom.recordDishSelect.value;
      const catalog = window.kitchenDB.getCatalog();
      const dishMeta = catalog.find(d => d.id === dishId);

      const record = {
        date: dom.recordDate.value,
        mealSession: dom.recordSession.value,
        dishId: dishId,
        dishName: dishMeta ? dishMeta.name : 'Unknown Dish',
        category: dishMeta ? dishMeta.category : 'General',
        headcount: parseInt(dom.recordHeadcount.value, 10) || 250,
        cookedQtyKg: cooked,
        consumedQtyKg: consumed,
        weather: dom.recordWeather.value,
        eventType: dom.recordEvent.value
      };

      window.kitchenDB.addRecord(record);
      dom.modalRecord.classList.remove('active');

      updateGlobalKpiBar();
      runDemandForecast();
      renderAuditView();
      renderSimulatorView();
      renderMasterDataTable();

      showToast(`Saved cooking record for ${record.dishName}!`);
    });

    // Math Modal
    dom.btnOpenMath.addEventListener('click', () => {
      dom.modalMath.classList.add('active');
    });

    dom.btnCloseModalMath.addEventListener('click', () => {
      dom.modalMath.classList.remove('active');
    });

    dom.btnCloseMathDone.addEventListener('click', () => {
      dom.modalMath.classList.remove('active');
    });
  }

  function updateModalAutoCalc() {
    const cooked = parseFloat(dom.recordCooked.value) || 0;
    const consumed = parseFloat(dom.recordConsumed.value) || 0;
    const waste = Math.max(0, cooked - consumed);
    const wastePct = cooked > 0 ? (waste / cooked) * 100 : 0;
    const recAi = consumed * 1.055;
    const aiSaved = Math.max(0, cooked - recAi);

    dom.previewWasteKg.textContent = `${waste.toFixed(1)} kg`;
    dom.previewWastePct.textContent = `${wastePct.toFixed(1)}%`;
    dom.previewAiSaved.textContent = `${aiSaved.toFixed(1)} kg`;
  }

  // Launch application
  init();
});
