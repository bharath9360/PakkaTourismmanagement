/**
 * ═══════════════════════════════════════════════════════════════════════════
 * Pakka Tourism — Pricing Engine  (utils/pricingEngine.js)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Authoritative server-side pricing calculator.
 * All quote amounts shown to customers originate here.
 *
 * Exports:
 *   calculateQuotation(pax, days, locationRates)  ← PRIMARY function (v2)
 *   calculatePricing(pax, days, config)           ← legacy alias (backward compat)
 *   generateMatrix(days, config)                  ← 1-50 pax tariff matrix
 *   DEFAULT_CONFIG                                ← fallback rate sheet
 *
 * Rate structure (locationRates / config):
 *   room  : { cost, sell, cap }   cost & sell per room per night; cap = max pax/room
 *   jeep  : { cost, sell, cap }   cost & sell per jeep per day;   cap = max pax/jeep
 *   food  : { cost, sell }        cost & sell per pax per day
 *   std   : { base, min_pax, inc } standard package params
 * ═══════════════════════════════════════════════════════════════════════════
 */

'use strict';

// ─── Default Rate Sheet ────────────────────────────────────────────────────
const DEFAULT_CONFIG = {
  room: { cost: 2000, sell: 3000, cap: 3 },   // per room / night
  jeep: { cost: 3500, sell: 4500, cap: 8 },   // per jeep / day
  food: { cost: 100,  sell: 150 },             // per pax  / day
  std:  { base: 1250, min_pax: 8, inc: 150 }, // standard package
};

// ─── Pure Helpers ──────────────────────────────────────────────────────────

/**
 * Round a rupee value to the nearest whole rupee.
 * @param {number} val
 * @returns {number}
 */
const rupee = (val) => Math.round(val);

/**
 * Validate and coerce inputs.  Throws a descriptive Error on bad data.
 * @param {number} pax   - total travellers
 * @param {number} days  - trip duration in days (minimum 1)
 * @param {object} rates - rate config object
 * @throws {Error}
 */
function validateInputs(pax, days, rates) {
  if (!Number.isFinite(pax)  || pax  < 1) throw new Error(`Invalid pax: "${pax}". Must be a positive integer.`);
  if (!Number.isFinite(days) || days < 1) throw new Error(`Invalid days: "${days}". Must be at least 1.`);
  if (!rates || typeof rates !== 'object') throw new Error('locationRates must be an object.');

  const needed = ['room.sell', 'room.cap', 'jeep.sell', 'jeep.cap', 'food.sell', 'std.base', 'std.min_pax', 'std.inc'];
  for (const path of needed) {
    const [sec, key] = path.split('.');
    if (!rates[sec] || !Number.isFinite(rates[sec][key])) {
      throw new Error(`Missing or invalid rate: "${path}" in locationRates.`);
    }
  }
}

// ─── Model A: Customised (Component-based) ────────────────────────────────

/**
 * Calculate Model A — Customised Pricing.
 *
 * Formula
 *   rooms     = ceil(pax / roomCap)
 *   jeeps     = ceil(pax / jeepCap)
 *   nights    = days - 1            (day trips have 0 nights)
 *
 *   roomCost  = rooms × nights × roomSellRate
 *   jeepCost  = jeeps × days   × jeepSellRate
 *   foodCost  = pax   × days   × foodSellRate
 *   total     = roomCost + jeepCost + foodCost
 *   perHead   = total / pax
 *
 * @param {number} pax
 * @param {number} days
 * @param {object} rates
 * @returns {object}
 */
