/**
 * uploadMiddleware.js — Production-grade Multer configuration
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Supported upload types:
 *  • Images  — jpg, jpeg, png, webp, gif, svg (max 10 MB)
 *  • Videos  — mp4, mov, webm, avi, mkv       (max 200 MB)
 *  • Docs    — pdf, doc, docx, xls, xlsx      (max 20 MB)
 *
 * Folder structure:
 *  uploads/
 *    images/      ← profile photos, logos, itinerary images
 *    videos/      ← tour preview videos, activity clips
 *    documents/   ← employee docs, contracts
 *    company/     ← company logo (kept separate for quick lookup)
 *    itinerary/   ← itinerary-specific media (images + videos)
 *    avatars/     ← employee profile photos
 *
 * Security:
 *  • Double validation: file extension + MIME type both checked
 *  • Random filename prevents path traversal & enumeration
 *  • Size limits enforced per-upload-type
 * ══════════════════════════════════════════════════════════════════════════
 */

const multer = require('multer');
const path   = require('path');
const fs     = require('fs');

// ── Ensure upload folder exists ──────────────────────────────────────────────
const ensureDir = (dir) => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
};

// ── MIME type maps ────────────────────────────────────────────────────────────
const IMAGE_MIMES = new Set([
  'image/jpeg', 'image/jpg', 'image/png', 'image/webp',
  'image/gif',  'image/svg+xml',
]);

const VIDEO_MIMES = new Set([
  'video/mp4', 'video/quicktime', 'video/webm',
  'video/x-msvideo', 'video/x-matroska', 'video/avi',
]);

const DOC_MIMES = new Set([
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
]);

const IMAGE_EXTS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif', '.svg']);
const VIDEO_EXTS = new Set(['.mp4', '.mov', '.webm', '.avi', '.mkv']);
const DOC_EXTS   = new Set(['.pdf', '.doc', '.docx', '.xls', '.xlsx']);

// ── Storage factory ───────────────────────────────────────────────────────────
const makeStorage = (subfolder) =>
  multer.diskStorage({
    destination: (req, file, cb) => {
      const dir = path.join(__dirname, '..', 'uploads', subfolder);
      ensureDir(dir);
      cb(null, dir);
    },
    filename: (req, file, cb) => {
      const ext  = path.extname(file.originalname).toLowerCase();
      const name = `${subfolder}-${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`;
      cb(null, name);
    },
  });

// ── File filters ──────────────────────────────────────────────────────────────

const imageFilter = (req, file, cb) => {
  const ext = path.extname(file.originalname).toLowerCase();
  if (IMAGE_EXTS.has(ext) && IMAGE_MIMES.has(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new multer.MulterError('LIMIT_UNEXPECTED_FILE',
      'Only image files are allowed (jpg, png, webp, gif, svg)'));
  }
};

const videoFilter = (req, file, cb) => {
  const ext = path.extname(file.originalname).toLowerCase();
  if (VIDEO_EXTS.has(ext) && VIDEO_MIMES.has(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new multer.MulterError('LIMIT_UNEXPECTED_FILE',
      'Only video files are allowed (mp4, mov, webm, avi, mkv)'));
  }
};

const docFilter = (req, file, cb) => {
  const ext = path.extname(file.originalname).toLowerCase();
  if (DOC_EXTS.has(ext) && DOC_MIMES.has(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new multer.MulterError('LIMIT_UNEXPECTED_FILE',
      'Only documents are allowed (pdf, doc, docx, xls, xlsx)'));
  }
};

// ── Media filter: images OR videos ───────────────────────────────────────────
const mediaFilter = (req, file, cb) => {
  const ext = path.extname(file.originalname).toLowerCase();
  if (IMAGE_EXTS.has(ext) && IMAGE_MIMES.has(file.mimetype)) {
    cb(null, true);
  } else if (VIDEO_EXTS.has(ext) && VIDEO_MIMES.has(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new multer.MulterError('LIMIT_UNEXPECTED_FILE',
      'Only images (jpg, png, webp) and videos (mp4, mov, webm) are allowed'));
  }
};

