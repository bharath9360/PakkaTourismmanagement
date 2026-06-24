const router  = require('express').Router();
const { protect, adminOnly } = require('../middleware/authMiddleware');
const User    = require('../models/User');
const {
  uploadAvatar,
  uploadDocument,
  uploadCompanyLogo,
  deleteFile,
} = require('../middleware/uploadMiddleware');

// ─── GET /api/profile/me ──────────────────────────────────────────────────────
router.get('/me', protect, async (req, res, next) => {
  try {
    const user = await User.findById(req.user._id).select('-password -officeLocations');
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });
    res.json({ success: true, data: user });
  } catch (err) { next(err); }
});

// ─── PUT /api/profile/me — update own profile ─────────────────────────────────
router.put('/me', protect, async (req, res, next) => {
  try {
    const allowedFields = ['name', 'phone', 'dateOfBirth', 'address', 'emergencyContact', 'bloodGroup', 'bankDetails'];
    const updates = {};
    allowedFields.forEach(f => { if (req.body[f] !== undefined) updates[f] = req.body[f]; });

    const user = await User.findByIdAndUpdate(req.user._id, updates, { new: true }).select('-password');
    res.json({ success: true, data: user });
  } catch (err) { next(err); }
});

// ─── POST /api/profile/avatar — upload own profile photo ──────────────────────
router.post('/avatar', protect, uploadAvatar, async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ success: false, message: 'No file uploaded' });
    const url = req.file.path; // Cloudinary CDN URL
    const user = await User.findByIdAndUpdate(req.user._id, { profilePhoto: url }, { new: true }).select('-password');
    res.json({ success: true, data: user, url });
  } catch (err) { next(err); }
});

// ─── POST /api/profile/document — upload aadhaar/certificate ──────────────────
router.post('/document', protect, uploadDocument, async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ success: false, message: 'No file uploaded' });
    const docType = req.body.docType || 'other';
    const docName = req.body.docName || req.file.originalname;
    const url = req.file.path; // Cloudinary CDN URL

    const user = await User.findByIdAndUpdate(
      req.user._id,
      { $push: { documents: { type: docType, name: docName, url, uploadedAt: new Date() } } },
      { new: true }
    ).select('-password');

    res.json({ success: true, data: user });
  } catch (err) { next(err); }
});

// ─── DELETE /api/profile/document/:docId ──────────────────────────────────────
router.delete('/document/:docId', protect, async (req, res, next) => {
  try {
    const user = await User.findById(req.user._id);
    const doc = user.documents.id(req.params.docId);
    if (!doc) return res.status(404).json({ success: false, message: 'Document not found' });

    // Delete from Cloudinary
    await deleteFile(doc.url, 'raw');

    doc.deleteOne();
    await user.save();
    res.json({ success: true, data: user });
  } catch (err) { next(err); }
});

// ─── ADMIN: GET /api/profile/:id — view any employee's profile ────────────────
router.get('/:id', protect, adminOnly, async (req, res, next) => {
  try {
    const user = await User.findById(req.params.id).select('-password -officeLocations');
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });
    res.json({ success: true, data: user });
  } catch (err) { next(err); }
});

// ─── ADMIN: PUT /api/profile/:id — update any employee ────────────────────────
router.put('/:id', protect, adminOnly, async (req, res, next) => {
  try {
    const allowedFields = ['name', 'phone', 'email', 'department', 'designation', 'destination',
      'dateOfBirth', 'address', 'emergencyContact', 'bloodGroup', 'joinDate', 'salary', 'bankDetails', 'workMode'];
    const updates = {};
    allowedFields.forEach(f => { if (req.body[f] !== undefined) updates[f] = req.body[f]; });

    const user = await User.findByIdAndUpdate(req.params.id, updates, { new: true }).select('-password');
    res.json({ success: true, data: user });
  } catch (err) { next(err); }
});

