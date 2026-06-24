const router = require('express').Router();
const {
  login, refreshToken, getMe, logout, logoutAll, getSessions,
  register, getUsers, updateUser, resetPassword, toggleStatus, faceRegister
} = require('../controllers/authController');
const { protect, adminOnly } = require('../middleware/authMiddleware');

// ── Public ──────────────────────────────────────────────────────────────────
router.post('/login',        login);
router.post('/refresh',      refreshToken);   // Refresh access token via cookie

// ── Protected ───────────────────────────────────────────────────────────────
router.post('/logout',       protect, logout);
router.post('/logout-all',   protect, logoutAll);   // Kill all sessions
router.get('/me',            protect, getMe);
router.get('/sessions',      protect, getSessions);  // List active sessions

// ── Admin-only employee management ─────────────────────────────────────────
router.post('/register',                  protect, adminOnly, register);
router.get('/users',                      protect, adminOnly, getUsers);
router.put('/users/:id',                  protect, adminOnly, updateUser);
router.put('/users/:id/reset-password',   protect, adminOnly, resetPassword);
router.put('/users/:id/toggle-status',    protect, adminOnly, toggleStatus);
router.put('/users/:id/face-register',    protect, adminOnly, faceRegister);

module.exports = router;
