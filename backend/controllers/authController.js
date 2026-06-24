const jwt          = require('jsonwebtoken');
const crypto       = require('crypto');
const User         = require('../models/User');
const RefreshToken = require('../models/RefreshToken');

// ─── Token generators ─────────────────────────────────────────────────────────

const generateAccessToken = (id) =>
  jwt.sign({ id }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_ACCESS_EXPIRE || '15m',
  });

const generateRefreshToken = () =>
  crypto.randomBytes(64).toString('hex');

// ─── Cookie options ───────────────────────────────────────────────────────────

const ACCESS_COOKIE_OPTS = {
  httpOnly: true,                                       // JS cannot read — XSS safe
  secure:   process.env.NODE_ENV === 'production',      // HTTPS only in prod
  sameSite: process.env.NODE_ENV === 'production' ? 'strict' : 'lax',
  maxAge:   15 * 60 * 1000,                             // 15 minutes in ms
  path:     '/',
};

const REFRESH_COOKIE_OPTS = {
  httpOnly: true,
  secure:   process.env.NODE_ENV === 'production',
  sameSite: process.env.NODE_ENV === 'production' ? 'strict' : 'lax',
  maxAge:   7 * 24 * 60 * 60 * 1000,                   // 7 days
  path:     '/',
};

// ─── Helper: set auth cookies + return clean user data ───────────────────────

async function issueTokens(res, user, meta = {}) {
  const accessToken  = generateAccessToken(user._id);
  const rawRefresh   = generateRefreshToken();

  // Persist hashed refresh token in DB
  await RefreshToken.createToken(user._id, rawRefresh, meta);

  // Set HttpOnly cookies
  res.cookie('pt_access',  accessToken, ACCESS_COOKIE_OPTS);
  res.cookie('pt_refresh', rawRefresh,  REFRESH_COOKIE_OPTS);

  return accessToken;
}

// ─── @desc   Login ────────────────────────────────────────────────────────────
// @route  POST /api/auth/login
const login = async (req, res, next) => {
  try {
    const { email, password, role, workMode, geoLocation } = req.body;

    if (!email || !password)
      return res.status(400).json({ success: false, message: 'Login ID and password required' });

    const user = await User.findOne({ email }).select('+password');
    if (!user || !user.isActive)
      return res.status(401).json({ success: false, message: 'Invalid credentials or account disabled' });

    const isMatch = await user.matchPassword(password);
    if (!isMatch)
      return res.status(401).json({ success: false, message: 'Invalid credentials' });

    // Role validation
    if (role && user.role !== role) {
      return res.status(403).json({
        success: false,
        message: role === 'admin'
          ? 'This account does not have admin access'
          : 'This account is not registered as an employee. Contact Admin.',
      });
    }

    // Employee-specific geo/work-mode handling
    if (user.role === 'employee') {
      if (workMode) user.workMode = workMode;
      if (geoLocation) {
        user.geoLocation = geoLocation;
        if (workMode === 'office' && user.officeLocation) {
          const distance = getDistance(
            geoLocation.lat, geoLocation.lng,
            user.officeLocation.lat, user.officeLocation.lng
          );
          if (distance > (user.officeLocation.radius || 500)) {
            return res.status(403).json({
              success: false,
              message: `You are ${Math.round(distance)}m away from office. Must be within ${user.officeLocation.radius || 500}m for In-Office attendance.`,
            });
          }
        }
      }
    }

    user.lastLogin = new Date();
    await user.save({ validateBeforeSave: false });

    // Issue tokens as HttpOnly cookies
    const meta = {
      ipAddress:  req.ip || req.connection.remoteAddress || '',
      userAgent:  req.headers['user-agent'] || '',
      deviceInfo: req.headers['user-agent']?.substring(0, 100) || 'Unknown',
    };
    const accessToken = await issueTokens(res, user, meta);

    res.json({
      success: true,
      // Also return token in body for legacy / API clients that can't use cookies
      token: accessToken,
      user: user.toJSON(),
    });
  } catch (err) { next(err); }
};

// ─── @desc   Refresh access token ─────────────────────────────────────────────
// @route  POST /api/auth/refresh
const refreshToken = async (req, res, next) => {
  try {
    const rawRefresh = req.cookies?.pt_refresh;

    if (!rawRefresh) {
      return res.status(401).json({ success: false, message: 'No refresh token' });
    }

    // Find valid token in DB
    const tokenDoc = await RefreshToken.findValid(rawRefresh);
    if (!tokenDoc) {
      // Token not found / revoked / expired — clear cookies
      res.clearCookie('pt_access',  { path: '/' });
      res.clearCookie('pt_refresh', { path: '/' });
      return res.status(401).json({ success: false, message: 'Refresh token invalid or expired. Please login again.' });
    }

    // Verify user still exists and is active
    const user = await User.findById(tokenDoc.userId).select('-password');
    if (!user || !user.isActive) {
      await RefreshToken.revokeAll(tokenDoc.userId);
      res.clearCookie('pt_access',  { path: '/' });
      res.clearCookie('pt_refresh', { path: '/' });
      return res.status(401).json({ success: false, message: 'User not found or deactivated' });
    }

    // ── Token Rotation: revoke old token, issue new one ──
    tokenDoc.isRevoked = true;
    tokenDoc.replacedByHash = RefreshToken.hashToken(crypto.randomBytes(4).toString('hex')); // placeholder
    await tokenDoc.save();

    // Issue new token pair
    const meta = {
      ipAddress:  req.ip || '',
      userAgent:  req.headers['user-agent'] || '',
      deviceInfo: req.headers['user-agent']?.substring(0, 100) || 'Unknown',
    };
    const newAccessToken = await issueTokens(res, user, meta);

    res.json({
      success: true,
      token: newAccessToken,
      user: user.toJSON(),
    });
  } catch (err) { next(err); }
};

