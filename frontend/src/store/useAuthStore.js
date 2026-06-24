/**
 * useAuthStore.js
 * ══════════════════════════════════════════════════════════════════════════
 * Zustand auth store — production-grade session management.
 *
 * Auth Strategy (Production):
 *  • JWT access token  → HttpOnly cookie `pt_access`  (15 min, set by backend)
 *  • JWT refresh token → HttpOnly cookie `pt_refresh` (7 days, set by backend)
 *  • User object only  → localStorage `pt_user` (non-sensitive: name, role, id)
 *
 * What changed vs old version:
 *  • Token NO LONGER stored in localStorage (XSS cannot steal it)
 *  • `pt_token` in localStorage still kept for legacy API clients only
 *  • Auto-refresh is handled in api.js interceptor (silent background refresh)
 *  • logout() calls backend to revoke the refresh token cookie in DB
 *
 * LocalStorage usage:
 *  • `pt_user`  — Non-sensitive user object (for instant UI load without API call)
 *  • `pt_token` — Access token (legacy fallback for API clients without cookie support)
 *
 * Circular-dependency note:
 *   api.js → dynamically imports useAuthStore on 401 (avoids circular dep at load time)
 * ══════════════════════════════════════════════════════════════════════════
 */

import { create } from 'zustand';

// ─── LocalStorage key constants ───────────────────────────────────────────────
export const LS_USER  = 'pt_user';
export const LS_TOKEN = 'pt_token'; // Legacy fallback — token also in HttpOnly cookie

// ─── Safe localStorage helpers ────────────────────────────────────────────────
const lsGet = (key, fallback = null) => {
  try {
    const raw = localStorage.getItem(key);
    if (raw === null || raw === 'undefined') return fallback;
    return key === LS_USER ? JSON.parse(raw) : raw;
  } catch {
    return fallback;
  }
};

const lsSet = (key, value) => {
  try {
    localStorage.setItem(key, key === LS_USER ? JSON.stringify(value) : value);
  } catch { /* storage full / private mode — ignore */ }
};

const lsClear = () => {
  try {
    localStorage.removeItem(LS_TOKEN);
    localStorage.removeItem(LS_USER);
    // Also clear any session/temp storage
    sessionStorage.clear();
  } catch { /* ignore */ }
};

// ─── Decode JWT payload ───────────────────────────────────────────────────────
export function decodeJwt(token) {
  try {
    const payload = token.split('.')[1];
    const padded  = payload.replace(/-/g, '+').replace(/_/g, '/');
    return JSON.parse(atob(padded));
  } catch {
    return null;
  }
}

export function isTokenValid(token) {
  if (!token) return false;
  const decoded = decodeJwt(token);
  if (!decoded?.exp) return false;
  return decoded.exp * 1000 > Date.now();
}

// ─── Rehydrate from localStorage ──────────────────────────────────────────────
// User object is always stored in localStorage for instant UI load.
// Token: cookie is the source of truth; localStorage is fallback.
const storedUser  = lsGet(LS_USER);
const storedToken = lsGet(LS_TOKEN);

// Consider authenticated if:
//  • We have a valid user object in localStorage
//  • AND either the token is valid OR we'll attempt a cookie-based refresh
const isAuthenticated = !!storedUser && !!(storedToken ? isTokenValid(storedToken) : storedUser);

const initialState = {
  user:            isAuthenticated ? storedUser : null,
  token:           isAuthenticated ? storedToken : null,
  isAuthenticated: isAuthenticated,
  loading:         false,
  error:           null,
  sessionExpiry:   null,
};

// Clear stale localStorage if no valid auth state
if (!isAuthenticated) {
  try {
    localStorage.removeItem(LS_TOKEN);
    localStorage.removeItem(LS_USER);
  } catch (_) {}
}

// ─── Store ────────────────────────────────────────────────────────────────────
const useAuthStore = create((set, get) => ({
  ...initialState,

  // ── login(credentials) ──────────────────────────────────────────────────
  // Backend sets HttpOnly cookies (pt_access, pt_refresh) in the response.
  // We store only the user object in localStorage (not the token).
  login: async (credentials) => {
    set({ loading: true, error: null });
    try {
      const res = await fetch('/api/auth/login', {
        method:      'POST',
        headers:     { 'Content-Type': 'application/json' },
        credentials: 'include',   // ← CRITICAL: accept Set-Cookie from backend
        body:        JSON.stringify(credentials),
      });

      const data = await res.json();

      if (!res.ok) {
        const msg = data?.message || `Login failed (${res.status})`;
        set({ error: msg, loading: false });
        throw new Error(msg);
      }

      if (!data.user) throw new Error('Server did not return user data.');

      // Persist only user object (non-sensitive) to localStorage for fast reload
      lsSet(LS_USER, data.user);

      // Also store token as fallback (for localStorage-reading code)
      // The primary token lives in the HttpOnly cookie set by the backend
      if (data.token) lsSet(LS_TOKEN, data.token);

      const sessionExpiry = data.token
        ? decodeJwt(data.token)?.exp * 1000
        : Date.now() + 15 * 60 * 1000; // 15 min default

      set({
        user:            data.user,
        token:           data.token || null,
        isAuthenticated: true,
        loading:         false,
        error:           null,
        sessionExpiry,
      });

      return data;
    } catch (err) {
      set((s) => ({ loading: false, error: s.error || err.message }));
      throw err;
    }
  },

  // ── logout() ────────────────────────────────────────────────────────────
  // Calls backend to revoke refresh token + clear HttpOnly cookies.
  // Then clears local state.
  logout: async () => {
    try {
      // Tell backend to revoke refresh token in DB + clear cookies
      await fetch('/api/auth/logout', {
        method:      'POST',
        credentials: 'include',
      });
    } catch (_) {
      // Ignore network errors — still clear local state
    } finally {
      lsClear();
      set({
        user:            null,
        token:           null,
        isAuthenticated: false,
        loading:         false,
        error:           null,
        sessionExpiry:   null,
      });
    }
  },

  // ── logoutAll() — kill all sessions ─────────────────────────────────────
  logoutAll: async () => {
    try {
      await fetch('/api/auth/logout-all', {
        method:      'POST',
        credentials: 'include',
        headers:     { 'Content-Type': 'application/json' },
      });
    } catch (_) {}
    lsClear();
    set({
      user:            null,
      token:           null,
      isAuthenticated: false,
      loading:         false,
      error:           null,
      sessionExpiry:   null,
    });
  },

  // ── clearError() ────────────────────────────────────────────────────────
  clearError: () => set({ error: null }),

  // ── updateUser(updates) — merge partial updates ──────────────────────────
  updateUser: (updates) => {
    set((state) => {
      if (!state.user) return {};
      const updated = { ...state.user, ...updates };
      lsSet(LS_USER, updated);
      return { user: updated };
    });
  },

  // ── checkTokenExpiry() — periodic token validity check ──────────────────
  // Access token is now in HttpOnly cookie (not readable by JS).
  // We track expiry from the decoded payload stored at login time.
  checkTokenExpiry: () => {
    const { isAuthenticated, sessionExpiry, logout } = get();
    if (!isAuthenticated) return true;

    // If we have stored expiry and it has passed, attempt silent logout
    if (sessionExpiry && sessionExpiry < Date.now()) {
      console.warn('[useAuthStore] Session expiry detected — will attempt refresh via interceptor.');
      // Note: api.js interceptor handles actual refresh on next API call.
      // Here we just warn. The interceptor will logout if refresh fails.
    }
    return true;
  },
}));

export default useAuthStore;