// ── Uploader instances ────────────────────────────────────────────────────────

// Company logo — images only, 5 MB
const uploadCompanyLogo = multer({
  storage:    makeStorage('company'),
  fileFilter: imageFilter,
  limits:     { fileSize: 5 * 1024 * 1024 },
}).single('logo');

// Profile avatar — images only, 3 MB
const uploadAvatar = multer({
  storage:    makeStorage('avatars'),
  fileFilter: imageFilter,
  limits:     { fileSize: 3 * 1024 * 1024 },
}).single('avatar');

// Itinerary image — images only, 10 MB (cover photos, day photos)
const uploadItineraryImage = multer({
  storage:    makeStorage('itinerary'),
  fileFilter: imageFilter,
  limits:     { fileSize: 10 * 1024 * 1024 },
}).single('image');

// Itinerary VIDEO — videos only, 200 MB (tour preview clips)
const uploadItineraryVideo = multer({
  storage:    makeStorage('itinerary'),
  fileFilter: videoFilter,
  limits:     { fileSize: 200 * 1024 * 1024 },
}).single('video');

// Itinerary MEDIA — images OR videos, multi-file up to 5 files
const uploadItineraryMedia = multer({
  storage:    makeStorage('itinerary'),
  fileFilter: mediaFilter,
  limits:     { fileSize: 200 * 1024 * 1024, files: 5 },
}).array('media', 5);

// General image upload — images only, 10 MB
const uploadImage = multer({
  storage:    makeStorage('images'),
  fileFilter: imageFilter,
  limits:     { fileSize: 10 * 1024 * 1024 },
}).single('image');

// General video upload — videos only, 200 MB
const uploadVideo = multer({
  storage:    makeStorage('videos'),
  fileFilter: videoFilter,
  limits:     { fileSize: 200 * 1024 * 1024 },
}).single('video');

// Document upload — docs only, 20 MB
const uploadDocument = multer({
  storage:    makeStorage('documents'),
  fileFilter: docFilter,
  limits:     { fileSize: 20 * 1024 * 1024 },
}).single('document');

// ── Promise wrapper — controllers can use async/await ────────────────────────
const runUpload = (uploader) => (req, res) =>
  new Promise((resolve, reject) => {
    uploader(req, res, (err) => {
      if (err instanceof multer.MulterError) {
        // Multer-specific errors: file size, unexpected field, etc.
        reject(Object.assign(err, { statusCode: 400 }));
      } else if (err) {
        reject(err);
      } else {
        resolve();
      }
    });
  });

// ── Middleware error wrapper — use in Express route ───────────────────────────
// Usage: router.post('/upload', withUpload(uploadItineraryImage), handler)
const withUpload = (uploader) => (req, res, next) => {
  uploader(req, res, (err) => {
    if (err instanceof multer.MulterError) {
      return res.status(400).json({
        success: false,
        message: err.message || 'File upload error',
        code:    err.code,
      });
    }
    if (err) {
      return res.status(400).json({ success: false, message: err.message || 'Upload failed' });
    }
    next();
  });
};

// ── Helper: build public URL from uploaded file ───────────────────────────────
const buildFileUrl = (subfolder, filename) => `/uploads/${subfolder}/${filename}`;

// ── Helper: delete uploaded file from disk (e.g. on record delete) ───────────
const deleteFile = (filePath) => {
  const absPath = path.join(__dirname, '..', filePath);
  if (fs.existsSync(absPath)) {
    try { fs.unlinkSync(absPath); } catch (_) {}
  }
};

module.exports = {
  // Specific uploaders
  uploadCompanyLogo,
  uploadAvatar,
  uploadItineraryImage,
  uploadItineraryVideo,
  uploadItineraryMedia,
  uploadImage,
  uploadVideo,
  uploadDocument,

  // Utilities
  runUpload,
  withUpload,
  buildFileUrl,
  deleteFile,
};
