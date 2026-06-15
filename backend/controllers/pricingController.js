const PricingConfig = require('../models/PricingConfig');
const { generateMatrix, calculatePricing, calculateQuotation, DEFAULT_CONFIG } = require('../utils/pricingEngine');

// Helper: get active config or default
const getActiveConfig = async () => {
  const config = await PricingConfig.findOne().sort({ updatedAt: -1 });
  return config || DEFAULT_CONFIG;
};

// @route  GET /api/pricing/config
const getConfig = async (req, res, next) => {
  try {
    const config = await getActiveConfig();
    res.json({ success: true, data: config });
  } catch (err) { next(err); }
};

// @route  PUT /api/pricing/config
const updateConfig = async (req, res, next) => {
  try {
    const { room, jeep, food, std } = req.body;
    let config = await PricingConfig.findOne().sort({ updatedAt: -1 });

    if (config) {
      Object.assign(config.room, room);
      Object.assign(config.jeep, jeep);
      Object.assign(config.food, food);
      Object.assign(config.std, std);
      config.updatedBy = req.user._id;
      await config.save();
    } else {
      config = await PricingConfig.create({ room, jeep, food, std, updatedBy: req.user._id });
    }

    res.json({ success: true, message: 'Pricing updated', data: config });
  } catch (err) { next(err); }
};

// @route  GET /api/pricing/matrix/:days
const getMatrix = async (req, res, next) => {
  try {
    const days = parseInt(req.params.days) || 2;
    const config = await getActiveConfig();
    const matrix = generateMatrix(days, config);
    res.json({ success: true, days, data: matrix });
  } catch (err) { next(err); }
};

// @route  POST /api/pricing/calculate
const calculate = async (req, res, next) => {
  try {
    const { pax, days } = req.body;
    const config = await getActiveConfig();

    const normPax  = parseInt(pax,  10);
    const normDays = parseInt(days, 10);

    // Legacy flat result (used by TariffMatrix)
    const legacy = calculatePricing(normPax, normDays, config);

    // Full quotation with Model A + B breakdown
    const quotation = calculateQuotation(normPax, normDays, config);

    res.json({ success: true, data: { ...legacy, quotation } });
  } catch (err) { next(err); }
};

module.exports = { getConfig, updateConfig, getMatrix, calculate };
