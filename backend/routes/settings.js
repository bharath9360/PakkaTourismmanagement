const router = require('express').Router();
const path   = require('path');
const { protect, adminOnly } = require('../middleware/authMiddleware');
const { uploadCompanyLogo } = require('../middleware/uploadMiddleware');
const CompanySettings = require('../models/CompanySettings');
const {
  getOfficeLocations,
  saveOfficeLocation,
  deleteOfficeLocation,
  getPrimaryLocation,
  getCompanySettings,
  updateCompanySettings,
  updateWhatsappConfig,
  updateReminders,
} = require('../controllers/settingsController');

// Admin — manage office geo-fence locations
router.get('/office-locations',        protect, adminOnly, getOfficeLocations);
router.post('/office-location',        protect, adminOnly, saveOfficeLocation);
router.delete('/office-location/:id',  protect, adminOnly, deleteOfficeLocation);

// Any authenticated user — used by attendance check-in to get the primary office location
router.get('/primary-location', protect, getPrimaryLocation);

// ─── Company Settings & Configs ─────────────────────────────────────────────
// Public endpoint — returns only company logo and name (no auth needed for login page)
router.get('/public-branding', async (req, res) => {
  try {
    const CompanySettings = require('../models/CompanySettings');
    const settings = await CompanySettings.getSettings();
    res.json({
      success: true,
      data: {
        companyName: settings.companyName || 'Pakka Tourism',
        companyLogo: settings.companyLogo || null,
      }
    });
  } catch (e) {
    res.json({ success: true, data: { companyName: 'Pakka Tourism', companyLogo: null } });
  }
});

router.get('/company',     protect, getCompanySettings);
router.put('/company',     protect, adminOnly, updateCompanySettings);
router.put('/whatsapp',    protect, adminOnly, updateWhatsappConfig);
router.put('/reminders',   protect, adminOnly, updateReminders);

// ─── Company Logo Upload ─────────────────────────────────────────────────────
// POST /api/settings/upload-logo  (multipart/form-data, field: "logo")
router.post('/upload-logo', protect, adminOnly, (req, res) => {
  uploadCompanyLogo(req, res, async (err) => {
    if (err) return res.status(400).json({ success: false, message: err.message });
    if (!req.file) return res.status(400).json({ success: false, message: 'No file uploaded' });

    const logoUrl = `/uploads/company/${req.file.filename}`;
    try {
      const settings = await CompanySettings.getSettings();
      settings.companyLogo = logoUrl;
      await settings.save();
      res.json({ success: true, url: logoUrl, data: settings });
    } catch (e) {
      res.status(500).json({ success: false, message: e.message });
    }
  });
});

module.exports = router;

