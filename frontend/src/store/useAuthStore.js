/**
 * useAuthStore.js
 * ═══════════════════════════════════════════════════════════════════════════
 * Zustand auth store — single source of truth for authentication state.
 *
 * Responsibilities:
 *  • Persist JWT token + user object to localStorage on login
 *  • Provide login(), logout(), clearError(), updateUser() actions
 *  • Expose isAuthenticated, user, token, loading, error state slices
 *  • NOT coupled to api.js — login() calls fetch() directly to break the
 *    circular dependency (api.js needs the store; store must not need api.js)
 *
 * Circular-dependency note:
 *   api.js  →  reads token from localStorage  (no store import needed)
 *   api.js  →  calls store.getState().logout() on 401  (safe: getState() is
 *              a stable reference that does not import the module at load time)
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { create } from 'zustand';

// ─── LocalStorage key constants ────────────────────────────────────────────
export const LS_TOKEN = 'pt_token';
export const LS_USER  = 'pt_user';

// ─── Safe localStorage helpers ────────────────────────────────────────────
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
  } catch { /* ignore */ }
};

// ─── Decode JWT payload (no library needed — just base64) ─────────────────
export function decodeJwt(token) {
  try {
    const payload = token.split('.')[1];
    // atob requires padding to be correct
    const padded  = payload.replace(/-/g, '+').replace(/_/g, '/');
    const json    = atob(padded);
    return JSON.parse(json);
  } catch {
    return null;
  }
}

// Returns true if the stored JWT is not yet expired
export function isTokenValid(token) {
  if (!token) return false;
  const decoded = decodeJwt(token);
  if (!decoded?.exp) return false;               // no expiry claim — treat as invalid
  return decoded.exp * 1000 > Date.now();        // exp is in seconds; Date.now() is ms
}

// ─── Rehydrate from localStorage (only if token is still valid) ───────────
const storedToken = lsGet(LS_TOKEN);
const tokenValid  = isTokenValid(storedToken);

const initialState = {
  user:            tokenValid ? lsGet(LS_USER)  : null,
  token:           tokenValid ? storedToken     : null,
  isAuthenticated: tokenValid,
  loading:         false,
  error:           null,
};

// Clear stale data if token has already expired at page load
if (!tokenValid && storedToken) {
  lsClear();
}

// ─── Store ─────────────────────────────────────────────────────────────────
const useAuthStore = create((set, get) => ({
  ...initialState,

  // ── login(credentials) ─────────────────────────────────────────────────
  // Uses the Vite proxy (/api → backend) via plain fetch to avoid importing
  // api.js and creating a circular dependency.
  login: async (credentials) => {
    set({ loading: true, error: null });
    try {
      const res  = await fetch('/api/auth/login', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(credentials),
      });

      const data = await res.json();

      if (!res.ok) {
        const msg = data?.message || `Login failed (${res.status})`;
        set({ error: msg, loading: false });
        throw new Error(msg);
      }

      // ── Validate what the server returned ──────────────────────────────
      if (!data.token) throw new Error('Server did not return a token.');
      if (!data.user)  throw new Error('Server did not return user data.');

      // ── Persist to localStorage ────────────────────────────────────────
      lsSet(LS_TOKEN, data.token);
      lsSet(LS_USER,  data.user);

      // ── Update Zustand state ───────────────────────────────────────────
      set({
        user:            data.user,
        token:           data.token,
        isAuthenticated: true,
        loading:         false,
        error:           null,
      });

      return data;
    } catch (err) {
      // Ensure loading is cleared even for network errors
      set((s) => ({ loading: false, error: s.error || err.message }));
      throw err;
    }
  },

  // ── logout() ───────────────────────────────────────────────────────────
  // Called explicitly by the user OR automatically by the api.js 401 handler.
  // Clears both localStorage AND in-memory Zustand state.
  logout: () => {
    lsClear();
    set({
      user:            null,
      token:           null,
      isAuthenticated: false,
      loading:         false,
      error:           null,
    });
  },

  // ── clearError() ───────────────────────────────────────────────────────
  clearError: () => set({ error: null }),

  // ── updateUser(updates) ────────────────────────────────────────────────
  // Merge partial updates into the user object and re-persist.
  updateUser: (updates) => {
    set((state) => {
      if (!state.user) return {};
      const updated = { ...state.user, ...updates };
      lsSet(LS_USER, updated);
      return { user: updated };
    });
  },

  // ── checkTokenExpiry() ─────────────────────────────────────────────────
  // Call this from App.jsx useEffect or a periodic interval.
  // Logs the user out silently if the JWT has expired.
  checkTokenExpiry: () => {
    const { token, isAuthenticated, logout } = get();
    if (isAuthenticated && token && !isTokenValid(token)) {
      console.warn('[useAuthStore] Token expired — logging out.');
      logout();
      return false;
    }
    return true;
  },
}));

export default useAuthStore;