function computeModelA(pax, days, rates) {
  const nights = Math.max(0, days - 1);  // 1-day trips → 0 nights

  // ── Logistics ────────────────────────────────────────────────────────────
  // Rooms: only needed when there are overnight stays
  const requiredRooms = nights > 0 ? Math.ceil(pax / rates.room.cap) : 0;
  // Jeeps: always needed for transportation (every day)
  const requiredJeeps = Math.ceil(pax / rates.jeep.cap);

  // ── Revenue Components (sell prices shown to customer) ───────────────────
  const roomRevenue  = rupee(requiredRooms * nights * rates.room.sell);
  const jeepRevenue  = rupee(requiredJeeps * days  * rates.jeep.sell);
  const foodRevenue  = rupee(pax           * days  * rates.food.sell);
  const customTotal  = roomRevenue + jeepRevenue + foodRevenue;
  const customPerHead = rupee(customTotal / pax);

  // ── Internal Cost (admin visibility only) ────────────────────────────────
  const roomCost   = rupee(requiredRooms * nights * (rates.room.cost ?? rates.room.sell));
  const jeepCost   = rupee(requiredJeeps * days   * (rates.jeep.cost ?? rates.jeep.sell));
  const foodCost   = rupee(pax           * days   * (rates.food.cost ?? rates.food.sell));
  const totalCost  = roomCost + jeepCost + foodCost;

  const grossProfit   = customTotal - totalCost;
  const profitMarginPct = customTotal > 0
    ? parseFloat(((grossProfit / customTotal) * 100).toFixed(2))
    : 0;

  return {
    // What the customer sees
    label:      'Model A — Customised Package',
    total:      customTotal,
    perHead:    customPerHead,

    // Logistics breakdown
    logistics: {
      requiredRooms,
      requiredJeeps,
      nights,

      // Revenue line items
      roomRevenue,
      jeepRevenue,
      foodRevenue,

      // Per-unit rates used
      ratesUsed: {
        roomSellPerNight: rates.room.sell,
        jeepSellPerDay:   rates.jeep.sell,
        foodSellPerDay:   rates.food.sell,
        roomCapacity:     rates.room.cap,
        jeepCapacity:     rates.jeep.cap,
      },
    },

    // Admin-only profitability data
    admin: {
      totalCost,
      roomCost,
      jeepCost,
      foodCost,
      grossProfit,
      profitMarginPct,
    },
  };
}

// ─── Model B: Standard Package ────────────────────────────────────────────

/**
 * Calculate Model B — Standard Package Pricing.
 *
 * Formula
 *   missingPax = max(0, minPax - pax)                  ← people below threshold
 *   penalty    = missingPax × penaltyPerMissingPerDay × days
 *   baseAmount = basePricePerPaxPerDay × days × pax
 *
 *   stdPerHead = (basePricePerPaxPerDay × days) + (missingPax × penaltyPerMissingPerDay × days)
 *   stdTotal   = stdPerHead × pax
 *
 * Why: the package is designed for ≥ minPax people to be profitable.
 * Small groups must absorb the revenue loss through a surcharge.
 *
 * @param {number} pax
 * @param {number} days
 * @param {object} rates
 * @returns {object}
 */
function computeModelB(pax, days, rates) {
  const { base, min_pax: minPax, inc: penaltyPerMissingPerDay } = rates.std;

  // How many persons short of the minimum threshold
  const missingPax     = Math.max(0, minPax - pax);
  const hasSmallGroupPenalty = missingPax > 0;

  // Per-head calculation
  const basePerHead    = rupee(base * days);                            // base component
  const penaltyPerHead = rupee(missingPax * penaltyPerMissingPerDay * days); // surcharge component
  const stdPerHead     = basePerHead + penaltyPerHead;

  // Group total
  const stdTotal       = rupee(stdPerHead * pax);

  // Effective rate (useful for display)
  const effectiveRatePerPaxPerDay = pax > 0 && days > 0
    ? parseFloat((stdPerHead / days).toFixed(2))
    : base;

  return {
    label:   'Model B — Standard Package',
    total:   stdTotal,
    perHead: stdPerHead,

    // Breakdown
    standardBreakdown: {
      basePricePerPaxPerDay:     base,
      minPaxRequired:            minPax,
      actualPax:                 pax,
      missingPax,
      hasSmallGroupPenalty,
      penaltyPerMissingPaxPerDay: penaltyPerMissingPerDay,

      // Computed amounts
      basePerHead,
      penaltyPerHead,
      effectiveRatePerPaxPerDay,

      // Human-readable explanation
      explanation: hasSmallGroupPenalty
        ? `Group is ${missingPax} pax below the ${minPax}-pax minimum. ` +
          `A surcharge of ₹${penaltyPerMissingPerDay}/missing pax/day × ${days} days × ${missingPax} missing = ₹${penaltyPerHead}/head is applied.`
        : `Group meets the ${minPax}-pax minimum. No surcharge applied.`,
    },
  };
}

