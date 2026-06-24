/**
 * RefreshToken.js
 * ══════════════════════════════════════════════════════════════════════════
 * DB-backed refresh token model for production session management.
 *
 * Why store refresh tokens in DB?
 *  • Allows forced logout / session revocation at any time
 *  • Supports "logout all devices"
 *  • Tracks device info for security audit
 *  • Prevents refresh token replay attacks (one-time use via rotation)
 * ══════════════════════════════════════════════════════════════════════════
 */

const mongoose = require('mongoose');
const crypto   = require('crypto');

const RefreshTokenSchema = new mongoose.Schema({
  userId: {
    type:     mongoose.Schema.Types.ObjectId,
    ref:      'User',
    required: true,
    index:    true,
  },

  // Store only the SHA-256 hash — never store raw token in DB
  tokenHash: {
    type:     String,
    required: true,
    unique:   true,
  },

  expiresAt: {
    type:     Date,
    required: true,
    index:    { expireAfterSeconds: 0 }, // MongoDB TTL auto-delete
  },

  // Session metadata for security audit
  deviceInfo: { type: String, default: 'Unknown' },
  ipAddress:  { type: String, default: '' },
  userAgent:  { type: String, default: '' },

  isRevoked:  { type: Boolean, default: false, index: true },

  // Rotation tracking: each time a refresh token is used, it's replaced
  // Store the hash of the token that replaced this one (for audit trail)
  replacedByHash: { type: String, default: null },

}, { timestamps: true });

// ─── Static helpers ─────────────────────────────────────────────────────────

// Hash a raw token for storage / comparison
RefreshTokenSchema.statics.hashToken = (rawToken) =>
  crypto.createHash('sha256').update(rawToken).digest('hex');

// Create and save a new refresh token record
RefreshTokenSchema.statics.createToken = async function(userId, rawToken, meta = {}) {
  const hash      = this.hashToken(rawToken);
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

  return await this.create({
    userId,
    tokenHash: hash,
    expiresAt,
    deviceInfo: meta.deviceInfo || 'Unknown',
    ipAddress:  meta.ipAddress  || '',
    userAgent:  meta.userAgent  || '',
  });
};

// Find a valid (non-expired, non-revoked) token by raw value
RefreshTokenSchema.statics.findValid = async function(rawToken) {
  const hash = this.hashToken(rawToken);
  return await this.findOne({
    tokenHash:  hash,
    isRevoked:  false,
    expiresAt:  { $gt: new Date() },
  });
};

// Revoke all tokens for a user (logout all sessions)
RefreshTokenSchema.statics.revokeAll = async function(userId) {
  return await this.updateMany(
    { userId, isRevoked: false },
    { $set: { isRevoked: true } }
  );
};

module.exports = mongoose.model('RefreshToken', RefreshTokenSchema);
