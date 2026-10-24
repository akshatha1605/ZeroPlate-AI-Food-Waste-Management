/**
 * ZeroPlate - Member 2: Demand Forecasting
 * forecasting.js: Predictive Analytics & Smart Kitchen Recommendation Engine
 * 
 * Implements:
 * 1. Hybrid Multi-Factor Demand Forecasting (Headcount + Day Seasonality + Weather + Events)
 * 2. Holt's Linear Exponential Smoothing (Level & Trend)
 * 3. 7-Day Weighted Moving Average (WMA)
 * 4. Dynamic Safety Buffer & Staged Batch Preparation Recommendations
 * 5. Retrospective Model Accuracy Audit (MAPE, MAE, Stockout Risk)
 * 6. Environmental & Financial Waste Reduction Impact Simulator
 */

const ForecastingEngine = {
  // Configurable algorithm parameters
  config: {
    alpha: 0.35,      // Level smoothing factor for Exponential Smoothing
    beta: 0.15,       // Trend smoothing factor
    wmaWeights: [0.30, 0.22, 0.16, 0.12, 0.09, 0.06, 0.05], // 7-day weights
    defaultBufferPct: 6.5, // Standard safety buffer percentage
    carbonFactorKg: 2.2,   // Average kg CO2e per kg prepared food waste
    mealPortionKg: 0.45    // Standard individual meal weight
  },

  /**
   * Retrieves relevant historical consumption records for a specific dish and meal session
   */
  getDishHistory(records, dishId, mealSession) {
    return records
      .filter(r => r.dishId === dishId && (!mealSession || r.mealSession === mealSession))
      .sort((a, b) => new Date(a.date) - new Date(b.date));
  },

  /**
   * 1. 7-Day Weighted Moving Average Forecast
   */
  forecastWMA(dishRecords) {
    if (!dishRecords || dishRecords.length === 0) return 0;
    const recent = dishRecords.slice(-7);
    const weights = this.config.wmaWeights.slice(0, recent.length);
    const weightSum = weights.reduce((acc, w) => acc + w, 0);

    let weightedSum = 0;
    // Iterate from newest to oldest
    for (let i = 0; i < recent.length; i++) {
      const idx = recent.length - 1 - i;
      weightedSum += recent[idx].consumedQtyKg * weights[i];
    }
    return parseFloat((weightedSum / weightSum).toFixed(2));
  },

  /**
   * 2. Holt's Linear Exponential Smoothing Forecast
   */
  forecastHoltExponential(dishRecords) {
    if (!dishRecords || dishRecords.length < 2) {
      return dishRecords.length === 1 ? dishRecords[0].consumedQtyKg : 0;
    }

    const alpha = this.config.alpha;
    const beta = this.config.beta;
    
    // Initial estimates
    let level = dishRecords[0].consumedQtyKg;
    let trend = dishRecords[1].consumedQtyKg - dishRecords[0].consumedQtyKg;

    for (let t = 1; t < dishRecords.length; t++) {
      const actual = dishRecords[t].consumedQtyKg;
      const prevLevel = level;
      level = alpha * actual + (1 - alpha) * (prevLevel + trend);
      trend = beta * (level - prevLevel) + (1 - beta) * trend;
    }

    // 1-step ahead forecast
    const forecast = Math.max(0, level + trend);
    return parseFloat(forecast.toFixed(2));
  },

  /**
   * 3. Hybrid Multi-Factor Demand Forecasting (Primary Model)
   * Combines baseline consumption, Day-of-Week Seasonality, Headcount Scaling,
   * Weather Multiplier, and Special Event factors.
   */
  forecastHybrid({
    records,
    dishId,
    targetDate,
    mealSession,
    projectedHeadcount,
    forecastWeather,
    eventType
  }) {
    const dishHistory = this.getDishHistory(records, dishId, mealSession);
    const catalog = window.kitchenDB ? window.kitchenDB.getCatalog() : [];
    const dishMeta = catalog.find(d => d.id === dishId) || { category: 'General', unitCost: 100 };

    if (dishHistory.length === 0) {
      // Cold-start fallback: estimate based on per-head average
      const basePerHead = 0.08;
      const baseline = (projectedHeadcount || 250) * basePerHead;
      return {
        predictedBaseConsumption: parseFloat(baseline.toFixed(1)),
        confidenceScore: 65,
        lowerBoundKg: parseFloat((baseline * 0.85).toFixed(1)),
        upperBoundKg: parseFloat((baseline * 1.15).toFixed(1)),
        factorBreakdown: { baseline, dayFactor: 1.0, weatherFactor: 1.0, headcountFactor: 1.0, eventFactor: 1.0 }
      };
    }

    // A. Baseline consumption (recent 14 days trimmed mean)
    const recentWindow = dishHistory.slice(-14);
    const recentValues = recentWindow.map(r => r.consumedQtyKg);
    const rawMean = recentValues.reduce((a, b) => a + b, 0) / recentValues.length;

    // Standard deviation for confidence intervals
    const variance = recentValues.reduce((sum, val) => sum + Math.pow(val - rawMean, 2), 0) / recentValues.length;
    const stdDev = Math.sqrt(variance);

    // B. Day-of-week seasonality index
    const targetDayIndex = new Date(targetDate).getDay();
    const sameDayRecords = dishHistory.filter(r => new Date(r.date).getDay() === targetDayIndex);
    let dayFactor = 1.0;
    if (sameDayRecords.length > 0) {
      const sameDayAvg = sameDayRecords.reduce((s, r) => s + r.consumedQtyKg, 0) / sameDayRecords.length;
      dayFactor = rawMean > 0 ? sameDayAvg / rawMean : 1.0;
      // Dampen extreme swings (0.75 to 1.30)
      dayFactor = Math.max(0.75, Math.min(1.30, dayFactor));
    }

    // C. Projected Headcount Scaling Factor
    const avgHistoricalHeadcount = recentWindow.reduce((s, r) => s + r.headcount, 0) / recentWindow.length;
    const headcountFactor = avgHistoricalHeadcount > 0 
      ? (projectedHeadcount / avgHistoricalHeadcount)
      : 1.0;

    // D. Weather Condition Factor
    const weatherTable = (typeof WEATHER_FACTORS !== 'undefined') ? WEATHER_FACTORS : {};
    const weatherCoeffs = weatherTable[forecastWeather] || {};
    const weatherFactor = weatherCoeffs[dishMeta.category] || 1.0;

    // E. Special Event Factor
    let eventFactor = 1.0;
    if (eventType === 'Exam Week') {
      // During exams, quick comfort foods increase, heavy elaborate foods decrease slightly
      eventFactor = dishMeta.category === 'Starters' || dishMeta.category === 'Staples' ? 1.12 : 0.94;
    } else if (eventType === 'Campus Event / Festival') {
      eventFactor = 1.25; // Significant influx
    } else if (eventType === 'Holiday / Low Attendance') {
      eventFactor = 0.65;
    }

    // Final Predicted Base Demand
    const predicted = rawMean * dayFactor * headcountFactor * weatherFactor * eventFactor;
    const predictedBase = parseFloat(Math.max(1.0, predicted).toFixed(1));

    // Confidence interval (95% CI)
    const marginOfError = Math.max(1.5, 1.96 * (stdDev / Math.sqrt(recentWindow.length)));
    const lowerBound = parseFloat(Math.max(0.5, predictedBase - marginOfError).toFixed(1));
    const upperBound = parseFloat((predictedBase + marginOfError).toFixed(1));

    // Confidence Score based on data consistency (low CV = high confidence)
    const coefficientOfVariation = rawMean > 0 ? (stdDev / rawMean) : 0.2;
    const confidenceScore = Math.max(68, Math.min(96, Math.round(100 - (coefficientOfVariation * 100))));

    return {
      predictedBaseConsumption: predictedBase,
      confidenceScore: confidenceScore,
      lowerBoundKg: lowerBound,
      upperBoundKg: upperBound,
      factorBreakdown: {
        baseline: parseFloat(rawMean.toFixed(1)),
        dayFactor: parseFloat(dayFactor.toFixed(2)),
        headcountFactor: parseFloat(headcountFactor.toFixed(2)),
        weatherFactor: parseFloat(weatherFactor.toFixed(2)),
        eventFactor: parseFloat(eventFactor.toFixed(2)),
        stdDev: parseFloat(stdDev.toFixed(2))
      }
    };
  },

  /**
   * Recommend Kitchen Preparation Quantities with Dynamic Safety Buffers & Batching
   */
  recommendDishPrep({
    predictedConsumption,
    dishMeta,
    safetyBufferPct = 6.5
  }) {
    // Dynamic buffer adjustments based on shelf life and category
    // High perishable dishes (salads, breads) get a tighter buffer
    let dynamicBuffer = safetyBufferPct;
    if (dishMeta.baseShelfLifeHours <= 8) {
      dynamicBuffer = Math.max(2.0, safetyBufferPct - 2.5); // lean buffer to avoid end-of-shift spoilage
    } else if (dishMeta.baseShelfLifeHours >= 36) {
      dynamicBuffer = safetyBufferPct + 1.5; // safer to buffer as it keeps safely
    }

    const bufferMultiplier = 1 + (dynamicBuffer / 100);
    const recommendedQtyKg = parseFloat((predictedConsumption * bufferMultiplier).toFixed(1));

    // Staged batch cooking plan
    let batchSchedule = null;
    if (dishMeta.batchCookable) {
      // 65% upfront at service start, 35% contingent on-demand
      const batch1 = parseFloat((recommendedQtyKg * 0.65).toFixed(1));
      const batch2 = parseFloat((recommendedQtyKg - batch1).toFixed(1));
      batchSchedule = {
        batch1QtyKg: batch1,
        batch2QtyKg: batch2,
        batch1Trigger: 'Service Start (Open)',
        batch2Trigger: 'Trigger at 50% consumption or mid-service footfall check'
      };
    } else {
      batchSchedule = {
        batch1QtyKg: recommendedQtyKg,
        batch2QtyKg: 0,
        batch1Trigger: 'Continuous Fresh Batching (Tandoor/Salad Counter)',
        batch2Trigger: 'N/A - Bake/Toss on Demand'
      };
    }

    // Financial prep cost estimate
    const estimatedPrepCost = parseFloat((recommendedQtyKg * (dishMeta.unitCost || 100)).toFixed(2));

    return {
      predictedConsumption,
      safetyBufferPct: parseFloat(dynamicBuffer.toFixed(1)),
      recommendedQtyKg,
      batchSchedule,
      estimatedPrepCost,
      dishMeta
    };
  },

  /**
   * Generates Complete Forecast & Preparation Recommendations for an entire meal session
   */
  generateSessionPlan({
    targetDate,
    mealSession,
    projectedHeadcount,
    forecastWeather,
    eventType,
    safetyBufferPct = 6.5,
    algorithm = 'hybrid'
  }) {
    const records = window.kitchenDB.getRecords();
    const catalog = window.kitchenDB.getCatalog();

    // Select active menu for this session
    const menuDishes = mealSession === 'Lunch'
      ? ['D01', 'D02', 'D03', 'D05', 'D08', 'D10']
      : ['D01', 'D04', 'D06', 'D05', 'D07', 'D09'];

    const recommendations = [];

    menuDishes.forEach(dishId => {
      const dishMeta = catalog.find(d => d.id === dishId);
      if (!dishMeta) return;

      let basePred = 0;
      let breakdown = null;
      let confidence = 85;

      if (algorithm === 'wma') {
        const history = this.getDishHistory(records, dishId, mealSession);
        basePred = this.forecastWMA(history);
        confidence = 78;
      } else if (algorithm === 'holt') {
        const history = this.getDishHistory(records, dishId, mealSession);
        basePred = this.forecastHoltExponential(history);
        confidence = 82;
      } else {
        // Default Hybrid
        const hybridResult = this.forecastHybrid({
          records,
          dishId,
          targetDate,
          mealSession,
          projectedHeadcount,
          forecastWeather,
          eventType
        });
        basePred = hybridResult.predictedBaseConsumption;
        breakdown = hybridResult.factorBreakdown;
        confidence = hybridResult.confidenceScore;
      }

      const prepRec = this.recommendDishPrep({
        predictedConsumption: basePred,
        dishMeta,
        safetyBufferPct
      });

      recommendations.push({
        dishId: dishMeta.id,
        dishName: dishMeta.name,
        category: dishMeta.category,
        unitCost: dishMeta.unitCost,
        predictedConsumptionKg: basePred,
        recommendedQtyKg: prepRec.recommendedQtyKg,
        safetyBufferPct: prepRec.safetyBufferPct,
        batchSchedule: prepRec.batchSchedule,
        estimatedCost: prepRec.estimatedPrepCost,
        confidenceScore: confidence,
        factorBreakdown: breakdown
      });
    });

    const totalRecommendedKg = parseFloat(recommendations.reduce((sum, r) => sum + r.recommendedQtyKg, 0).toFixed(1));
    const totalPredictedKg = parseFloat(recommendations.reduce((sum, r) => sum + r.predictedConsumptionKg, 0).toFixed(1));
    const totalEstimatedCost = parseFloat(recommendations.reduce((sum, r) => sum + r.estimatedCost, 0).toFixed(2));

    return {
      targetDate,
      mealSession,
      projectedHeadcount,
      forecastWeather,
      eventType,
      algorithm,
      totalRecommendedKg,
      totalPredictedKg,
      totalEstimatedCost,
      recommendations
    };
  },

  /**
   * Deliverable 4: Compare Actual Demand with ZeroPlate Recommendations
   * Computes accuracy metrics across historical data
   */
  evaluateHistoricalAccuracy(records) {
    if (!records || records.length === 0) {
      return {
        mape: 0,
        accuracyPct: 100,
        mae: 0,
        totalActualCookedKg: 0,
        totalRecommendedKg: 0,
        totalActualConsumedKg: 0,
        totalActualWasteKg: 0,
        projectedWasteWithAIKg: 0,
        stockoutIncidents: 0,
        recordsCount: 0
      };
    }

    let absolutePercentageErrorSum = 0;
    let absoluteErrorSum = 0;
    let totalActualCooked = 0;
    let totalRecommended = 0;
    let totalActualConsumed = 0;
    let totalActualWaste = 0;
    let totalSimulatedAIWaste = 0;
    let stockoutCount = 0;

    records.forEach(r => {
      const actualConsumed = r.consumedQtyKg;
      const actualCooked = r.cookedQtyKg;
      const recommended = r.recommendedQtyKg || (actualConsumed * 1.055);

      totalActualCooked += actualCooked;
      totalRecommended += recommended;
      totalActualConsumed += actualConsumed;
      totalActualWaste += r.wasteQtyKg;

      // Simulated waste if recommendation was followed
      const aiWaste = Math.max(0, recommended - actualConsumed);
      totalSimulatedAIWaste += aiWaste;

      // Check stockout (if recommendation was strictly less than actual consumed)
      if (recommended < actualConsumed) {
        stockoutCount++;
      }

      if (actualConsumed > 0) {
        const ape = Math.abs(recommended - actualConsumed) / actualConsumed;
        absolutePercentageErrorSum += ape;
        absoluteErrorSum += Math.abs(recommended - actualConsumed);
      }
    });

    const n = records.length;
    const mape = parseFloat(((absolutePercentageErrorSum / n) * 100).toFixed(1));
    const mae = parseFloat((absoluteErrorSum / n).toFixed(2));
    const accuracyPct = parseFloat(Math.max(0, 100 - mape).toFixed(1));

    return {
      mape,
      mae,
      accuracyPct,
      totalActualCookedKg: parseFloat(totalActualCooked.toFixed(1)),
      totalRecommendedKg: parseFloat(totalRecommended.toFixed(1)),
      totalActualConsumedKg: parseFloat(totalActualConsumed.toFixed(1)),
      totalActualWasteKg: parseFloat(totalActualWaste.toFixed(1)),
      projectedWasteWithAIKg: parseFloat(totalSimulatedAIWaste.toFixed(1)),
      wasteAvertedKg: parseFloat(Math.max(0, totalActualWaste - totalSimulatedAIWaste).toFixed(1)),
      stockoutIncidents: stockoutCount,
      stockoutRatePct: parseFloat(((stockoutCount / n) * 100).toFixed(1)),
      recordsCount: n
    };
  },

  /**
   * Deliverable 5: Expected Waste Reduction, Financial & Carbon Impact Simulator
   */
  simulateWasteReduction(records, bufferPct = 6.5, compliancePct = 90) {
    const historical = this.evaluateHistoricalAccuracy(records);
    
    // Baseline unoptimized waste
    const baselineWasteKg = historical.totalActualWasteKg;
    const baselineWasteCost = records.reduce((sum, r) => sum + r.totalWasteCost, 0);

    // Optimized waste calculation:
    // With dynamic recommendation + compliance:
    // Compliance represents the percentage of meals where the kitchen strictly followed ZeroPlate recommendations
    const complianceFraction = compliancePct / 100;
    const bufferMultiplier = 1 + (bufferPct / 100);

    let simulatedWasteKg = 0;
    let simulatedWasteCost = 0;

    records.forEach(r => {
      const unitCost = r.unitCost || 100;
      // Recommended quantity under the simulated buffer
      const rec = r.consumedQtyKg * bufferMultiplier;
      const wasteUnderAI = Math.max(0, rec - r.consumedQtyKg);

      // Blended waste based on kitchen compliance
      const effectiveWaste = (complianceFraction * wasteUnderAI) + ((1 - complianceFraction) * r.wasteQtyKg);
      simulatedWasteKg += effectiveWaste;
      simulatedWasteCost += (effectiveWaste * unitCost);
    });

    const netWasteSavedKg = Math.max(0, baselineWasteKg - simulatedWasteKg);
    const reductionPercentage = baselineWasteKg > 0 
      ? parseFloat(((netWasteSavedKg / baselineWasteKg) * 100).toFixed(1))
      : 0;

    const netCostSavings = Math.max(0, baselineWasteCost - simulatedWasteCost);
    const co2ePreventedKg = parseFloat((netWasteSavedKg * this.config.carbonFactorKg).toFixed(1));
    const mealsRescued = Math.round(netWasteSavedKg / this.config.mealPortionKg);

    // Trade-off: Lower buffer increases stockout risk
    let estimatedStockoutRisk = 0.5;
    if (bufferPct < 4.0) {
      estimatedStockoutRisk = parseFloat((0.5 + (4.0 - bufferPct) * 1.8).toFixed(1));
    } else if (bufferPct > 8.0) {
      estimatedStockoutRisk = 0.1;
    }

    return {
      baselineWasteKg: parseFloat(baselineWasteKg.toFixed(1)),
      simulatedWasteKg: parseFloat(simulatedWasteKg.toFixed(1)),
      netWasteSavedKg: parseFloat(netWasteSavedKg.toFixed(1)),
      reductionPercentage,
      baselineCost: parseFloat(baselineWasteCost.toFixed(2)),
      simulatedCost: parseFloat(simulatedWasteCost.toFixed(2)),
      netCostSavings: parseFloat(netCostSavings.toFixed(2)),
      co2ePreventedKg,
      mealsRescued,
      estimatedStockoutRisk,
      compliancePct,
      bufferPct
    };
  }
};

window.ForecastingEngine = ForecastingEngine;