// ─── @desc   Get current user ──────────────────────────────────────────────────
// @route  GET /api/auth/me
const getMe = async (req, res) => {
  res.json({ success: true, user: req.user });
};

// ─── @desc   Logout (current session) ─────────────────────────────────────────
// @route  POST /api/auth/logout
const logout = async (req, res) => {
  try {
    const rawRefresh = req.cookies?.pt_refresh;
    if (rawRefresh) {
      // Revoke this specific refresh token in DB
      const tokenDoc = await RefreshToken.findOne({
        tokenHash: RefreshToken.hashToken(rawRefresh),
      });
      if (tokenDoc) {
        tokenDoc.isRevoked = true;
        await tokenDoc.save();
      }
    }

    // Clear HttpOnly cookies
    res.clearCookie('pt_access',  { path: '/', httpOnly: true });
    res.clearCookie('pt_refresh', { path: '/', httpOnly: true });

    res.json({ success: true, message: 'Logged out successfully' });
  } catch (err) {
    res.clearCookie('pt_access',  { path: '/', httpOnly: true });
    res.clearCookie('pt_refresh', { path: '/', httpOnly: true });
    res.json({ success: true, message: 'Logged out' });
  }
};

// ─── @desc   Logout ALL sessions ──────────────────────────────────────────────
// @route  POST /api/auth/logout-all
const logoutAll = async (req, res, next) => {
  try {
    await RefreshToken.revokeAll(req.user._id);
    res.clearCookie('pt_access',  { path: '/', httpOnly: true });
    res.clearCookie('pt_refresh', { path: '/', httpOnly: true });
    res.json({ success: true, message: 'All sessions terminated' });
  } catch (err) { next(err); }
};

// ─── @desc   Get active sessions ──────────────────────────────────────────────
// @route  GET /api/auth/sessions
const getSessions = async (req, res, next) => {
  try {
    const sessions = await RefreshToken.find({
      userId:    req.user._id,
      isRevoked: false,
      expiresAt: { $gt: new Date() },
    }).select('deviceInfo ipAddress createdAt expiresAt').sort({ createdAt: -1 });

    res.json({ success: true, count: sessions.length, data: sessions });
  } catch (err) { next(err); }
};

// ─── Haversine distance (meters) ─────────────────────────────────────────────
function getDistance(lat1, lon1, lat2, lon2) {
  const R    = 6371000;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a    = Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180) * Math.cos(lat2*Math.PI/180) * Math.sin(dLon/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

// ─── Admin-only employee management ──────────────────────────────────────────

const register = async (req, res, next) => {
  try {
    const { name, email, password, department, phone, destination } = req.body;
    const existing = await User.findOne({ email });
    if (existing) return res.status(400).json({ success: false, message: 'Email already registered' });

    const user = await User.create({
      name, email, password,
      role: 'employee',
      department, phone, destination,
      faceRegistered: false,
    });
    res.status(201).json({ success: true, data: user.toJSON() });
  } catch (err) { next(err); }
};

const getUsers = async (req, res, next) => {
  try {
    const users = await User.find({ role: 'employee' }).sort({ createdAt: -1 });
    res.json({ success: true, count: users.length, data: users });
  } catch (err) { next(err); }
};

const updateUser = async (req, res, next) => {
  try {
    const user = await User.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });
    res.json({ success: true, data: user });
  } catch (err) { next(err); }
};

const resetPassword = async (req, res, next) => {
  try {
    const { password } = req.body;
    if (!password) return res.status(400).json({ success: false, message: 'Password required' });
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });
    user.password = password;
    await user.save();
    res.json({ success: true, message: 'Password reset successfully' });
  } catch (err) { next(err); }
};

const toggleStatus = async (req, res, next) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });
    user.isActive = !user.isActive;
    if (!user.isActive) {
      // Revoke all sessions when deactivating
      await RefreshToken.revokeAll(user._id);
    }
    await user.save({ validateBeforeSave: false });
    res.json({ success: true, data: user, message: `Employee ${user.isActive ? 'enabled' : 'disabled'}` });
  } catch (err) { next(err); }
};

const faceRegister = async (req, res, next) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });
    user.faceRegistered    = true;
    user.faceRegisteredAt  = new Date();
    await user.save({ validateBeforeSave: false });
    res.json({ success: true, data: user, message: 'Face ID registered successfully' });
  } catch (err) { next(err); }
};

module.exports = {
  login, refreshToken, getMe, logout, logoutAll, getSessions,
  register, getUsers, updateUser, resetPassword, toggleStatus, faceRegister,
};
