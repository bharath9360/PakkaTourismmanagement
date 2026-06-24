/**
 * server.js — Pakka Tourism CRM — Production-grade Express server
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Security Stack:
 *  • Helmet        — HTTP security headers (XSS, clickjacking, HSTS, etc.)
 *  • cookie-parser — Parse HttpOnly cookies for JWT auth
 *  • CORS          — Restricted to known origins with credentials
 *  • Rate Limiting — Protect login & sensitive endpoints from brute force
 *  • Morgan        — Request logging (dev mode)
 *
 * Auth:
 *  • JWT access token  → HttpOnly cookie `pt_access`  (15 min)
 *  • JWT refresh token → HttpOnly cookie `pt_refresh` (7 days)
 *  • DB-backed refresh token revocation (RefreshToken model)
 *
 * File uploads:
 *  • Multer — images (10 MB), videos (200 MB), documents (20 MB)
 *  • Served statically via /uploads/*
 * ══════════════════════════════════════════════════════════════════════════
 */

const express      = require('express');
const http         = require('http');
const { Server }   = require('socket.io');
const cors         = require('cors');
const morgan       = require('morgan');
const dotenv       = require('dotenv');
const helmet       = require('helmet');
const cookieParser = require('cookie-parser');
const rateLimit    = require('express-rate-limit');
const jwt          = require('jsonwebtoken');
const path         = require('path');
const User         = require('./models/User');
const connectDB    = require('./config/db');
const errorHandler = require('./middleware/errorHandler');

dotenv.config();
connectDB();

const app        = express();
const httpServer = http.createServer(app);

// ─── Allowed origins ──────────────────────────────────────────────────────────
const ALLOWED_ORIGINS = [
  process.env.CLIENT_URL || 'http://localhost:5173',
  'http://localhost:5174',  // Vite alternate port
  'http://localhost:3000',  // CRA fallback
];

const corsOptions = {
  origin: (origin, callback) => {
    // Allow requests with no origin (Postman, curl, server-to-server)
    if (!origin || ALLOWED_ORIGINS.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error(`CORS blocked: ${origin}`));
    }
  },
  credentials:         true,   // Allow cookies to be sent cross-origin
  methods:             ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders:      ['Content-Type', 'Authorization', 'X-Requested-With'],
  exposedHeaders:      ['Set-Cookie'],
};

// ─── Socket.io Setup ──────────────────────────────────────────────────────────
const io = new Server(httpServer, {
  cors: {
    origin:      ALLOWED_ORIGINS,
    methods:     ['GET', 'POST'],
    credentials: true,
  },
});

// Authenticate socket connections via JWT (cookie or handshake auth)
io.use(async (socket, next) => {
  try {
    const token =
      socket.handshake.auth?.token ||
      socket.handshake.headers?.cookie?.match(/pt_access=([^;]+)/)?.[1];

    if (!token) return next(new Error('Authentication required'));
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user    = await User.findById(decoded.id).select('-password');
    if (!user || !user.isActive) return next(new Error('User not found'));
    socket.user = user;
    next();
  } catch (err) {
    next(new Error('Invalid token'));
  }
});

io.on('connection', (socket) => {
  const userId = socket.user._id.toString();
  socket.join(`user_${userId}`);
  console.log(`🔌 Socket connected: ${socket.user.name} (${socket.user.role})`);
  socket.on('disconnect', () => {
    console.log(`🔌 Socket disconnected: ${socket.user.name}`);
  });
});

app.set('io', io);

// ─── Security Middleware ──────────────────────────────────────────────────────

// Helmet — sets ~14 security HTTP headers automatically
app.use(helmet({
  // Allow loading images from same origin and data: URIs (for logo previews)
  contentSecurityPolicy: {
    directives: {
      defaultSrc:  ["'self'"],
      scriptSrc:   ["'self'", "'unsafe-inline'"],  // Vite injects inline scripts
      styleSrc:    ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
      fontSrc:     ["'self'", 'https://fonts.gstatic.com'],
      imgSrc:      ["'self'", 'data:', 'blob:', 'http://localhost:5000'],
      mediaSrc:    ["'self'", 'blob:', 'http://localhost:5000'],
      connectSrc:  ["'self'", 'ws:', 'wss:', 'http://localhost:5000'],
    },
  },
  crossOriginResourcePolicy: { policy: 'cross-origin' }, // Allow uploads to be fetched cross-origin
}));

