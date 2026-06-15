const User = require('../models/User');

// ─── GET /api/settings/office-locations ─────────────────────────────────────
// Returns all saved office locations from the admin's profile
const getOfficeLocations = async (req, res, next) => {
  try {
    const admin = await User.findById(req.user._id);
    const locations = admin?.officeLocations || [];
    res.json({ success: true, data: locations });
  } catch (err) { next(err); }
};

// ─── POST /api/settings/office-location ─────────────────────────────────────
// Save a new or update an existing office location on admin's profile
const saveOfficeLocation = async (req, res, next) => {
  try {
    const { name, lat, lng, radius, _id } = req.body;

    if (!name || lat == null || lng == null) {
      return res.status(400).json({ success: false, message: 'Name, latitude and longitude are required' });
    }

    const admin = await User.findById(req.user._id);
    if (!admin.officeLocations) admin.officeLocations = [];

    if (_id) {
      // Update existing
      const idx = admin.officeLocations.findIndex(l => l._id?.toString() === _id);
      if (idx !== -1) {
        admin.officeLocations[idx] = { ...admin.officeLocations[idx], name, lat, lng, radius: radius || 50 };
      }
    } else {
      // Add new
      admin.officeLocations.push({ name, lat, lng, radius: radius || 50 });
    }

    admin.markModified('officeLocations');
    await admin.save();

    res.json({ success: true, data: admin.officeLocations });
  } catch (err) { next(err); }
};

// ─── DELETE /api/settings/office-location/:id ────────────────────────────────
const deleteOfficeLocation = async (req, res, next) => {
  try {
    const { id } = req.params;
    const admin = await User.findById(req.user._id);
    if (!admin.officeLocations) return res.json({ success: true, data: [] });

    admin.officeLocations = admin.officeLocations.filter(l => l._id?.toString() !== id);
    admin.markModified('officeLocations');
    await admin.save();

    res.json({ success: true, data: admin.officeLocations });
  } catch (err) { next(err); }
};

// ─── GET /api/settings/primary-location ─────────────────────────────────────
// Returns the first (primary) office location — used by attendance controller
const getPrimaryLocation = async (req, res, next) => {
  try {
    const admin = await User.findOne({ role: 'admin', isActive: true });
    const primary = admin?.officeLocations?.[0] || null;
    res.json({ success: true, data: primary });
  } catch (err) { next(err); }
};

module.exports = { getOfficeLocations, saveOfficeLocation, deleteOfficeLocation, getPrimaryLocation };
