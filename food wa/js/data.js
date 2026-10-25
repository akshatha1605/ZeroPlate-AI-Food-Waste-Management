/**
 * ZeroPlate - Member 2: Demand Forecasting
 * data.js: Master Sample Data & Persistent Storage Engine
 * 
 * Features:
 * - 30+ days of historical kitchen cooking, consumption, and waste records
 * - Realistic variance across meal sessions (Breakfast, Lunch, Dinner)
 * - Weather conditions, day-of-week, event flags, and actual headcounts
 * - LocalStorage sync with seamless reset capability
 * - CSV and JSON import/export helpers
 */

// Default Dish Catalog with cost metrics & category
const DISH_CATALOG = [
  { id: 'D01', name: 'Paneer Butter Masala', category: 'Main Course (Veg)', unitCost: 180, carbonFactor: 3.2, baseShelfLifeHours: 24, batchCookable: true },
  { id: 'D02', name: 'Dal Makhani', category: 'Main Course (Veg)', unitCost: 110, carbonFactor: 1.8, baseShelfLifeHours: 36, batchCookable: true },
  { id: 'D03', name: 'Steamed Basmati Rice', category: 'Staples', unitCost: 45, carbonFactor: 1.4, baseShelfLifeHours: 12, batchCookable: true },
  { id: 'D04', name: 'Veg Dum Biryani', category: 'Specialty', unitCost: 140, carbonFactor: 2.1, baseShelfLifeHours: 18, batchCookable: true },
  { id: 'D05', name: 'Tandoori Chapati / Roti', category: 'Breads', unitCost: 35, carbonFactor: 0.9, baseShelfLifeHours: 6, batchCookable: false },
  { id: 'D06', name: 'Grilled Herb Chicken', category: 'Main Course (Non-Veg)', unitCost: 260, carbonFactor: 4.8, baseShelfLifeHours: 18, batchCookable: true },
  { id: 'D07', name: 'Tomato Basil Soup', category: 'Starters', unitCost: 85, carbonFactor: 1.1, baseShelfLifeHours: 24, batchCookable: true },
  { id: 'D08', name: 'Garden Green Salad', category: 'Sides', unitCost: 70, carbonFactor: 0.6, baseShelfLifeHours: 8, batchCookable: false },
  { id: 'D09', name: 'Warm Gulab Jamun', category: 'Desserts', unitCost: 160, carbonFactor: 2.4, baseShelfLifeHours: 48, batchCookable: false },
  { id: 'D10', name: 'Mixed Vegetable Curry', category: 'Main Course (Veg)', unitCost: 95, carbonFactor: 1.5, baseShelfLifeHours: 24, batchCookable: true }
];

// Weather multipliers on specific food categories
const WEATHER_FACTORS = {
  'Sunny': { 'Starters': 0.9, 'Sides': 1.15, 'Specialty': 1.0, 'Main Course (Veg)': 1.0, 'Breads': 1.0, 'Desserts': 0.95, 'Staples': 1.0, 'Main Course (Non-Veg)': 1.0 },
  'Rainy': { 'Starters': 1.35, 'Sides': 0.75, 'Specialty': 1.25, 'Main Course (Veg)': 1.1, 'Breads': 1.1, 'Desserts': 1.2, 'Staples': 1.1, 'Main Course (Non-Veg)': 1.2 },
  'Cold/Overcast': { 'Starters': 1.25, 'Sides': 0.85, 'Specialty': 1.15, 'Main Course (Veg)': 1.05, 'Breads': 1.05, 'Desserts': 1.15, 'Staples': 1.05, 'Main Course (Non-Veg)': 1.1 },
  'Humid/Hot': { 'Starters': 0.85, 'Sides': 1.25, 'Specialty': 0.9, 'Main Course (Veg)': 0.95, 'Breads': 0.95, 'Desserts': 0.9, 'Staples': 0.95, 'Main Course (Non-Veg)': 0.95 }
};

