const router = require('express').Router();
const { protect, adminOnly } = require('../middleware/authMiddleware');
const {
  getOfficeLocations,
  saveOfficeLocation,
  deleteOfficeLocation,
  getPrimaryLocation,
} = require('../controllers/settingsController');

// Admin — manage office geo-fence locations
router.get('/office-locations',        protect, adminOnly, getOfficeLocations);
router.post('/office-location',        protect, adminOnly, saveOfficeLocation);
router.delete('/office-location/:id',  protect, adminOnly, deleteOfficeLocation);

// Any authenticated user — used by attendance check-in to get the primary office location
router.get('/primary-location', protect, getPrimaryLocation);

module.exports = router;
