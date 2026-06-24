/**
 * itinerary.js — Itinerary CRUD + Image/Video Upload
 * ══════════════════════════════════════════════════════════════════════════
 */
const router   = require('express').Router();
const { protect } = require('../middleware/authMiddleware');
const {
  uploadItineraryImage,
  uploadItineraryVideo,
  uploadItineraryMedia,
  withUpload,
} = require('../middleware/uploadMiddleware');
const Itinerary = require('../models/Itinerary');

// ── GET all itineraries ──────────────────────────────────────────────────────
router.get('/', protect, async (req, res, next) => {
  try {
    const items = await Itinerary.find().sort({ createdAt: -1 });
    res.json({ success: true, data: items });
  } catch (err) { next(err); }
});

// ── POST create itinerary ────────────────────────────────────────────────────
router.post('/', protect, async (req, res, next) => {
  try {
    const it = await Itinerary.create({ ...req.body, createdBy: req.user._id });
    res.status(201).json({ success: true, data: it });
  } catch (err) { next(err); }
});

// ── GET single itinerary ─────────────────────────────────────────────────────
router.get('/:id', protect, async (req, res, next) => {
  try {
    const it = await Itinerary.findById(req.params.id);
    if (!it) return res.status(404).json({ success: false, message: 'Not found' });
    res.json({ success: true, data: it });
  } catch (err) { next(err); }
});

// ── PUT update itinerary ─────────────────────────────────────────────────────
router.put('/:id', protect, async (req, res, next) => {
  try {
    const it = await Itinerary.findByIdAndUpdate(req.params.id, req.body, { new: true });
    res.json({ success: true, data: it });
  } catch (err) { next(err); }
});

// ── DELETE itinerary ─────────────────────────────────────────────────────────
router.delete('/:id', protect, async (req, res, next) => {
  try {
    await Itinerary.findByIdAndDelete(req.params.id);
    res.json({ success: true, message: 'Deleted' });
  } catch (err) { next(err); }
});

// ── POST upload single IMAGE (cover photo, day photo, activity photo) ────────
// POST /api/itinerary/upload-image
// Field name: "image"
// Returns: { success, url, type: 'image' }
router.post('/upload-image', protect, withUpload(uploadItineraryImage), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ success: false, message: 'No file uploaded' });
  }
  const url = `/uploads/itinerary/${req.file.filename}`;
  res.status(201).json({ success: true, url, type: 'image', filename: req.file.filename });
});

// ── POST upload single VIDEO (tour preview, activity clip) ───────────────────
// POST /api/itinerary/upload-video
// Field name: "video"
// Allowed: mp4, mov, webm, avi, mkv — max 200 MB
// Returns: { success, url, type: 'video', size, duration }
router.post('/upload-video', protect, withUpload(uploadItineraryVideo), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ success: false, message: 'No file uploaded' });
  }
  const url = `/uploads/itinerary/${req.file.filename}`;
  res.status(201).json({
    success:  true,
    url,
    type:     'video',
    filename: req.file.filename,
    size:     req.file.size,
    mimeType: req.file.mimetype,
  });
});

// ── POST upload MULTIPLE media files (images + videos mixed) ─────────────────
// POST /api/itinerary/upload-media
// Field name: "media" (up to 5 files)
// Returns: { success, files: [{ url, type, filename }] }
router.post('/upload-media', protect, withUpload(uploadItineraryMedia), (req, res) => {
  if (!req.files || req.files.length === 0) {
    return res.status(400).json({ success: false, message: 'No files uploaded' });
  }

  const files = req.files.map(file => ({
    url:      `/uploads/itinerary/${file.filename}`,
    type:     file.mimetype.startsWith('video/') ? 'video' : 'image',
    filename: file.filename,
    size:     file.size,
    mimeType: file.mimetype,
  }));

  res.status(201).json({ success: true, count: files.length, files });
});

module.exports = router;