// Day of week base demand multipliers (0 = Sunday, ..., 6 = Saturday)
const DAY_FACTORS = {
  0: { Lunch: 0.75, Dinner: 1.20, Breakfast: 0.80 }, // Sunday
  1: { Lunch: 1.15, Dinner: 0.95, Breakfast: 1.10 }, // Monday (heavy lunch)
  2: { Lunch: 1.10, Dinner: 0.95, Breakfast: 1.05 }, // Tuesday
  3: { Lunch: 1.05, Dinner: 1.00, Breakfast: 1.00 }, // Wednesday
  4: { Lunch: 1.00, Dinner: 1.05, Breakfast: 1.00 }, // Thursday
  5: { Lunch: 1.10, Dinner: 1.25, Breakfast: 1.05 }, // Friday (peak dinner)
  6: { Lunch: 0.85, Dinner: 1.20, Breakfast: 0.85 }  // Saturday
};

// Generator for 35 days of synthetic, realistic historical kitchen records
function generateSampleHistoricalData() {
  const records = [];
  const baseDate = new Date();
  baseDate.setDate(baseDate.getDate() - 35); // 35 days ago to yesterday

  const mealSessions = ['Lunch', 'Dinner'];
  const weatherOptions = ['Sunny', 'Rainy', 'Cold/Overcast', 'Humid/Hot'];

  let recordIdCounter = 1001;

  for (let dayOffset = 0; dayOffset < 35; dayOffset++) {
    const currentDate = new Date(baseDate);
    currentDate.setDate(baseDate.getDate() + dayOffset);
    const dateStr = currentDate.toISOString().split('T')[0];
    const dayOfWeek = currentDate.getDay();

    // Weather pattern simulation
    let weather = weatherOptions[0];
    if (dayOffset % 7 === 2 || dayOffset % 11 === 0) weather = 'Rainy';
    else if (dayOffset % 5 === 0) weather = 'Cold/Overcast';
    else if (dayOffset % 9 === 0) weather = 'Humid/Hot';

    // Event simulation
    let eventType = 'Regular';
    if (dayOfWeek === 0 || dayOfWeek === 6) eventType = 'Weekend';
    if (dayOffset === 14 || dayOffset === 28) eventType = 'Campus Event / Festival';
    if (dayOffset >= 20 && dayOffset <= 23) eventType = 'Exam Week';

    mealSessions.forEach(meal => {
      // Base guest headcount
      let baseHeadcount = meal === 'Lunch' ? 260 : 220;
      if (dayOfWeek === 0) baseHeadcount = meal === 'Lunch' ? 180 : 250;
      if (eventType === 'Campus Event / Festival') baseHeadcount += 80;
      if (eventType === 'Exam Week') baseHeadcount = meal === 'Lunch' ? 290 : 190;

      // Add small natural random fluctuation (+/- 12)
      const actualHeadcount = Math.round(baseHeadcount + (Math.sin(dayOffset + (meal === 'Lunch' ? 1 : 2)) * 12));

      // Select 5-6 dishes per session
      const dishesForSession = meal === 'Lunch' 
        ? ['D01', 'D02', 'D03', 'D05', 'D08', 'D10']
        : ['D01', 'D04', 'D06', 'D05', 'D07', 'D09'];

      dishesForSession.forEach(dishId => {
        const dish = DISH_CATALOG.find(d => d.id === dishId);
        if (!dish) return;

        // Base portion per head in kg (e.g. rice 0.12kg/person, dal 0.09kg/person)
        let perHeadKg = 0.08;
        if (dish.category === 'Staples' || dish.id === 'D04') perHeadKg = 0.11;
        if (dish.category === 'Breads') perHeadKg = 0.07;
        if (dish.category === 'Starters') perHeadKg = 0.06;
        if (dish.category === 'Sides') perHeadKg = 0.05;
        if (dish.category === 'Desserts') perHeadKg = 0.04;

        // Apply weather factor
        const weatherCoeff = (WEATHER_FACTORS[weather] && WEATHER_FACTORS[weather][dish.category]) || 1.0;
        
        // Day factor
        const dayCoeff = (DAY_FACTORS[dayOfWeek] && DAY_FACTORS[dayOfWeek][meal]) || 1.0;

        // Calculate actual consumed quantity with small noise
        const idealConsumed = actualHeadcount * perHeadKg * weatherCoeff * dayCoeff;
        const noiseFactor = 0.94 + ((Math.cos(recordIdCounter * 0.7) + 1) * 0.06); // 0.94 to 1.06
        const consumedQtyKg = parseFloat((idealConsumed * noiseFactor).toFixed(1));

        // Prior to optimization, commercial kitchens systematically over-cook by 12% - 24%
        // We simulate unguided kitchen overcooking:
        const unguidedBuffer = 1.14 + (((recordIdCounter % 7) / 7) * 0.12);
        const cookedQtyKg = parseFloat((consumedQtyKg * unguidedBuffer).toFixed(1));
        const wasteQtyKg = parseFloat(Math.max(0, cookedQtyKg - consumedQtyKg).toFixed(1));
        const wastePercentage = parseFloat(((wasteQtyKg / cookedQtyKg) * 100).toFixed(1));

        // Member 2 recommendation simulation (if ZeroPlate was running, recommendation would be lean buffer: 1.05)
        const recommendedQtyKg = parseFloat((consumedQtyKg * 1.055).toFixed(1));
        const simulatedWasteWithZeroPlate = parseFloat(Math.max(0, recommendedQtyKg - consumedQtyKg).toFixed(1));

        records.push({
          id: `REC-${recordIdCounter++}`,
          date: dateStr,
          dayOfWeek: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][dayOfWeek],
          mealSession: meal,
          dishId: dish.id,
          dishName: dish.name,
          category: dish.category,
          headcount: actualHeadcount,
          weather: weather,
          eventType: eventType,
          cookedQtyKg: cookedQtyKg,
          consumedQtyKg: consumedQtyKg,
          wasteQtyKg: wasteQtyKg,
          wastePercentage: wastePercentage,
          unitCost: dish.unitCost,
          totalWasteCost: parseFloat((wasteQtyKg * dish.unitCost).toFixed(2)),
          carbonKgCo2e: parseFloat((wasteQtyKg * dish.carbonFactor).toFixed(2)),
          recommendedQtyKg: recommendedQtyKg,
          simulatedWasteWithZeroPlate: simulatedWasteWithZeroPlate
        });
      });
    });
  }

  return records;
}

