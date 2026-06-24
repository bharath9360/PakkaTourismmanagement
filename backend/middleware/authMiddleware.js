/**
 * authMiddleware.js — Production-grade JWT auth middleware
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Token source priority:
 *  1. HttpOnly cookie  `pt_access`  (browser clients — most secure)
 *  2. Authorization header `Bearer <token>` (API clients, mobile apps)
 *
 * This dual-source approach ensures backward compatibility with any
 * existing API clients while prioritising the more secure cookie method.
 * ══════════════════════════════════════════════════════════════════════════
 */

const jwt  = require('jsonwebtoken');
const User = require('../models/User');

// ── protect — require valid access token ────────────────────────────────────
const protect = async (req, res, next) => {
  let token;

  // 1. Try HttpOnly cookie first (browser sessions)
  if (req.cookies?.pt_access) {
    token = req.cookies.pt_access;
  }
  // 2. Fallback: Authorization: Bearer <token> (API clients)
  else if (req.headers.authorization?.startsWith('Bearer ')) {
    token = req.headers.authorization.split(' ')[1];
  }

  if (!token) {
    return res.status(401).json({ success: false, message: 'Not authorized — please login' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = await User.findById(decoded.id).select('-password');

    if (!req.user || !req.user.isActive) {
      return res.status(401).json({ success: false, message: 'User not found or deactivated' });
    }

    next();
  } catch (error) {
    // Access token expired — client should use refresh endpoint
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({
        success:  false,
        message:  'Access token expired',
        code:     'TOKEN_EXPIRED',         // Frontend reads this to auto-refresh
      });
    }
    return res.status(401).json({ success: false, message: 'Token invalid' });
  }
};

// ── adminOnly — require admin role ──────────────────────────────────────────
const adminOnly = (req, res, next) => {
  if (req.user?.role === 'admin') return next();
  res.status(403).json({ success: false, message: 'Admin access required' });
};

// ── requireRole — specific role check ───────────────────────────────────────
const requireRole = (...roles) => (req, res, next) => {
  if (roles.includes(req.user?.role)) return next();
  res.status(403).json({ success: false, message: `Access denied. Required: ${roles.join(', ')}` });
};

module.exports = { protect, adminOnly, requireRole };