// ─── PRIMARY EXPORT: calculateQuotation ───────────────────────────────────

/**
 * Calculate a full travel quotation with both pricing models.
 *
 * @param {number} pax           - Number of travellers (must be ≥ 1)
 * @param {number} days          - Trip duration in days (must be ≥ 1)
 * @param {object} locationRates - Rate config (defaults to DEFAULT_CONFIG if omitted)
 *
 * @returns {{
 *   input:     { pax, days, nights },
 *   modelA:    object,   // Customised pricing
 *   modelB:    object,   // Standard package pricing
 *   comparison: {
 *     cheaperModel:      'A' | 'B' | 'EQUAL',
 *     differencePerHead: number,   // modelA.perHead - modelB.perHead (negative = A cheaper)
 *     differenceTotal:   number,   // modelA.total   - modelB.total
 *     savingsIfChoosing: { model, amount, perHead }
 *   },
 *   recommendation: string,
 * }}
 *
 * @throws {Error} on invalid inputs
 *
 * @example
 * const quote = calculateQuotation(10, 3, DEFAULT_CONFIG);
 * console.log(quote.modelA.total);       // ₹ total for customised
 * console.log(quote.modelB.perHead);     // ₹ per head for standard
 * console.log(quote.comparison.cheaperModel); // 'A' or 'B'
 */
function calculateQuotation(pax, days, locationRates = DEFAULT_CONFIG) {
  // ── 1. Normalise & Validate ────────────────────────────────────────────
  const normPax  = parseInt(pax,  10);
  const normDays = parseInt(days, 10);
  const rates    = locationRates || DEFAULT_CONFIG;

  validateInputs(normPax, normDays, rates);

  const nights = Math.max(0, normDays - 1);

  // ── 2. Compute both models ─────────────────────────────────────────────
  const modelA = computeModelA(normPax, normDays, rates);
  const modelB = computeModelB(normPax, normDays, rates);

  // ── 3. Comparison & Recommendation ────────────────────────────────────
  const diffPerHead = modelA.perHead - modelB.perHead;
  const diffTotal   = modelA.total   - modelB.total;

  let cheaperModel;
  if (diffTotal < 0)       cheaperModel = 'A';
  else if (diffTotal > 0)  cheaperModel = 'B';
  else                     cheaperModel = 'EQUAL';

  const savingsAmount    = Math.abs(diffTotal);
  const savingsPerHead   = Math.abs(diffPerHead);
  const savingsIfChoosing = {
    model:   cheaperModel,
    amount:  savingsAmount,
    perHead: savingsPerHead,
    label:   cheaperModel === 'EQUAL'
      ? 'Both models are equally priced.'
      : `Choose ${cheaperModel === 'A' ? 'Customised (Model A)' : 'Standard (Model B)'} to save ₹${savingsAmount} (₹${savingsPerHead}/head).`,
  };

  // Recommendation logic
  let recommendation;
  if (cheaperModel === 'EQUAL') {
    recommendation = 'Both models yield the same price. Choose the Standard package for simplicity.';
  } else if (cheaperModel === 'A') {
    recommendation = normPax >= rates.std.min_pax
      ? `Customised (Model A) is cheaper by ₹${savingsPerHead}/head. Recommended for this group size (${normPax} pax).`
      : `Customised (Model A) is cheaper by ₹${savingsPerHead}/head. The Standard package carries a small-group surcharge for ${normPax} pax.`;
  } else {
    recommendation = `Standard Package (Model B) is cheaper by ₹${savingsPerHead}/head. ` +
      (normPax >= rates.std.min_pax
        ? `Good choice for a group of ${normPax} — no surcharge applies.`
        : `Note: a small-group surcharge is included because you are ${rates.std.min_pax - normPax} pax below the ${rates.std.min_pax}-pax minimum.`);
  }

  // ── 4. Assemble Final Output ────────────────────────────────────────────
  return {
    // Echo back validated inputs
    input: {
      pax:    normPax,
      days:   normDays,
      nights,
    },

    // Both pricing models (fully detailed)
    modelA,
    modelB,

    // Head-to-head comparison
    comparison: {
      cheaperModel,
      differencePerHead: diffPerHead,  // +ve = A more expensive; -ve = A cheaper
      differenceTotal:   diffTotal,
      savingsIfChoosing,
    },

    // Human-readable recommendation for UI / PDF
    recommendation,
  };
}