app.use(cors(corsOptions));
app.options('*', cors(corsOptions)); // Preflight for all routes

// ── Rate Limiters ─────────────────────────────────────────────────────────────

// Login: max 10 attempts per 15 minutes per IP
const loginLimiter = rateLimit({
  windowMs:          15 * 60 * 1000,  // 15 minutes
  max:               10,
  message:           { success: false, message: 'Too many login attempts. Try again after 15 minutes.' },
  standardHeaders:   true,
  legacyHeaders:     false,
  skipSuccessfulRequests: true,  // Only count failed attempts
});

// API general: 200 requests per minute per IP
const generalLimiter = rateLimit({
  windowMs:        60 * 1000,
  max:             200,
  message:         { success: false, message: 'Too many requests. Slow down.' },
  standardHeaders: true,
  legacyHeaders:   false,
});

// ─── Request Parsing ──────────────────────────────────────────────────────────
app.use(cookieParser(process.env.COOKIE_SECRET || process.env.JWT_SECRET));
app.use(express.json({ limit: '10mb' }));                 // JSON body (10 MB max for base64 images)
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

if (process.env.NODE_ENV !== 'test') {
  app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));
}

// ─── Static file serving for uploads ─────────────────────────────────────────
// Served at /uploads/* — accessible publicly (with auth check via middleware where needed)
app.use('/uploads', express.static(path.join(__dirname, 'uploads'), {
  maxAge: process.env.NODE_ENV === 'production' ? '7d' : 0,  // Cache 7 days in prod
  etag:   true,
  dotfiles: 'deny',
}));

// ─── Apply rate limiters ──────────────────────────────────────────────────────
app.use('/api/auth/login',   loginLimiter);   // Strict: login only
app.use('/api',              generalLimiter); // General: all API routes

// ─── API Routes ───────────────────────────────────────────────────────────────
app.use('/api/auth',           require('./routes/auth'));
app.use('/api/attendance',     require('./routes/attendance'));
app.use('/api/leads',          require('./routes/leads'));
app.use('/api/notifications',  require('./routes/notifications'));
app.use('/api/quotes',         require('./routes/quotes'));
app.use('/api/pricing',        require('./routes/pricing'));
app.use('/api/bookings',       require('./routes/bookings'));
app.use('/api/vendors',        require('./routes/vendors'));
app.use('/api/finance',        require('./routes/finance'));
app.use('/api/itinerary',      require('./routes/itinerary'));
app.use('/api/analytics',      require('./routes/analytics'));
app.use('/api/whatsapp',       require('./routes/whatsapp'));
app.use('/api/settings',       require('./routes/settings'));
app.use('/api/exports',        require('./routes/exports'));
app.use('/api/profile',        require('./routes/profile'));

// ─── Health check ─────────────────────────────────────────────────────────────
app.get('/api/health', (req, res) => {
  res.json({
    status:    'OK',
    service:   'Pakka Tourism CRM API',
    version:   '3.0.0',
    env:       process.env.NODE_ENV,
    socket:    'enabled',
    security:  'helmet + rate-limit + httpOnly-cookies',
    timestamp: new Date().toISOString(),
  });
});

// ─── Error Handler (must be last) ────────────────────────────────────────────
app.use(errorHandler);

// ─── Start server ─────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 5000;
httpServer.listen(PORT, () => {
  console.log(`\n🚀 Pakka Tourism CRM Server v3.0.0`);
  console.log(`   Mode:     ${process.env.NODE_ENV}`);
  console.log(`   Port:     ${PORT}`);
  console.log(`   API:      http://localhost:${PORT}/api/health`);
  console.log(`   Security: Helmet + Rate-limit + HttpOnly Cookies`);
  console.log(`   Socket:   enabled (JWT cookie auth)\n`);
});

module.exports = app;
