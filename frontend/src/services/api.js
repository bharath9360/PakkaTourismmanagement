/**
 * api.js — Axios instance for Pakka Tourism CRM
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Task 1 — Request interceptor:
 *   Reads the JWT token from localStorage and attaches
 *   "Authorization: Bearer <token>" to every outgoing request.
 *   Reading from localStorage (not from Zustand state) is intentional —
 *   it avoids importing the store here and creating a circular dependency.
 *
 * Task 2 — Response interceptor (401 handler):
 *   On a 401 Unauthorized response:
 *     1. Calls useAuthStore.getState().logout() — clears Zustand + localStorage
 *     2. Redirects to /login using a programmatic navigation helper
 *        that works outside React components (no window.location.href hack
 *        which would destroy client-side router state)
 *
 * Why we read token from localStorage instead of Zustand:
 *   api.js is a singleton module. If it imported useAuthStore, and
 *   useAuthStore imported api.js, Node's module system would give one of
 *   them an incomplete reference — a classic circular-dependency bug.
 *   Reading localStorage directly is the correct pattern for Axios interceptors.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 */

import axios from 'axios';
import { LS_TOKEN } from '../store/useAuthStore';

// ─── Programmatic navigation helper ───────────────────────────────────────
// We cannot call useNavigate() outside a React component tree.
// Instead, we export a mutable `navigate` ref that App.jsx will populate
// once the BrowserRouter is mounted. api.js then calls navigate() when it
// needs to redirect on 401. This is the canonical React Router v6 pattern
// for navigation outside components.
export let navigateFn = null;
export const setNavigateFn = (fn) => { navigateFn = fn; };

// ─── Axios Instance ────────────────────────────────────────────────────────
const api = axios.create({
  baseURL: '/api',
  headers: { 'Content-Type': 'application/json' },
  timeout: 30_000,   // 30s — prevents hanging requests
});

// ─── REQUEST INTERCEPTOR — Attach JWT Bearer token ─────────────────────────
api.interceptors.request.use(
  (config) => {
    // Always read fresh from localStorage so that:
    //  (a) we pick up new tokens after a silent refresh, and
    //  (b) we avoid the circular-import problem
    const token = localStorage.getItem(LS_TOKEN);
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error),
);

// ─── RESPONSE INTERCEPTOR — Handle 401 Unauthorized globally ───────────────
// De-duplication flag: if a 401 logout is already in progress, don't run it
// again for concurrent in-flight requests that also come back as 401.
let isLoggingOut = false;

api.interceptors.response.use(
  // ── Success passthrough ──
  (response) => response,

  // ── Error handler ──
  async (error) => {
    const status = error.response?.status;

    if (status === 401 && !isLoggingOut) {
      isLoggingOut = true;

      // 1. Import the store lazily to avoid a top-level circular dependency.
      //    Dynamic import() resolves AFTER both modules have fully loaded.
      const { default: useAuthStore } = await import('../store/useAuthStore');

      // 2. Clear Zustand state AND localStorage
      useAuthStore.getState().logout();

      // 3. Navigate to /login via React Router (preserves SPA state)
      //    Falls back to hard redirect only if navigateFn wasn't set yet
      //    (e.g., a very early request before App mounts)
      if (navigateFn) {
        navigateFn('/login', { replace: true });
      } else {
        window.location.href = '/login';
      }

      // Reset flag after a short delay so future logins work correctly
      setTimeout(() => { isLoggingOut = false; }, 2000);
    }

    return Promise.reject(error);
  },
);

// ─────────────────────────────────────────────────────────────────────────────
// Blob download helper — creates a hidden <a> tag, triggers click, then cleans up
// ─────────────────────────────────────────────────────────────────────────────
function triggerBlobDownload(blob, filename) {
  const objectUrl = window.URL.createObjectURL(blob);
  const anchor    = document.createElement('a');
  anchor.href           = objectUrl;
  anchor.download       = filename;
  anchor.style.display  = 'none';
  document.body.appendChild(anchor);
  anchor.click();
  // Revoke after a tick so the browser has time to start the download
  setTimeout(() => {
    window.URL.revokeObjectURL(objectUrl);
    document.body.removeChild(anchor);
  }, 100);
}

// ─────────────────────────────────────────────────────────────────────────────
// GET-based file download
//
// Usage:
//   import { downloadFile } from '../../services/api';
//   await downloadFile('/exports/leads', 'Leads.xlsx', { from, to });
// ─────────────────────────────────────────────────────────────────────────────
export async function downloadFile(endpoint, filename, params = {}) {
  const response = await api.get(endpoint, {
    params,
    responseType: 'blob',   // Critical — tells Axios NOT to parse as JSON/text
  });

  // Honour server-provided filename from Content-Disposition header
  const cd = response.headers['content-disposition'];
  if (cd) {
    const match = cd.match(/filename[^;=\n]*=['"]?([^'";\n]+)['"]?/);
    if (match?.[1]) filename = match[1].trim();
  }

  triggerBlobDownload(response.data, filename);
}

// ─────────────────────────────────────────────────────────────────────────────
// POST-based file download (for endpoints that need a request body)
//
// Usage:
//   import { downloadFilePost } from '../../services/api';
//   await downloadFilePost('/exports/custom', 'Report.xlsx', { ids: [...] });
// ─────────────────────────────────────────────────────────────────────────────
export async function downloadFilePost(endpoint, filename, body = {}) {
  const response = await api.post(endpoint, body, {
    responseType: 'blob',
  });

  const cd = response.headers['content-disposition'];
  if (cd) {
    const match = cd.match(/filename[^;=\n]*=['"]?([^'";\n]+)['"]?/);
    if (match?.[1]) filename = match[1].trim();
  }

  triggerBlobDownload(response.data, filename);
}

export default api;