// ─── LEGACY ALIAS: calculatePricing ───────────────────────────────────────
// Kept for full backward compatibility with pricingController.js which
// already uses this function name. It maps the new detailed output back to
// the original flat shape that the controller and matrix generator expect.

/**
 * @deprecated Use calculateQuotation() for new code.
 */
function calculatePricing(pax, days, config = DEFAULT_CONFIG) {
  try {
    const q = calculateQuotation(pax, days, config);
    const a = q.modelA;
    const b = q.modelB;

    return {
      // Top-level echo
      pax:    q.input.pax,
      days:   q.input.days,
      nights: q.input.nights,

      // Flat logistics (controller reads these directly)
      logistics: {
        rooms:      a.logistics.requiredRooms,
        jeeps:      a.logistics.requiredJeeps,
        roomSell:   a.logistics.roomRevenue,
        jeepSell:   a.logistics.jeepRevenue,
        foodSell:   a.logistics.foodRevenue,
      },

      // Model A → custom
      custom: {
        total:   a.total,
        perHead: a.perHead,
      },

      // Model B → standard
      standard: {
        total:      b.total,
        perHead:    b.perHead,
        missingPax: b.standardBreakdown.missingPax,
      },

      // Price difference
      diff: {
        total:   q.comparison.differenceTotal,
        perHead: q.comparison.differencePerHead,
      },

      // Admin profitability
      admin: {
        totalCost:    a.admin.totalCost,
        customProfit: a.admin.grossProfit,
        profitMargin: a.admin.profitMarginPct,
      },
    };
  } catch (err) {
    // Legacy code did not throw; return null-safe fallback
    console.error('[pricingEngine] calculatePricing error:', err.message);
    return null;
  }
}

// ─── Matrix Generator ─────────────────────────────────────────────────────

/**
 * Generate the full 1–50 pax tariff matrix for a given trip duration.
 * Each row is the calculatePricing() result for that pax count.
 *
 * @param {number} days
 * @param {object} config
 * @returns {Array<object>}  50 rows, one per pax count
 */
function generateMatrix(days, config = DEFAULT_CONFIG) {
  const rows = [];
  for (let pax = 1; pax <= 50; pax++) {
    const row = calculatePricing(pax, days, config);
    if (row) rows.push(row);
  }
  return rows;
}

// ─── Exports ───────────────────────────────────────────────────────────────
module.exports = {
  // Primary API (v2)
  calculateQuotation,

  // Legacy API (backward compat — controller + matrix still use these)
  calculatePricing,
  generateMatrix,

  // Defaults — useful for unit tests and frontend sync
  DEFAULT_CONFIG,
};