// LocalStorage Manager for Member 2 Data Deliverables
class KitchenDataManager {
  constructor() {
    this.STORAGE_KEY = 'zeroplate_member2_records_v1';
    this.CATALOG_KEY = 'zeroplate_member2_catalog_v1';
    this.initializeData();
  }

  initializeData() {
    if (!localStorage.getItem(this.STORAGE_KEY) || this.getRecords().length === 0) {
      const initialRecords = generateSampleHistoricalData();
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(initialRecords));
    }
    if (!localStorage.getItem(this.CATALOG_KEY)) {
      localStorage.setItem(this.CATALOG_KEY, JSON.stringify(DISH_CATALOG));
    }
  }

  getRecords() {
    try {
      const data = localStorage.getItem(this.STORAGE_KEY);
      return data ? JSON.parse(data) : [];
    } catch (e) {
      console.error('Failed to parse records from localStorage', e);
      return [];
    }
  }

  getCatalog() {
    try {
      const data = localStorage.getItem(this.CATALOG_KEY);
      return data ? JSON.parse(data) : DISH_CATALOG;
    } catch (e) {
      return DISH_CATALOG;
    }
  }

  addRecord(record) {
    const records = this.getRecords();
    
    // Auto-calculate dependencies
    const cooked = parseFloat(record.cookedQtyKg);
    const consumed = parseFloat(record.consumedQtyKg);
    const waste = parseFloat(Math.max(0, cooked - consumed).toFixed(1));
    const wastePct = cooked > 0 ? parseFloat(((waste / cooked) * 100).toFixed(1)) : 0;
    
    const dish = this.getCatalog().find(d => d.id === record.dishId || d.name === record.dishName) || {
      unitCost: 100,
      carbonFactor: 2.0
    };

    const newRecord = {
      id: `REC-${Date.now().toString().slice(-6)}`,
      date: record.date || new Date().toISOString().split('T')[0],
      dayOfWeek: new Date(record.date).toLocaleDateString('en-US', { weekday: 'long' }),
      mealSession: record.mealSession || 'Lunch',
      dishId: dish.id || 'D99',
      dishName: record.dishName || dish.name,
      category: record.category || dish.category || 'General',
      headcount: parseInt(record.headcount, 10) || 250,
      weather: record.weather || 'Sunny',
      eventType: record.eventType || 'Regular',
      cookedQtyKg: cooked,
      consumedQtyKg: consumed,
      wasteQtyKg: waste,
      wastePercentage: wastePct,
      unitCost: dish.unitCost,
      totalWasteCost: parseFloat((waste * dish.unitCost).toFixed(2)),
      carbonKgCo2e: parseFloat((waste * dish.carbonFactor).toFixed(2)),
      recommendedQtyKg: parseFloat((consumed * 1.055).toFixed(1)),
      simulatedWasteWithZeroPlate: parseFloat(Math.max(0, (consumed * 1.055) - consumed).toFixed(1))
    };

    records.unshift(newRecord); // Add to beginning
    localStorage.setItem(this.STORAGE_KEY, JSON.stringify(records));
    return newRecord;
  }

  updateRecord(updated) {
    const records = this.getRecords();
    const index = records.findIndex(r => r.id === updated.id);
    if (index !== -1) {
      const cooked = parseFloat(updated.cookedQtyKg);
      const consumed = parseFloat(updated.consumedQtyKg);
      const waste = parseFloat(Math.max(0, cooked - consumed).toFixed(1));
      
      records[index] = {
        ...records[index],
        ...updated,
        cookedQtyKg: cooked,
        consumedQtyKg: consumed,
        wasteQtyKg: waste,
        wastePercentage: cooked > 0 ? parseFloat(((waste / cooked) * 100).toFixed(1)) : 0,
        totalWasteCost: parseFloat((waste * records[index].unitCost).toFixed(2)),
        carbonKgCo2e: parseFloat((waste * 2.0).toFixed(2))
      };
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(records));
      return records[index];
    }
    return null;
  }

  deleteRecord(id) {
    let records = this.getRecords();
    records = records.filter(r => r.id !== id);
    localStorage.setItem(this.STORAGE_KEY, JSON.stringify(records));
    return true;
  }

  resetToDefault() {
    localStorage.removeItem(this.STORAGE_KEY);
    localStorage.removeItem(this.CATALOG_KEY);
    this.initializeData();
    return this.getRecords();
  }

  exportToCSV() {
    const records = this.getRecords();
    if (!records.length) return '';
    const headers = Object.keys(records[0]);
    const csvRows = [headers.join(',')];

    for (const r of records) {
      const values = headers.map(header => {
        const escaped = ('' + (r[header] !== undefined ? r[header] : '')).replace(/"/g, '""');
        return `"${escaped}"`;
      });
      csvRows.push(values.join(','));
    }
    return csvRows.join('\n');
  }

  exportToJSON() {
    return JSON.stringify(this.getRecords(), null, 2);
  }
}

// Global data store instance
window.kitchenDB = new KitchenDataManager();