// ─── ADMIN: POST /api/profile/:id/avatar — upload employee photo ──────────────
router.post('/:id/avatar', protect, adminOnly, uploadAvatar, async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ success: false, message: 'No file uploaded' });
    const url = req.file.path; // Cloudinary CDN URL
    const user = await User.findByIdAndUpdate(req.params.id, { profilePhoto: url }, { new: true }).select('-password');
    res.json({ success: true, data: user, url });
  } catch (err) { next(err); }
});

// ─── ADMIN: POST /api/profile/:id/document — upload employee docs ─────────────
router.post('/:id/document', protect, adminOnly, uploadDocument, async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ success: false, message: 'No file uploaded' });
    const docType = req.body.docType || 'other';
    const docName = req.body.docName || req.file.originalname;
    const url = req.file.path; // Cloudinary CDN URL

    const user = await User.findByIdAndUpdate(
      req.params.id,
      { $push: { documents: { type: docType, name: docName, url, uploadedAt: new Date() } } },
      { new: true }
    ).select('-password');

    res.json({ success: true, data: user });
  } catch (err) { next(err); }
});

// ─── ADMIN: DELETE /api/profile/:id/document/:docId ───────────────────────────
router.delete('/:id/document/:docId', protect, adminOnly, async (req, res, next) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });
    const doc = user.documents.id(req.params.docId);
    if (!doc) return res.status(404).json({ success: false, message: 'Document not found' });

    // Delete from Cloudinary
    await deleteFile(doc.url, 'raw');

    doc.deleteOne();
    await user.save();
    res.json({ success: true, data: user });
  } catch (err) { next(err); }
});

// ─── Company Logo Upload ──────────────────────────────────────────────────────
router.post('/company-logo', protect, adminOnly, uploadCompanyLogo, async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ success: false, message: 'No file uploaded' });
    const url = req.file.path; // Cloudinary CDN URL
    await User.findByIdAndUpdate(req.user._id, { 'companyLogo': url });
    res.json({ success: true, url });
  } catch (err) { next(err); }
});

// ─── POST /api/profile/face-register — register own face descriptor ───────────
router.post('/face-register', protect, async (req, res, next) => {
  try {
    const { descriptor, facePhotoDataUrl } = req.body;
    if (!descriptor || !Array.isArray(descriptor) || descriptor.length !== 128) {
      return res.status(400).json({ success: false, message: 'Invalid face descriptor — must be 128-element array' });
    }

    const updates = {
      faceDescriptor: descriptor,
      faceRegistered: true,
      faceRegisteredAt: new Date()
    };

    // If a face photo data URL provided, save it as base64 (small thumbnail)
    if (facePhotoDataUrl && facePhotoDataUrl.startsWith('data:image')) {
      updates.facePhoto = facePhotoDataUrl;
    }

    const user = await User.findByIdAndUpdate(req.user._id, updates, { new: true }).select('-password');
    res.json({ success: true, data: user, message: 'Face registered successfully!' });
  } catch (err) { next(err); }
});

// ─── ADMIN: POST /api/profile/:id/face-register — register employee face ──────
router.post('/:id/face-register', protect, adminOnly, async (req, res, next) => {
  try {
    const { descriptor, facePhotoDataUrl } = req.body;
    if (!descriptor || !Array.isArray(descriptor) || descriptor.length !== 128) {
      return res.status(400).json({ success: false, message: 'Invalid face descriptor — must be 128-element array' });
    }

    const updates = {
      faceDescriptor: descriptor,
      faceRegistered: true,
      faceRegisteredAt: new Date()
    };
    if (facePhotoDataUrl && facePhotoDataUrl.startsWith('data:image')) {
      updates.facePhoto = facePhotoDataUrl;
    }

    const user = await User.findByIdAndUpdate(req.params.id, updates, { new: true }).select('-password');
    if (!user) return res.status(404).json({ success: false, message: 'Employee not found' });
    res.json({ success: true, data: user, message: 'Face registered for employee!' });
  } catch (err) { next(err); }
});

module.exports = router;
